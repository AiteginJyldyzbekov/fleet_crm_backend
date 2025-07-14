import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsQueryDto, DateRange } from './dto/analytics-query.dto';
import { FinancialSummary, TimeSeriesData } from './interfaces/analytics.interface';
import { PaymentType } from '@prisma/client';

@Injectable()
export class FinancialAnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getFinancialSummary(
    companyId: string,
    query: AnalyticsQueryDto,
  ): Promise<FinancialSummary> {
    const { startDate, endDate } = this.getDateRange(query);
    
    const whereClause = {
      companyId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    // Параллельные запросы для оптимизации
    const [
      revenueData,
      expenseData,
      driverDebts,
      driverCount,
      vehicleCount,
    ] = await Promise.all([
      this.getRevenueData(whereClause),
      this.getExpenseData(whereClause),
      this.getDriverDebts(companyId),
      this.getActiveDriverCount(companyId),
      this.getActiveVehicleCount(companyId),
    ]);

    const totalRevenue = revenueData.reduce((sum, item) => {
      return sum + Number(item._sum?.amount || 0);
    }, 0);
    
    const totalExpenses = expenseData.reduce((sum, item) => {
      return sum + Number(item._sum?.amount || 0);
    }, 0);
    const profit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalExpenses,
      profit,
      profitMargin,
      revenueByType: this.groupRevenueByType(revenueData),
      expensesByCategory: this.groupExpensesByCategory(expenseData),
      outstandingDebts: driverDebts,
      averageRevenuePerDriver: driverCount > 0 ? totalRevenue / driverCount : 0,
      averageRevenuePerVehicle: vehicleCount > 0 ? totalRevenue / vehicleCount : 0,
    };
  }

  async getRevenueTimeSeries(
    companyId: string,
    query: AnalyticsQueryDto,
  ): Promise<TimeSeriesData[]> {
    const { startDate, endDate } = this.getDateRange(query);
    
    const dailyRevenue = await this.prisma.payment.groupBy({
      by: ['createdAt'],
      where: {
        companyId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        type: {
          in: [PaymentType.PAYMENT, PaymentType.DAILY_RENT], // Только доходы
        },
      },
      _sum: {
        amount: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const dailyExpenses = await this.prisma.expense.groupBy({
      by: ['date'],
      where: {
        companyId,
        paidBy: 'COMPANY', // Только расходы автопарка
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        amount: true,
      },
      orderBy: {
        date: 'asc',
      },
    });

    // Объединяем данные по дням
    const result = this.mergeDailyData(dailyRevenue, dailyExpenses, startDate, endDate);
    
    // Добавляем данные об активных авто и водителях
    for (const item of result) {
      const date = new Date(item.date);
      const [activeVehicles, activeDrivers] = await Promise.all([
        this.getActiveVehiclesOnDate(companyId, date),
        this.getActiveDriversOnDate(companyId, date),
      ]);
      
      item.activeVehicles = activeVehicles;
      item.activeDrivers = activeDrivers;
      item.utilization = activeVehicles > 0 ? (activeVehicles / await this.getTotalVehicleCount(companyId)) * 100 : 0;
    }

    return result;
  }

  async getRevenueByDriver(
    companyId: string,
    query: AnalyticsQueryDto,
  ): Promise<Array<{ driverId: string; name: string; revenue: number; contracts: number }>> {
    const { startDate, endDate } = this.getDateRange(query);

    const revenueByDriver = await this.prisma.payment.groupBy({
      by: ['driverId'],
      where: {
        companyId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        type: {
          in: [PaymentType.PAYMENT, PaymentType.DAILY_RENT], // Только доходы
        },
        driverId: {
          not: undefined,
        },
      },
      _sum: {
        amount: true,
      },
      orderBy: {
        _sum: {
          amount: 'desc',
        },
      },
    });

    const result: Array<{ driverId: string; name: string; revenue: number; contracts: number }> = [];
    
    for (const item of revenueByDriver) {
      const driver = await this.prisma.driver.findUnique({
        where: { id: item.driverId },
        select: { firstName: true, lastName: true, totalContracts: true },
      });

      if (driver) {
        result.push({
          driverId: item.driverId,
          name: `${driver.firstName} ${driver.lastName}`,
          revenue: Number(item._sum?.amount || 0),
          contracts: driver.totalContracts,
        });
      }
    }

    return result;
  }

  async getRevenueByVehicle(
    companyId: string,
    query: AnalyticsQueryDto,
  ): Promise<Array<{ vehicleId: string; model: string; plateNumber: string; revenue: number; expenses: number; profit: number }>> {
    const { startDate, endDate } = this.getDateRange(query);

    // Доходы по авто через контракты
    const revenueByVehicle = await this.prisma.contract.groupBy({
      by: ['vehicleId'],
      where: {
        companyId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        totalRevenue: true,
      },
      orderBy: {
        _sum: {
          totalRevenue: 'desc',
        },
      },
    });

    const result: Array<{ vehicleId: string; model: string; plateNumber: string; revenue: number; expenses: number; profit: number }> = [];
    
    for (const item of revenueByVehicle) {
      const [vehicle, expenses] = await Promise.all([
        this.prisma.vehicle.findUnique({
          where: { id: item.vehicleId },
          select: { model: true, plateNumber: true },
        }),
        this.prisma.expense.aggregate({
          where: {
            companyId,
            vehicleId: item.vehicleId,
            paidBy: 'COMPANY', // Только расходы автопарка
            date: {
              gte: startDate,
              lte: endDate,
            },
          },
          _sum: {
            amount: true,
          },
        }),
      ]);

      if (vehicle) {
        const revenue = Number(item._sum?.totalRevenue || 0);
        const expenseAmount = Number(expenses._sum?.amount || 0);
        
        result.push({
          vehicleId: item.vehicleId,
          model: vehicle.model,
          plateNumber: vehicle.plateNumber,
          revenue,
          expenses: expenseAmount,
          profit: revenue - expenseAmount,
        });
      }
    }

    return result;
  }

  async getCashFlowForecast(
    companyId: string,
    days: number = 30,
  ): Promise<Array<{ date: string; expectedRevenue: number; expectedExpenses: number; cashFlow: number }>> {
    // Получаем активные контракты
    const activeContracts = await this.prisma.contract.findMany({
      where: {
        companyId,
        status: 'ACTIVE',
      },
      select: {
        dailyRate: true,
        endDate: true,
      },
    });

    // Получаем исторические данные по расходам для прогноза
    const historicalExpenses = await this.prisma.expense.groupBy({
      by: ['date'],
      where: {
        companyId,
        paidBy: 'COMPANY',
        date: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // последние 30 дней
        },
      },
      _sum: {
        amount: true,
      },
    });

    const avgDailyExpenses = historicalExpenses.length > 0 
      ? historicalExpenses.reduce((sum, item) => sum + Number(item._sum?.amount || 0), 0) / historicalExpenses.length
      : 0;

    const forecast: Array<{ date: string; expectedRevenue: number; expectedExpenses: number; cashFlow: number }> = [];
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      
      // Рассчитываем ожидаемый доход с активных контрактов
      const expectedRevenue = activeContracts
        .filter(contract => !contract.endDate || contract.endDate > date)
        .reduce((sum, contract) => sum + Number(contract.dailyRate), 0);
      
      const expectedExpenses = avgDailyExpenses;
      
      forecast.push({
        date: date.toISOString().split('T')[0],
        expectedRevenue,
        expectedExpenses,
        cashFlow: expectedRevenue - expectedExpenses,
      });
    }

    return forecast;
  }

  // Приватные методы
  private async getRevenueData(whereClause: any) {
    return this.prisma.payment.groupBy({
      by: ['type'],
      where: {
        ...whereClause,
        type: {
          in: [PaymentType.PAYMENT, PaymentType.DAILY_RENT], // Только доходы
        },
      },
      _sum: {
        amount: true,
      },
    });
  }

  private async getExpenseData(whereClause: any) {
    return this.prisma.expense.groupBy({
      by: ['category'],
      where: {
        companyId: whereClause.companyId,
        paidBy: 'COMPANY', // Только расходы автопарка
        date: whereClause.createdAt,
      },
      _sum: {
        amount: true,
      },
    });
  }

  private async getDriverDebts(companyId: string): Promise<number> {
    const result = await this.prisma.driver.aggregate({
      where: {
        companyId,
        balance: {
          lt: 0,
        },
      },
      _sum: {
        balance: true,
      },
    });

    return Math.abs(Number(result._sum?.balance || 0));
  }

  private async getActiveDriverCount(companyId: string): Promise<number> {
    return this.prisma.driver.count({
      where: {
        companyId,
        isActive: true,
      },
    });
  }

  private async getActiveVehicleCount(companyId: string): Promise<number> {
    return this.prisma.vehicle.count({
      where: {
        companyId,
        status: 'RENTED',
      },
    });
  }

  private async getTotalVehicleCount(companyId: string): Promise<number> {
    return this.prisma.vehicle.count({
      where: {
        companyId,
        status: {
          not: 'INACTIVE',
        },
      },
    });
  }

  private async getActiveVehiclesOnDate(companyId: string, date: Date): Promise<number> {
    return this.prisma.contract.count({
      where: {
        companyId,
        status: 'ACTIVE',
        startDate: {
          lte: date,
        },
        OR: [
          { endDate: null },
          { endDate: { gte: date } },
        ],
      },
    });
  }

  private async getActiveDriversOnDate(companyId: string, date: Date): Promise<number> {
    return this.prisma.contract.count({
      where: {
        companyId,
        status: 'ACTIVE',
        startDate: {
          lte: date,
        },
        OR: [
          { endDate: null },
          { endDate: { gte: date } },
        ],
      },
    });
  }

  private groupRevenueByType(data: any[]): Record<string, number> {
    return data.reduce((acc, item) => {
      acc[item.type] = Number(item._sum?.amount || 0);
      return acc;
    }, {});
  }

  private groupExpensesByCategory(data: any[]): Record<string, number> {
    return data.reduce((acc, item) => {
      acc[item.category] = Number(item._sum?.amount || 0);
      return acc;
    }, {});
  }

  private mergeDailyData(
    revenueData: any[],
    expenseData: any[],
    startDate: Date,
    endDate: Date,
  ): TimeSeriesData[] {
    const result: TimeSeriesData[] = [];
    const revenueMap = new Map<string, number>();
    const expenseMap = new Map<string, number>();

    // Создаем карты для быстрого доступа
    revenueData.forEach(item => {
      const dateKey = item.createdAt.toISOString().split('T')[0];
      revenueMap.set(dateKey, Number(item._sum?.amount || 0));
    });

    expenseData.forEach(item => {
      const dateKey = item.date.toISOString().split('T')[0];
      expenseMap.set(dateKey, Number(item._sum?.amount || 0));
    });

    // Генерируем данные для каждого дня в диапазоне
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().split('T')[0];
      const revenue = revenueMap.get(dateKey) || 0;
      const expenses = expenseMap.get(dateKey) || 0;

      result.push({
        date: dateKey,
        revenue,
        expenses,
        profit: revenue - expenses,
        activeVehicles: 0, // Будет заполнено позже
        activeDrivers: 0, // Будет заполнено позже
        utilization: 0, // Будет заполнено позже
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return result;
  }

  private getDateRange(query: AnalyticsQueryDto): { startDate: Date; endDate: Date } {
    const now = new Date();
    const endDate = query.endDate ? new Date(query.endDate) : now;
    let startDate: Date;

    switch (query.range) {
      case DateRange.LAST_7_DAYS:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case DateRange.LAST_30_DAYS:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case DateRange.LAST_90_DAYS:
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case DateRange.THIS_MONTH:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case DateRange.THIS_YEAR:
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case DateRange.CUSTOM:
        startDate = query.startDate ? new Date(query.startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return { startDate, endDate };
  }
}