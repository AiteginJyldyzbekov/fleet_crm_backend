import { 
  Injectable, 
  NotFoundException, 
  ConflictException, 
  BadRequestException,
  ForbiddenException 
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UserRole, ContractStatus, VehicleStatus, PaymentType } from '@prisma/client';

@Injectable()
export class ContractService {
  constructor(private prisma: PrismaService) {}

  async create(createContractDto: CreateContractDto, currentUser: any) {
    const { 
      driverId, 
      vehicleId, 
      dailyRate, 
      deposit, 
      startDate, 
      endDate, 
      status, 
      description,
      companyId 
    } = createContractDto;

    // Определяем companyId в зависимости от роли пользователя
    let targetCompanyId: string;
    
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      if (!companyId) {
        throw new BadRequestException('Company ID is required when creating contract as Super Admin');
      }
      targetCompanyId = companyId;
    } else {
      if (!currentUser.companyId) {
        throw new BadRequestException('User must belong to a company to create contracts');
      }
      targetCompanyId = currentUser.companyId;
    }

    // Проверяем существование и доступность водителя
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { contracts: { where: { status: ContractStatus.ACTIVE } } },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    if (!driver.isActive) {
      throw new BadRequestException('Driver is not active');
    }

    if (driver.companyId !== targetCompanyId) {
      throw new BadRequestException('Driver does not belong to this company');
    }

    // Проверяем, нет ли у водителя активных контрактов
    if (driver.contracts.length > 0) {
      throw new ConflictException('Driver already has an active contract');
    }

    // Проверяем существование и доступность автомобиля
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { contracts: { where: { status: ContractStatus.ACTIVE } } },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (vehicle.companyId !== targetCompanyId) {
      throw new BadRequestException('Vehicle does not belong to this company');
    }

    if (vehicle.status !== VehicleStatus.AVAILABLE) {
      throw new ConflictException('Vehicle is not available for rent');
    }

    // Проверяем, нет ли у автомобиля активных контрактов
    if (vehicle.contracts.length > 0) {
      throw new ConflictException('Vehicle already has an active contract');
    }

    // Валидация дат
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;

    if (start < new Date()) {
      throw new BadRequestException('Start date cannot be in the past');
    }

    if (end && end <= start) {
      throw new BadRequestException('End date must be after start date');
    }

    // Проверяем депозит водителя (должен покрывать требуемый депозит)
    if (deposit && Number(driver.deposit) < deposit) {
      throw new BadRequestException(
        `Driver deposit (${driver.deposit}) is insufficient for required deposit (${deposit}). ` +
        `Driver needs to top up deposit first.`
      );
    }

    // Выполняем транзакцию для создания контракта
    return this.prisma.$transaction(async (tx) => {
      // Создаем контракт
      const contract = await tx.contract.create({
        data: {
          driverId,
          vehicleId,
          dailyRate,
          deposit: deposit || 0,
          startDate: start,
          endDate: end,
          status: status || ContractStatus.ACTIVE,
          description,
          companyId: targetCompanyId,
        },
        include: {
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              balance: true,
              deposit: true,
            },
          },
          vehicle: {
            select: {
              id: true,
              brand: true,
              model: true,
              year: true,
              plateNumber: true,
              dailyRate: true,
            },
          },
          company: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Обновляем статус автомобиля на RENTED
      await tx.vehicle.update({
        where: { id: vehicleId },
        data: { status: VehicleStatus.RENTED },
      });

      // Блокируем депозит (уменьшаем доступный депозит водителя)
      if (deposit && deposit > 0) {
        const newDepositBalance = Number(driver.deposit) - deposit;
        
        await tx.driver.update({
          where: { id: driverId },
          data: { deposit: newDepositBalance },
        });

        // Создаем запись о блокировке депозита
        await tx.payment.create({
          data: {
            amount: deposit,
            type: PaymentType.DEPOSIT,
            description: `Deposit blocked for contract ${contract.id}`,
            driverId,
            contractId: contract.id,
            companyId: targetCompanyId,
            createdById: currentUser.id,
          },
        });
      }

      return contract;
    });
  }

  async findAll(
    currentUser: any, 
    companyId?: string, 
    status?: ContractStatus,
    driverId?: string,
    vehicleId?: string
  ) {
    let whereClause: any = {};

    // Multi-tenant фильтрация
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      if (companyId) {
        whereClause.companyId = companyId;
      }
    } else if (currentUser.userType === 'driver') {
      // Водители видят только свои контракты
      whereClause.driverId = currentUser.id;
    } else {
      // Company Admin/Manager видят контракты своей компании
      whereClause.companyId = currentUser.companyId;
    }

    // Дополнительные фильтры
    if (status) {
      whereClause.status = status;
    }
    if (driverId) {
      whereClause.driverId = driverId;
    }
    if (vehicleId) {
      whereClause.vehicleId = vehicleId;
    }

    return this.prisma.contract.findMany({
      where: whereClause,
      include: {
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            balance: true,
            deposit: true,
          },
        },
        vehicle: {
          select: {
            id: true,
            brand: true,
            model: true,
            year: true,
            plateNumber: true,
            status: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            payments: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, currentUser: any) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            licenseNumber: true,
            balance: true,
            deposit: true,
          },
        },
        vehicle: {
          select: {
            id: true,
            brand: true,
            model: true,
            year: true,
            plateNumber: true,
            vin: true,
            color: true,
            status: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        payments: {
          include: {
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: { date: 'desc' },
        },
      },
    });

    if (!contract) {
      throw new NotFoundException(`Contract with ID ${id} not found`);
    }

    // Проверка доступа
    this.checkContractAccess(contract, currentUser);

    return contract;
  }

  async update(id: string, updateContractDto: UpdateContractDto, currentUser: any) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
    });

    if (!contract) {
      throw new NotFoundException(`Contract with ID ${id} not found`);
    }

    // Проверка доступа
    this.checkContractAccess(contract, currentUser);

    // Валидация обновлений
    if (updateContractDto.endDate) {
      const endDate = new Date(updateContractDto.endDate);
      if (endDate <= contract.startDate) {
        throw new BadRequestException('End date must be after start date');
      }
    }

    try {
      return await this.prisma.contract.update({
        where: { id },
        data: updateContractDto,
        include: {
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          vehicle: {
            select: {
              id: true,
              brand: true,
              model: true,
              plateNumber: true,
            },
          },
        },
      });
    } catch (error) {
      throw error;
    }
  }

  async updateStatus(id: string, updateStatusDto: UpdateStatusDto, currentUser: any) {
    const { status, reason, endDate } = updateStatusDto;

    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        driver: true,
        vehicle: true,
      },
    });

    if (!contract) {
      throw new NotFoundException(`Contract with ID ${id} not found`);
    }

    // Проверка доступа
    this.checkContractAccess(contract, currentUser);

    // Валидация изменения статуса
    if (contract.status === ContractStatus.COMPLETED) {
      throw new BadRequestException('Cannot change status of completed contract');
    }

    if (contract.status === ContractStatus.TERMINATED) {
      throw new BadRequestException('Cannot change status of terminated contract');
    }

    // Выполняем транзакцию для обновления статуса
    return this.prisma.$transaction(async (tx) => {
      // Обновляем контракт
      const updatedContract = await tx.contract.update({
        where: { id },
        data: { 
          status,
          endDate: endDate ? new Date(endDate) : contract.endDate,
          updatedAt: new Date(),
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
          vehicle: {
            select: {
              id: true,
              brand: true,
              model: true,
              plateNumber: true,
            },
          },
        },
      });

      // Обновляем статус автомобиля в зависимости от статуса контракта
      let vehicleStatus: VehicleStatus;
      
      if (status === ContractStatus.ACTIVE) {
        vehicleStatus = VehicleStatus.RENTED;
      } else if (status === ContractStatus.COMPLETED || status === ContractStatus.TERMINATED) {
        vehicleStatus = VehicleStatus.AVAILABLE;
      } else {
        vehicleStatus = contract.vehicle.status; // Не меняем статус для SUSPENDED
      }

      await tx.vehicle.update({
        where: { id: contract.vehicleId },
        data: { status: vehicleStatus },
      });

      // Возвращаем депозит при завершении контракта
      if ((status === ContractStatus.COMPLETED || status === ContractStatus.TERMINATED) && 
          Number(contract.deposit) > 0) {
        
        // Возвращаем депозит (увеличиваем доступный депозит)
        const newDepositBalance = Number(contract.driver.deposit) + Number(contract.deposit);
        
        await tx.driver.update({
          where: { id: contract.driverId },
          data: { deposit: newDepositBalance },
        });

        // Создаем запись о возврате депозита
        await tx.payment.create({
          data: {
            amount: Number(contract.deposit),
            type: PaymentType.REFUND,
            description: `Deposit unblocked for contract ${id}. Reason: ${reason || 'Contract ended'}`,
            driverId: contract.driverId,
            contractId: id,
            companyId: contract.companyId,
            createdById: currentUser.id,
          },
        });
      }

      return updatedContract;
    });
  }

  async remove(id: string, currentUser: any) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        payments: true,
      },
    });

    if (!contract) {
      throw new NotFoundException(`Contract with ID ${id} not found`);
    }

    // Проверка доступа
    this.checkContractAccess(contract, currentUser);

    // Можно удалять только неактивные контракты
    if (contract.status === ContractStatus.ACTIVE) {
      throw new BadRequestException('Cannot delete active contract');
    }

    // Проверяем, есть ли связанные платежи
    if (contract.payments.length > 0) {
      throw new BadRequestException('Cannot delete contract with payment history');
    }

    return this.prisma.contract.delete({
      where: { id },
    });
  }

  async getContractStats(id: string, currentUser: any) {
    const contract = await this.findOne(id, currentUser);

    const [totalPayments, totalFines, totalRent, daysActive] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          contractId: id,
          type: PaymentType.PAYMENT,
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          contractId: id,
          type: PaymentType.FINE,
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          contractId: id,
          type: PaymentType.DAILY_RENT,
        },
        _sum: { amount: true },
      }),
      this.calculateContractDays(contract),
    ]);

    return {
      contract,
      stats: {
        daysActive,
        totalPayments: totalPayments._sum.amount || 0,
        totalFines: totalFines._sum.amount || 0,
        totalRentPaid: totalRent._sum.amount || 0,
        expectedRent: daysActive * Number(contract.dailyRate),
        profitability: this.calculateProfitability(contract, Number(totalRent._sum.amount || 0)),
        isActive: contract.status === ContractStatus.ACTIVE,
      },
    };
  }

  async getActiveContracts(currentUser: any, companyId?: string) {
    return this.findAll(currentUser, companyId, ContractStatus.ACTIVE);
  }

  private calculateContractDays(contract: any): number {
    const start = new Date(contract.startDate);
    const end = contract.endDate ? new Date(contract.endDate) : new Date();
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  private calculateProfitability(contract: any, totalRentPaid: number): number {
    const daysActive = this.calculateContractDays(contract);
    const expectedRent = daysActive * Number(contract.dailyRate);
    
    if (expectedRent === 0) return 0;
    
    return Math.round((totalRentPaid / expectedRent) * 100 * 100) / 100; // Округляем до 2 знаков
  }

  private checkContractAccess(contract: any, currentUser: any) {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      return; // Super Admin имеет доступ ко всем контрактам
    }

    if (currentUser.userType === 'driver' && contract.driverId !== currentUser.id) {
      throw new ForbiddenException('Drivers can only access their own contracts');
    }

    if (currentUser.userType !== 'driver' && contract.companyId !== currentUser.companyId) {
      throw new ForbiddenException('Access denied to this contract');
    }
  }
}