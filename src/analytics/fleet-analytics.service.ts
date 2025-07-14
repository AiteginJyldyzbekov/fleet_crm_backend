import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsQueryDto, DateRange } from './dto/analytics-query.dto';
import { FleetKPI, VehicleKPI } from './interfaces/analytics.interface';
import { VehicleStatus } from '@prisma/client';

@Injectable()
export class FleetAnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getFleetKPI(companyId: string, query: AnalyticsQueryDto): Promise<FleetKPI> {
    const { startDate, endDate } = this.getDateRange(query);

    const [
      totalVehicles,
      activeVehicles,
      utilizationData,
      revenueData,
      maintenanceData,
      contractData,
    ] = await Promise.all([
      this.getTotalVehicleCount(companyId),
      this.getActiveVehicleCount(companyId),
      this.getUtilizationData(companyId, startDate, endDate),
      this.getFleetRevenueData(companyId, startDate, endDate),
      this.getMaintenanceCosts(companyId, startDate, endDate),
      this.getContractData(companyId, startDate, endDate),
    ]);

    const utilization = totalVehicles > 0 ? (activeVehicles / totalVehicles) * 100 : 0;
    const averageRentalDuration = contractData.avgDuration || 0;
    const totalRevenue = revenueData.totalRevenue || 0;
    const revenuePerVehicle = totalVehicles > 0 ? totalRevenue / totalVehicles : 0;
    const maintenanceCosts = maintenanceData.totalCost || 0;
    const idleTime = this.calculateIdleTime(utilizationData);

    const [topPerformingVehicles, underPerformingVehicles] = await Promise.all([
      this.getTopPerformingVehicles(companyId, startDate, endDate, 5),
      this.getUnderPerformingVehicles(companyId, startDate, endDate, 5),
    ]);

    return {
      totalVehicles,
      activeVehicles,
      utilization,
      averageRentalDuration,
      totalRevenue,
      revenuePerVehicle,
      maintenanceCosts,
      idleTime,
      topPerformingVehicles,
      underPerformingVehicles,
    };
  }

  async getVehicleKPI(
    companyId: string,
    vehicleId: string,
    query: AnalyticsQueryDto,
  ): Promise<VehicleKPI> {
    const { startDate, endDate } = this.getDateRange(query);

    const [vehicle, contracts, revenue, expenses] = await Promise.all([
      this.prisma.vehicle.findUnique({
        where: { id: vehicleId, companyId },
        select: { model: true, plateNumber: true },
      }),
      this.getVehicleContracts(vehicleId, startDate, endDate),
      this.getVehicleRevenue(vehicleId, startDate, endDate),
      this.getVehicleExpenses(vehicleId, startDate, endDate),
    ]);

    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    const totalDaysInPeriod = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const totalDaysRented = contracts.reduce((sum, contract) => sum + (contract.actualDuration || 0), 0);
    const utilization = totalDaysInPeriod > 0 ? (totalDaysRented / totalDaysInPeriod) * 100 : 0;
    const totalRevenue = revenue.total || 0;
    const totalExpenses = expenses.total || 0;
    const averageDailyRate = totalDaysRented > 0 ? totalRevenue / totalDaysRented : 0;

    return {
      vehicleId,
      model: vehicle.model,
      plateNumber: vehicle.plateNumber,
      utilization,
      revenue: totalRevenue,
      expenses: totalExpenses,
      profit: totalRevenue - totalExpenses,
      totalDaysRented,
      averageDailyRate,
    };
  }

  async getVehicleUtilizationHistory(
    companyId: string,
    query: AnalyticsQueryDto,
  ): Promise<Array<{ date: string; utilization: number; activeVehicles: number; totalVehicles: number }>> {
    const { startDate, endDate } = this.getDateRange(query);
    const result: Array<{ date: string; utilization: number; activeVehicles: number; totalVehicles: number }> = [];

    const totalVehicles = await this.getTotalVehicleCount(companyId);
    
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const activeVehicles = await this.getActiveVehiclesOnDate(companyId, currentDate);
      const utilization = totalVehicles > 0 ? (activeVehicles / totalVehicles) * 100 : 0;

      result.push({
        date: currentDate.toISOString().split('T')[0],
        utilization,
        activeVehicles,
        totalVehicles,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return result;
  }

  async getMaintenanceSchedule(
    companyId: string,
    days: number = 30,
  ): Promise<Array<{ vehicleId: string; model: string; plateNumber: string; lastMaintenance: Date | null; daysSinceLastMaintenance: number; recommendedAction: string }>> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        companyId,
        status: { not: VehicleStatus.INACTIVE },
      },
      select: {
        id: true,
        model: true,
        plateNumber: true,
        lastMaintenanceDate: true,
        totalMileage: true,
      },
    });

    const result: Array<{ vehicleId: string; model: string; plateNumber: string; lastMaintenance: Date | null; daysSinceLastMaintenance: number; recommendedAction: string }> = [];
    const now = new Date();

    for (const vehicle of vehicles) {
      const daysSinceLastMaintenance = vehicle.lastMaintenanceDate
        ? Math.floor((now.getTime() - vehicle.lastMaintenanceDate.getTime()) / (1000 * 60 * 60 * 24))
        : 9999;

      let recommendedAction = 'OK';
      if (daysSinceLastMaintenance > 90) {
        recommendedAction = 'URGENT - Maintenance overdue';
      } else if (daysSinceLastMaintenance > 60) {
        recommendedAction = 'Schedule maintenance soon';
      } else if (daysSinceLastMaintenance > 30) {
        recommendedAction = 'Maintenance due within 30 days';
      }

      result.push({
        vehicleId: vehicle.id,
        model: vehicle.model,
        plateNumber: vehicle.plateNumber,
        lastMaintenance: vehicle.lastMaintenanceDate,
        daysSinceLastMaintenance,
        recommendedAction,
      });
    }

    return result.sort((a, b) => b.daysSinceLastMaintenance - a.daysSinceLastMaintenance);
  }

  async getVehiclePerformanceComparison(
    companyId: string,
    query: AnalyticsQueryDto,
  ): Promise<VehicleKPI[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        companyId,
        status: { not: VehicleStatus.INACTIVE },
      },
      select: { id: true, model: true, plateNumber: true },
    });

    const vehicleKPIs: VehicleKPI[] = [];
    for (const vehicle of vehicles) {
      try {
        const kpi = await this.getVehicleKPI(companyId, vehicle.id, query);
        vehicleKPIs.push(kpi);
      } catch (error) {
        continue;
      }
    }

    return vehicleKPIs.sort((a, b) => b.profit - a.profit);
  }

  // Приватные методы
  private async getTotalVehicleCount(companyId: string): Promise<number> {
    return this.prisma.vehicle.count({
      where: {
        companyId,
        status: { not: VehicleStatus.INACTIVE },
      },
    });
  }

  private async getActiveVehicleCount(companyId: string): Promise<number> {
    return this.prisma.vehicle.count({
      where: {
        companyId,
        status: VehicleStatus.RENTED,
      },
    });
  }

  private async getActiveVehiclesOnDate(companyId: string, date: Date): Promise<number> {
    return this.prisma.contract.count({
      where: {
        companyId,
        status: 'ACTIVE',
        startDate: { lte: date },
        OR: [
          { endDate: null },
          { endDate: { gte: date } },
        ],
      },
    });
  }

  private async getUtilizationData(companyId: string, startDate: Date, endDate: Date) {
    const contracts = await this.prisma.contract.findMany({
      where: {
        companyId,
        startDate: { lte: endDate },
        OR: [
          { endDate: null },
          { endDate: { gte: startDate } },
        ],
      },
      select: {
        startDate: true,
        endDate: true,
        vehicleId: true,
      },
    });

    return contracts;
  }

  private async getFleetRevenueData(companyId: string, startDate: Date, endDate: Date) {
    const result = await this.prisma.contract.aggregate({
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
    });

    return { totalRevenue: Number(result._sum?.totalRevenue || 0) };
  }

  private async getMaintenanceCosts(companyId: string, startDate: Date, endDate: Date) {
    const result = await this.prisma.expense.aggregate({
      where: {
        companyId,
        type: { in: ['MAINTENANCE', 'REPAIR'] },
        paidBy: 'COMPANY', // Только расходы автопарка
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        amount: true,
      },
    });

    return { totalCost: Number(result._sum?.amount || 0) };
  }

  private async getContractData(companyId: string, startDate: Date, endDate: Date) {
    const result = await this.prisma.contract.aggregate({
      where: {
        companyId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _avg: {
        actualDuration: true,
      },
    });

    return { avgDuration: Number(result._avg?.actualDuration || 0) };
  }

  private async getVehicleContracts(vehicleId: string, startDate: Date, endDate: Date) {
    return this.prisma.contract.findMany({
      where: {
        vehicleId,
        startDate: { lte: endDate },
        OR: [
          { endDate: null },
          { endDate: { gte: startDate } },
        ],
      },
      select: {
        actualDuration: true,
        totalRevenue: true,
        dailyRate: true,
      },
    });
  }

  private async getVehicleRevenue(vehicleId: string, startDate: Date, endDate: Date) {
    const result = await this.prisma.contract.aggregate({
      where: {
        vehicleId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        totalRevenue: true,
      },
    });

    return { total: Number(result._sum?.totalRevenue || 0) };
  }

  private async getVehicleExpenses(vehicleId: string, startDate: Date, endDate: Date) {
    const result = await this.prisma.expense.aggregate({
      where: {
        vehicleId,
        paidBy: 'COMPANY', // Только расходы автопарка
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        amount: true,
      },
    });

    return { total: Number(result._sum?.amount || 0) };
  }

  private async getTopPerformingVehicles(
    companyId: string,
    startDate: Date,
    endDate: Date,
    limit: number,
  ): Promise<VehicleKPI[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { companyId },
      select: { id: true },
      take: 20,
    });

    const vehicleKPIs: VehicleKPI[] = [];
    for (const vehicle of vehicles) {
      try {
        const kpi = await this.getVehicleKPI(companyId, vehicle.id, {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          range: DateRange.CUSTOM,
        } as AnalyticsQueryDto);
        vehicleKPIs.push(kpi);
      } catch (error) {
        continue;
      }
    }

    return vehicleKPIs
      .sort((a, b) => b.profit - a.profit)
      .slice(0, limit);
  }

  private async getUnderPerformingVehicles(
    companyId: string,
    startDate: Date,
    endDate: Date,
    limit: number,
  ): Promise<VehicleKPI[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { companyId },
      select: { id: true },
      take: 20,
    });

    const vehicleKPIs: VehicleKPI[] = [];
    for (const vehicle of vehicles) {
      try {
        const kpi = await this.getVehicleKPI(companyId, vehicle.id, {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          range: DateRange.CUSTOM,
        } as AnalyticsQueryDto);
        vehicleKPIs.push(kpi);
      } catch (error) {
        continue;
      }
    }

    return vehicleKPIs
      .sort((a, b) => a.utilization - b.utilization)
      .slice(0, limit);
  }

  private calculateIdleTime(utilizationData: any[]): number {
    const totalPossibleDays = utilizationData.length * 30;
    const totalActiveDays = utilizationData.reduce((sum, contract) => {
      const start = new Date(contract.startDate);
      const end = contract.endDate ? new Date(contract.endDate) : new Date();
      return sum + Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    }, 0);

    return totalPossibleDays > 0 ? ((totalPossibleDays - totalActiveDays) / totalPossibleDays) * 100 : 0;
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