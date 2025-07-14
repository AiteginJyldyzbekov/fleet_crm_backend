import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { DriverKPI, AnalyticsInsights, AnalyticsAlert } from './interfaces/analytics.interface';
import { PaymentType } from '@prisma/client';

@Injectable()
export class DriverAnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getDriverKPI(
    companyId: string,
    driverId: string,
    query: AnalyticsQueryDto,
  ): Promise<DriverKPI> {
    const { startDate, endDate } = this.getDateRange(query);

    const [driver, revenue, contracts, payments, balance] = await Promise.all([
      this.prisma.driver.findUnique({
        where: { id: driverId, companyId },
        select: { 
          firstName: true,
          lastName: true,
          totalContracts: true, 
          totalRevenue: true,
          averageRating: true,
          balance: true,
        },
      }),
      this.getDriverRevenue(driverId, startDate, endDate),
      this.getDriverContracts(driverId, startDate, endDate),
      this.getDriverPaymentDelays(driverId, startDate, endDate),
      this.getDriverCurrentBalance(driverId),
    ]);

    if (!driver) {
      throw new Error('Driver not found');
    }

    const averageContractDuration = contracts.length > 0 
      ? contracts.reduce((sum, c) => sum + (c.actualDuration || 0), 0) / contracts.length 
      : 0;

    const averageBalance = Number(balance.averageBalance) || 0;
    const currentDebt = Math.max(0, -Number(driver.balance));

    return {
      driverId,
      name: `${driver.firstName} ${driver.lastName}`,
      totalRevenue: revenue.total,
      averageBalance,
      totalContracts: contracts.length,
      averageContractDuration,
      paymentDelays: payments.delayCount,
      currentDebt,
      rating: driver.averageRating || 5.0,
    };
  }

  async getDriverPerformanceRanking(
    companyId: string,
    query: AnalyticsQueryDto,
  ): Promise<DriverKPI[]> {
    const drivers = await this.prisma.driver.findMany({
      where: {
        companyId,
        isActive: true,
      },
      select: { id: true },
    });

    const driverKPIs: DriverKPI[] = [];
    for (const driver of drivers) {
      try {
        const kpi = await this.getDriverKPI(companyId, driver.id, query);
        driverKPIs.push(kpi);
      } catch (error) {
        continue;
      }
    }

    return driverKPIs.sort((a, b) => b.totalRevenue - a.totalRevenue);
  }

  async getRiskAnalysis(companyId: string): Promise<AnalyticsInsights> {
    const [riskDrivers, underPerformingVehicles, alerts] = await Promise.all([
      this.identifyRiskDrivers(companyId),
      this.identifyUnderPerformingVehicles(companyId),
      this.generateAlerts(companyId),
    ]);

    const recommendations = this.generateRecommendations(riskDrivers, underPerformingVehicles, alerts);

    return {
      riskDrivers,
      underPerformingVehicles,
      recommendations,
      alerts,
    };
  }

  async getDriverActivityTimeline(
    companyId: string,
    driverId: string,
    query: AnalyticsQueryDto,
  ): Promise<Array<{ date: string; activity: string; amount?: number; description: string }>> {
    const { startDate, endDate } = this.getDateRange(query);

    const [payments, contracts] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          companyId,
          driverId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          type: true,
          amount: true,
          createdAt: true,
          description: true,
        },
      }),
      this.prisma.contract.findMany({
        where: {
          companyId,
          driverId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          status: true,
          createdAt: true,
          startDate: true,
          endDate: true,
          vehicle: {
            select: { model: true, plateNumber: true },
          },
        },
      }),
    ]);

    const timeline: Array<{ date: string; activity: string; amount?: number; description: string }> = [];

    // Добавляем платежи
    for (const payment of payments) {
      timeline.push({
        date: payment.createdAt.toISOString().split('T')[0],
        activity: payment.type,
        amount: Number(payment.amount),
        description: payment.description || `${payment.type} payment`,
      });
    }

    // Добавляем события контрактов
    for (const contract of contracts) {
      timeline.push({
        date: contract.createdAt.toISOString().split('T')[0],
        activity: 'CONTRACT_START',
        description: `Started rental of ${contract.vehicle.model} (${contract.vehicle.plateNumber})`,
      });

      if (contract.endDate && contract.status === 'COMPLETED') {
        timeline.push({
          date: contract.endDate.toISOString().split('T')[0],
          activity: 'CONTRACT_END',
          description: `Ended rental of ${contract.vehicle.model} (${contract.vehicle.plateNumber})`,
        });
      }
    }

    return timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async getDriverFinancialSummary(
    companyId: string,
    driverId: string,
    query: AnalyticsQueryDto,
  ): Promise<{
    totalPaid: number;
    totalDebt: number;
    averageMonthlyPayment: number;
    paymentHistory: Array<{ month: string; amount: number }>;
    debtHistory: Array<{ date: string; balance: number }>;
  }> {
    const { startDate, endDate } = this.getDateRange(query);

    const payments = await this.prisma.payment.findMany({
      where: {
        companyId,
        driverId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        type: {
          in: [PaymentType.PAYMENT, PaymentType.DAILY_RENT],
        },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        amount: true,
        createdAt: true,
      },
    });

    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const currentDriver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { balance: true },
    });

    const currentBalance = Number(currentDriver?.balance || 0);
    const totalDebt = Math.max(0, -currentBalance);
    const monthsDiff = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
    const averageMonthlyPayment = totalPaid / monthsDiff;

    // Группируем платежи по месяцам
    const paymentsByMonth = new Map<string, number>();
    for (const payment of payments) {
      const monthKey = payment.createdAt.toISOString().substring(0, 7); // YYYY-MM
      const currentAmount = paymentsByMonth.get(monthKey) || 0;
      paymentsByMonth.set(monthKey, currentAmount + Number(payment.amount));
    }

    const paymentHistory = Array.from(paymentsByMonth.entries()).map(([month, amount]) => ({
      month,
      amount,
    }));

    const debtHistory = [
      {
        date: endDate.toISOString().split('T')[0],
        balance: currentBalance,
      },
    ];

    return {
      totalPaid,
      totalDebt,
      averageMonthlyPayment,
      paymentHistory,
      debtHistory,
    };
  }

  // Приватные методы
  private async getDriverRevenue(driverId: string, startDate: Date, endDate: Date) {
    const result = await this.prisma.payment.aggregate({
      where: {
        driverId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        type: {
          in: [PaymentType.PAYMENT, PaymentType.DAILY_RENT],
        },
      },
      _sum: {
        amount: true,
      },
    });

    return { total: Number(result._sum.amount || 0) };
  }

  private async getDriverContracts(driverId: string, startDate: Date, endDate: Date) {
    return this.prisma.contract.findMany({
      where: {
        driverId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        actualDuration: true,
        totalRevenue: true,
        status: true,
      },
    });
  }

  private async getDriverPaymentDelays(driverId: string, startDate: Date, endDate: Date) {
    const delayCount = await this.prisma.payment.count({
      where: {
        driverId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        amount: {
          lt: 0,
        },
        type: PaymentType.DAILY_RENT,
      },
    });

    return { delayCount };
  }

  private async getDriverCurrentBalance(driverId: string) {
    const result = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { balance: true },
    });

    return { averageBalance: result?.balance || 0 };
  }

  private async identifyRiskDrivers(companyId: string): Promise<DriverKPI[]> {
    const drivers = await this.prisma.driver.findMany({
      where: {
        companyId,
        OR: [
          { balance: { lt: -1000 } }, // Долг больше 1000
          { totalContracts: { gt: 0 } }, // Есть контракты
        ],
      },
      select: { id: true },
      take: 10,
    });

    const riskDrivers: DriverKPI[] = [];
    for (const driver of drivers) {
      try {
        const kpi = await this.getDriverKPI(companyId, driver.id, {
          range: 'last_30_days',
        } as AnalyticsQueryDto);
        
        // Критерии риска
        if (kpi.currentDebt > 1000 || kpi.paymentDelays > 3 || kpi.averageBalance < -500) {
          riskDrivers.push(kpi);
        }
      } catch (error) {
        continue;
      }
    }

    return riskDrivers.sort((a, b) => b.currentDebt - a.currentDebt);
  }

  private async identifyUnderPerformingVehicles(companyId: string) {
    // Это будет реализовано в FleetAnalyticsService
    return [];
  }

  private async generateAlerts(companyId: string): Promise<AnalyticsAlert[]> {
    const alerts: AnalyticsAlert[] = [];

    // Критические долги
    const criticalDebtDrivers = await this.prisma.driver.findMany({
      where: {
        companyId,
        balance: { lt: -2000 },
      },
      select: { id: true, firstName: true, lastName: true, balance: true },
    });

    for (const driver of criticalDebtDrivers) {
      alerts.push({
        type: 'CRITICAL',
        message: `Driver ${driver.firstName} ${driver.lastName} has critical debt`,
        entityId: driver.id,
        entityType: 'DRIVER',
        value: Math.abs(Number(driver.balance)),
        threshold: 2000,
      });
    }

    // Неактивные водители
    const inactiveDrivers = await this.prisma.driver.count({
      where: {
        companyId,
        isActive: true,
        lastActivityDate: {
          lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Неактивны 7 дней
        },
      },
    });

    if (inactiveDrivers > 0) {
      alerts.push({
        type: 'WARNING',
        message: `${inactiveDrivers} drivers have been inactive for over 7 days`,
        value: inactiveDrivers,
      });
    }

    // Низкая утилизация автопарка
    const totalVehicles = await this.prisma.vehicle.count({
      where: { companyId },
    });

    const activeVehicles = await this.prisma.vehicle.count({
      where: { companyId, status: 'RENTED' },
    });

    const utilization = totalVehicles > 0 ? (activeVehicles / totalVehicles) * 100 : 0;
    
    if (utilization < 50) {
      alerts.push({
        type: 'WARNING',
        message: 'Fleet utilization is below 50%',
        value: utilization,
        threshold: 50,
      });
    }

    return alerts;
  }

  private generateRecommendations(
    riskDrivers: DriverKPI[],
    underPerformingVehicles: any[],
    alerts: AnalyticsAlert[],
  ): string[] {
    const recommendations: string[] = [];

    if (riskDrivers.length > 0) {
      recommendations.push(`Contact ${riskDrivers.length} high-risk drivers for debt collection`);
      recommendations.push('Consider implementing stricter deposit requirements');
    }

    if (alerts.some(a => a.type === 'CRITICAL')) {
      recommendations.push('Immediate action required for critical alerts');
    }

    const utilizationAlert = alerts.find(a => a.message.includes('utilization'));
    if (utilizationAlert) {
      recommendations.push('Increase marketing efforts to improve vehicle utilization');
      recommendations.push('Consider adjusting rental rates to attract more customers');
    }

    if (recommendations.length === 0) {
      recommendations.push('Continue monitoring KPIs and maintain current operations');
    }

    return recommendations;
  }

  private getDateRange(query: AnalyticsQueryDto): { startDate: Date; endDate: Date } {
    const now = new Date();
    const endDate = query.endDate ? new Date(query.endDate) : now;
    let startDate: Date;

    switch (query.range) {
      case 'last_7_days':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'last_30_days':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'last_90_days':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'this_year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'custom':
        startDate = query.startDate ? new Date(query.startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return { startDate, endDate };
  }
}