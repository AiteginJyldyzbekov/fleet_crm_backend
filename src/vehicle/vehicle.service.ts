import { 
  Injectable, 
  NotFoundException, 
  ConflictException, 
  BadRequestException,
  ForbiddenException 
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UserRole, VehicleStatus } from '@prisma/client';

@Injectable()
export class VehicleService {
  constructor(private prisma: PrismaService) {}

  async create(createVehicleDto: CreateVehicleDto, currentUser: any) {
    const { brand, model, year, plateNumber, vin, color, status, dailyRate, companyId } = createVehicleDto;

    // Определяем companyId в зависимости от роли пользователя
    let targetCompanyId: string;
    
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      // Super Admin должен указать companyId
      if (!companyId) {
        throw new BadRequestException('Company ID is required when creating vehicle as Super Admin');
      }
      targetCompanyId = companyId;
    } else {
      // Company Admin может создавать автомобили только в своей компании
      if (!currentUser.companyId) {
        throw new BadRequestException('User must belong to a company to create vehicles');
      }
      targetCompanyId = currentUser.companyId;
    }

    // Проверяем уникальность VIN
    const existingVin = await this.prisma.vehicle.findUnique({
      where: { vin },
    });

    if (existingVin) {
      throw new ConflictException('Vehicle with this VIN already exists');
    }

    // Проверяем уникальность номера в пределах компании
    const existingPlate = await this.prisma.vehicle.findFirst({
      where: { 
        plateNumber,
        companyId: targetCompanyId,
      },
    });

    if (existingPlate) {
      throw new ConflictException('Vehicle with this plate number already exists in this company');
    }

    // Проверяем, существует ли компания
    const company = await this.prisma.company.findUnique({
      where: { id: targetCompanyId },
    });

    if (!company || !company.isActive) {
      throw new BadRequestException('Company not found or inactive');
    }

    try {
      return await this.prisma.vehicle.create({
        data: {
          brand,
          model,
          year,
          plateNumber,
          vin,
          color,
          status: status || VehicleStatus.AVAILABLE,
          dailyRate,
          companyId: targetCompanyId,
        },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              contracts: true,
            },
          },
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Vehicle with this VIN or plate number already exists');
      }
      throw error;
    }
  }

  async findAll(currentUser: any, companyId?: string, status?: VehicleStatus) {
    let whereClause: any = {};

    if (currentUser.role === UserRole.SUPER_ADMIN) {
      // Super Admin может фильтровать по companyId или видеть все
      if (companyId) {
        whereClause.companyId = companyId;
      }
    } else {
      // Company Admin/Manager/Driver видят только автомобили своей компании
      whereClause.companyId = currentUser.companyId;
    }

    // Фильтр по статусу
    if (status) {
      whereClause.status = status;
    }

    return this.prisma.vehicle.findMany({
      where: whereClause,
      include: {
        company: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        contracts: {
          where: {
            status: 'ACTIVE',
          },
          include: {
            driver: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            contracts: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, currentUser: any) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        contracts: {
          include: {
            driver: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            contracts: true,
          },
        },
      },
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID ${id} not found`);
    }

    // Проверка доступа
    this.checkVehicleAccess(vehicle, currentUser);

    return vehicle;
  }

  async update(id: string, updateVehicleDto: UpdateVehicleDto, currentUser: any) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID ${id} not found`);
    }

    // Проверка доступа
    this.checkVehicleAccess(vehicle, currentUser);

    // Проверяем уникальность номера, если он обновляется
    if (updateVehicleDto.plateNumber && updateVehicleDto.plateNumber !== vehicle.plateNumber) {
      const existingPlate = await this.prisma.vehicle.findFirst({
        where: { 
          plateNumber: updateVehicleDto.plateNumber,
          companyId: vehicle.companyId,
          id: { not: id },
        },
      });

      if (existingPlate) {
        throw new ConflictException('Vehicle with this plate number already exists in this company');
      }
    }

    try {
      return await this.prisma.vehicle.update({
        where: { id },
        data: updateVehicleDto,
        include: {
          company: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              contracts: true,
            },
          },
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Vehicle with this plate number already exists');
      }
      throw error;
    }
  }

  async updateStatus(id: string, updateStatusDto: UpdateStatusDto, currentUser: any) {
    const { status, reason } = updateStatusDto;

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        contracts: {
          where: {
            status: 'ACTIVE',
          },
        },
      },
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID ${id} not found`);
    }

    // Проверка доступа
    this.checkVehicleAccess(vehicle, currentUser);

    // Валидация статусов
    if (status === VehicleStatus.AVAILABLE && vehicle.contracts.length > 0) {
      throw new BadRequestException('Cannot set vehicle as AVAILABLE while it has active contracts');
    }

    if (status === VehicleStatus.RENTED && vehicle.contracts.length === 0) {
      throw new BadRequestException('Cannot set vehicle as RENTED without active contracts');
    }

    return this.prisma.vehicle.update({
      where: { id },
      data: { 
        status,
        updatedAt: new Date(),
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            contracts: true,
          },
        },
      },
    });
  }

  async remove(id: string, currentUser: any) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        contracts: true,
      },
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID ${id} not found`);
    }

    // Проверка доступа
    this.checkVehicleAccess(vehicle, currentUser);

    // Проверяем, нет ли активных контрактов
    const activeContracts = vehicle.contracts.filter(contract => contract.status === 'ACTIVE');
    if (activeContracts.length > 0) {
      throw new BadRequestException('Cannot delete vehicle with active contracts');
    }

    return this.prisma.vehicle.delete({
      where: { id },
    });
  }

  async getVehicleStats(id: string, currentUser: any) {
    const vehicle = await this.findOne(id, currentUser);

    const [totalContracts, activeContracts, totalRevenue, utilizationRate] = await Promise.all([
      this.prisma.contract.count({
        where: { vehicleId: id },
      }),
      this.prisma.contract.count({
        where: { 
          vehicleId: id,
          status: 'ACTIVE',
        },
      }),
      this.prisma.payment.aggregate({
        where: {
          contract: {
            vehicleId: id,
          },
          type: 'DAILY_RENT',
        },
        _sum: { amount: true },
      }),
      this.calculateUtilizationRate(id),
    ]);

    return {
      vehicle,
      stats: {
        totalContracts,
        activeContracts,
        totalRevenue: totalRevenue._sum.amount || 0,
        utilizationRate: Math.round(utilizationRate * 100) / 100, // Округляем до 2 знаков
        isRented: vehicle.status === VehicleStatus.RENTED,
        isAvailable: vehicle.status === VehicleStatus.AVAILABLE,
      },
    };
  }

  async getAvailableVehicles(currentUser: any, companyId?: string) {
    let whereClause: any = {
      status: VehicleStatus.AVAILABLE,
    };

    if (currentUser.role === UserRole.SUPER_ADMIN) {
      if (companyId) {
        whereClause.companyId = companyId;
      }
    } else {
      whereClause.companyId = currentUser.companyId;
    }

    return this.prisma.vehicle.findMany({
      where: whereClause,
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { dailyRate: 'asc' },
    });
  }

  private async calculateUtilizationRate(vehicleId: string): Promise<number> {
    // Упрощенный расчет: процент дней в аренде за последний месяц
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    // Проверяем есть ли активные контракты за последний месяц
    const activeContracts = await this.prisma.contract.findMany({
      where: {
        vehicleId,
        status: 'ACTIVE',
        startDate: {
          gte: oneMonthAgo,
        },
      },
    });

    // Простой расчет - если есть активные контракты, возвращаем 80%
    // В будущем можно будет улучшить логику подсчета реальных дней
    if (activeContracts.length > 0) {
      return 80.0;
    }

    // Проверяем завершенные контракты за месяц
    const completedContracts = await this.prisma.contract.count({
      where: {
        vehicleId,
        status: 'COMPLETED',
        endDate: {
          gte: oneMonthAgo,
        },
      },
    });

    // Если были завершенные контракты, возвращаем меньший процент
    return completedContracts > 0 ? 60.0 : 0.0;
  }

  private checkVehicleAccess(vehicle: any, currentUser: any) {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      return; // Super Admin имеет доступ ко всем автомобилям
    }

    if (vehicle.companyId !== currentUser.companyId) {
      throw new ForbiddenException('Access denied to this vehicle');
    }
  }
}