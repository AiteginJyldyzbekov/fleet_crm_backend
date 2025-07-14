import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsType } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  // Ежедневное обновление метрик в 2:00 AM Asia/Bishkek
  @Cron('0 2 * * *', {
    timeZone: 'Asia/Bishkek',
  })
  async calculateDailyMetrics() {
    this.logger.log('Starting daily metrics calculation...');
    
    try {
      const companies = await this.prisma.company.findMany({
        select: { id: true, name: true },
      });

      for (const company of companies) {
        await this.calculateCompanyDailyMetrics(company.id);
      }

      this.eventEmitter.emit('analytics.daily.completed', {
        timestamp: new Date(),
        companiesProcessed: companies.length,
      });

      this.logger.log(`Daily metrics calculated for ${companies.length} companies`);
    } catch (error) {
      this.logger.error('Error calculating daily metrics:', error);
      this.eventEmitter.emit('analytics.daily.failed', {
        timestamp: new Date(),
        error: error.message,
      });
    }
  }

  // Еженедельное обновление KPI в воскресенье в 3:00 AM
  @Cron('0 3 * * 0', {
    timeZone: 'Asia/Bishkek',
  })
  async calculateWeeklyMetrics() {
    this.logger.log('Starting weekly KPI calculation...');
    
    try {
      const companies = await this.prisma.company.findMany({
        select: { id: true },
      });

      for (const company of companies) {
        await this.calculateCompanyWeeklyKPIs(company.id);
      }

      this.logger.log(`Weekly KPIs calculated for ${companies.length} companies`);
    } catch (error) {
      this.logger.error('Error calculating weekly KPIs:', error);
    }
  }

  // Ежемесячное обновление в первый день месяца в 4:00 AM
  @Cron('0 4 1 * *', {
    timeZone: 'Asia/Bishkek',
  })
  async calculateMonthlyMetrics() {
    this.logger.log('Starting monthly metrics calculation...');
    
    try {
      const companies = await this.prisma.company.findMany({
        select: { id: true },
      });

      for (const company of companies) {
        await this.calculateCompanyMonthlyMetrics(company.id);
      }

      this.logger.log(`Monthly metrics calculated for ${companies.length} companies`);
    } catch (error) {
      this.logger.error('Error calculating monthly metrics:', error);
    }
  }

  // Очистка старых метрик (старше 2 лет)
  @Cron('0 5 1 1 *', { // 1 января в 5:00
    timeZone: 'Asia/Bishkek',
  })
  async cleanupOldMetrics() {
    this.logger.log('Starting cleanup of old metrics...');
    
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    try {
      const result = await this.prisma.analytics.deleteMany({
        where: {
          date: {
            lt: twoYearsAgo,
          },
        },
      });

      this.logger.log(`Cleaned up ${result.count} old metric records`);
    } catch (error) {
      this.logger.error('Error cleaning up old metrics:', error);
    }
  }

  // Основные методы расчета метрик
  async calculateCompanyDailyMetrics(companyId: string) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Рассчитываем дневной доход
    const dailyRevenue = await this.calculateDailyRevenue(companyId, yesterday, today);
    
    // Рассчитываем утилизацию автопарка
    const fleetUtilization = await this.calculateFleetUtilization(companyId, yesterday);
    
    // Рассчитываем расходы
    const dailyExpenses = await this.calculateDailyExpenses(companyId, yesterday, today);

    // Сохраняем метрики
    await this.saveMetric(companyId, AnalyticsType.DAILY_REVENUE, yesterday, null, dailyRevenue, {
      expenses: dailyExpenses,
      profit: dailyRevenue - dailyExpenses,
    });

    await this.saveMetric(companyId, AnalyticsType.VEHICLE_UTILIZATION, yesterday, null, fleetUtilization);

    // Рассчитываем KPI для каждого водителя
    await this.calculateDriverDailyKPIs(companyId, yesterday);

    // Рассчитываем KPI для каждого автомобиля
    await this.calculateVehicleDailyKPIs(companyId, yesterday);
  }

  private async calculateCompanyWeeklyKPIs(companyId: string) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);

    // Еженедельная утилизация
    const weeklyUtilization = await this.calculateAverageUtilization(companyId, startDate, endDate);
    
    // Еженедельный доход
    const weeklyRevenue = await this.calculateDailyRevenue(companyId, startDate, endDate);

    await this.saveMetric(
      companyId,
      AnalyticsType.FLEET_EFFICIENCY,
      startDate,
      null,
      weeklyUtilization,
      {
        weeklyRevenue,
        period: 'weekly',
      },
    );
  }

  private async calculateCompanyMonthlyMetrics(companyId: string) {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Месячный доход
    const monthlyRevenue = await this.calculateDailyRevenue(companyId, lastMonth, thisMonth);
    
    // Месячные расходы
    const monthlyExpenses = await this.calculateDailyExpenses(companyId, lastMonth, thisMonth);

    await this.saveMetric(
      companyId,
      AnalyticsType.MONTHLY_REVENUE,
      lastMonth,
      null,
      monthlyRevenue,
      {
        expenses: monthlyExpenses,
        profit: monthlyRevenue - monthlyExpenses,
        period: 'monthly',
      },
    );
  }

  // Приватные методы расчета
  private async calculateDailyRevenue(companyId: string, startDate: Date, endDate: Date): Promise<number> {
    const result = await this.prisma.payment.aggregate({
      where: {
        companyId,
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
        type: {
          in: ['PAYMENT', 'DAILY_RENT'], // Только доходы автопарка
        },
      },
      _sum: {
        amount: true,
      },
    });

    return result._sum.amount ? Number(result._sum.amount) : 0;
  }

  private async calculateFleetUtilization(companyId: string, date: Date): Promise<number> {
    const [totalVehicles, activeContracts] = await Promise.all([
      this.prisma.vehicle.count({
        where: {
          companyId,
          status: { not: 'INACTIVE' },
        },
      }),
      this.prisma.contract.count({
        where: {
          companyId,
          status: 'ACTIVE',
          startDate: { lte: date },
          OR: [
            { endDate: null },
            { endDate: { gte: date } },
          ],
        },
      }),
    ]);

    return totalVehicles > 0 ? (activeContracts / totalVehicles) * 100 : 0;
  }

  private async calculateDailyExpenses(companyId: string, startDate: Date, endDate: Date): Promise<number> {
    const result = await this.prisma.expense.aggregate({
      where: {
        companyId,
        paidBy: 'COMPANY', // Только расходы автопарка
        date: {
          gte: startDate,
          lt: endDate,
        },
      },
      _sum: {
        amount: true,
      },
    });

    return result._sum.amount ? Number(result._sum.amount) : 0;
  }

  private async calculateDriverDailyKPIs(companyId: string, date: Date) {
    const drivers = await this.prisma.driver.findMany({
      where: { companyId },
      select: { id: true },
    });

    for (const driver of drivers) {
      const revenue = await this.prisma.payment.aggregate({
        where: {
          driverId: driver.id,
          createdAt: {
            gte: date,
            lt: new Date(date.getTime() + 24 * 60 * 60 * 1000),
          },
          type: {
            in: ['PAYMENT', 'DAILY_RENT'],
          },
        },
        _sum: {
          amount: true,
        },
      });

      const revenueAmount = revenue._sum.amount ? Number(revenue._sum.amount) : 0;
      
      if (revenueAmount > 0) {
        await this.saveMetric(
          companyId,
          AnalyticsType.DRIVER_KPI,
          date,
          driver.id,
          revenueAmount,
        );
      }
    }
  }

  private async calculateVehicleDailyKPIs(companyId: string, date: Date) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { companyId },
      select: { id: true },
    });

    for (const vehicle of vehicles) {
      const contracts = await this.prisma.contract.findMany({
        where: {
          vehicleId: vehicle.id,
          startDate: { lte: date },
          OR: [
            { endDate: null },
            { endDate: { gte: date } },
          ],
        },
        select: {
          dailyRate: true,
          totalRevenue: true,
        },
      });

      const dailyRevenue = contracts.reduce((sum, contract) => sum + Number(contract.dailyRate), 0);
      const isActive = contracts.length > 0;

      await this.saveMetric(
        companyId,
        AnalyticsType.VEHICLE_UTILIZATION,
        date,
        vehicle.id,
        isActive ? 100 : 0,
        {
          dailyRevenue,
          activeContracts: contracts.length,
        },
      );
    }
  }

  private async calculateAverageUtilization(companyId: string, startDate: Date, endDate: Date): Promise<number> {
    const metrics = await this.prisma.analytics.findMany({
      where: {
        companyId,
        metricType: AnalyticsType.VEHICLE_UTILIZATION,
        date: {
          gte: startDate,
          lte: endDate,
        },
        entityId: null, // Общая утилизация, не по конкретному авто
      },
      select: {
        value: true,
      },
    });

    if (metrics.length === 0) return 0;
    
    const totalUtilization = metrics.reduce((sum, metric) => sum + metric.value, 0);
    return totalUtilization / metrics.length;
  }

  private async saveMetric(
    companyId: string,
    metricType: AnalyticsType,
    date: Date,
    entityId: string | null,
    value: number,
    metadata?: any,
  ) {
    await this.prisma.analytics.upsert({
      where: {
        companyId_metricType_date_entityId: {
          companyId,
          metricType,
          date,
          entityId: entityId || '',
        },
      },
      update: {
        value,
        metadata,
        updatedAt: new Date(),
      },
      create: {
        companyId,
        metricType,
        date,
        entityId,
        value,
        metadata,
      },
    });
  }

  // Публичные методы для получения кэшированных метрик
  async getCachedMetric(
    companyId: string,
    metricType: AnalyticsType,
    startDate: Date,
    endDate: Date,
    entityId?: string,
  ) {
    return this.prisma.analytics.findMany({
      where: {
        companyId,
        metricType,
        date: {
          gte: startDate,
          lte: endDate,
        },
        ...(entityId && { entityId }),
      },
      orderBy: {
        date: 'asc',
      },
    });
  }

  async getLatestMetric(
    companyId: string,
    metricType: AnalyticsType,
    entityId?: string,
  ) {
    return this.prisma.analytics.findFirst({
      where: {
        companyId,
        metricType,
        ...(entityId && { entityId }),
      },
      orderBy: {
        date: 'desc',
      },
    });
  }

  // Метод для принудительного пересчета метрик
  async recalculateMetrics(companyId: string, startDate: Date, endDate: Date) {
    this.logger.log(`Recalculating metrics for company ${companyId} from ${startDate} to ${endDate}`);
    
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      await this.calculateCompanyDailyMetrics(companyId);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    this.logger.log(`Metrics recalculated for company ${companyId}`);
  }
}