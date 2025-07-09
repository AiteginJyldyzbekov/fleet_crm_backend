import { 
  Injectable, 
  NotFoundException, 
  ConflictException, 
  BadRequestException,
  ForbiddenException 
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { UpdateBalanceDto } from './dto/update-balance.dto';
import { UpdateDepositDto } from './dto/update-deposit.dto';
import { UserRole, PaymentType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class DriverService {
  constructor(private prisma: PrismaService) {}

  async create(createDriverDto: CreateDriverDto, currentUser: any) {
    const { email, password, firstName, lastName, phone, licenseNumber, balance, deposit, companyId } = createDriverDto;

    // Определяем companyId в зависимости от роли пользователя
    let targetCompanyId: string;
    
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      // Super Admin должен указать companyId
      if (!companyId) {
        throw new BadRequestException('Company ID is required when creating driver as Super Admin');
      }
      targetCompanyId = companyId;
    } else {
      // Company Admin может создавать водителей только в своей компании
      if (!currentUser.companyId) {
        throw new BadRequestException('User must belong to a company to create drivers');
      }
      targetCompanyId = currentUser.companyId;
    }

    // Проверяем, существует ли водитель с таким email
    const existingDriver = await this.prisma.driver.findUnique({
      where: { email },
    });

    if (existingDriver) {
      throw new ConflictException('Driver with this email already exists');
    }

    // Проверяем уникальность номера лицензии в пределах компании
    const existingLicense = await this.prisma.driver.findFirst({
      where: { 
        licenseNumber,
        companyId: targetCompanyId,
      },
    });

    if (existingLicense) {
      throw new ConflictException('Driver with this license number already exists in this company');
    }

    // Проверяем, существует ли компания
    const company = await this.prisma.company.findUnique({
      where: { id: targetCompanyId },
    });

    if (!company || !company.isActive) {
      throw new BadRequestException('Company not found or inactive');
    }

    // Хешируем пароль
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    try {
      return await this.prisma.driver.create({
        data: {
          email,
          password: hashedPassword,
          firstName,
          lastName,
          phone,
          licenseNumber,
          balance: balance || 0,
          deposit: deposit || 0,
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
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Driver with this email or license already exists');
      }
      throw error;
    }
  }

  async findAll(currentUser: any, companyId?: string) {
    let whereClause: any = {};

    if (currentUser.role === UserRole.SUPER_ADMIN) {
      // Super Admin может фильтровать по companyId или видеть всех
      if (companyId) {
        whereClause.companyId = companyId;
      }
    } else {
      // Company Admin/Manager видят только водителей своей компании
      whereClause.companyId = currentUser.companyId;
    }

    return this.prisma.driver.findMany({
      where: whereClause,
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
            payments: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, currentUser: any) {
    const driver = await this.prisma.driver.findUnique({
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
            vehicle: {
              select: {
                id: true,
                brand: true,
                model: true,
                plateNumber: true,
              },
            },
          },
        },
        payments: {
          orderBy: { date: 'desc' },
          take: 10, // Последние 10 платежей
        },
        _count: {
          select: {
            contracts: true,
            payments: true,
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundException(`Driver with ID ${id} not found`);
    }

    // Проверка доступа
    this.checkDriverAccess(driver, currentUser);

    return driver;
  }

  async update(id: string, updateDriverDto: UpdateDriverDto, currentUser: any) {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
    });

    if (!driver) {
      throw new NotFoundException(`Driver with ID ${id} not found`);
    }

    // Проверка доступа
    this.checkDriverAccess(driver, currentUser);

    try {
      return await this.prisma.driver.update({
        where: { id },
        data: updateDriverDto,
        include: {
          company: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Driver with this license number already exists');
      }
      throw error;
    }
  }

  async remove(id: string, currentUser: any) {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
    });

    if (!driver) {
      throw new NotFoundException(`Driver with ID ${id} not found`);
    }

    // Проверка доступа
    this.checkDriverAccess(driver, currentUser);

    // Проверяем, нет ли активных контрактов
    const activeContracts = await this.prisma.contract.count({
      where: {
        driverId: id,
        status: 'ACTIVE',
      },
    });

    if (activeContracts > 0) {
      throw new BadRequestException('Cannot delete driver with active contracts');
    }

    return this.prisma.driver.delete({
      where: { id },
    });
  }

  async updateBalance(id: string, updateBalanceDto: UpdateBalanceDto, currentUser: any) {
    const { amount, type, description } = updateBalanceDto;

    const driver = await this.prisma.driver.findUnique({
      where: { id },
    });

    if (!driver) {
      throw new NotFoundException(`Driver with ID ${id} not found`);
    }

    // Проверка доступа
    this.checkDriverAccess(driver, currentUser);

    // Рассчитываем новый баланс
    let balanceChange = amount;
    
    // Для штрафов и ежедневной аренды - вычитаем из баланса
    if (type === PaymentType.FINE || type === PaymentType.DAILY_RENT) {
      balanceChange = -amount;
    }

    const newBalance = Number(driver.balance) + balanceChange;

    // Выполняем транзакцию
    return this.prisma.$transaction(async (tx) => {
      // Обновляем баланс водителя
      const updatedDriver = await tx.driver.update({
        where: { id },
        data: { balance: newBalance },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Создаем запись о платеже
      await tx.payment.create({
        data: {
          amount,
          type,
          description: description || `Balance ${type.toLowerCase()}`,
          driverId: id,
          companyId: driver.companyId,
          createdById: currentUser.id,
        },
      });

      return updatedDriver;
    });
  }

  async updateDeposit(id: string, updateDepositDto: UpdateDepositDto, currentUser: any) {
    const { amount, operation, reason } = updateDepositDto;

    const driver = await this.prisma.driver.findUnique({
      where: { id },
    });

    if (!driver) {
      throw new NotFoundException(`Driver with ID ${id} not found`);
    }

    // Проверка доступа
    this.checkDriverAccess(driver, currentUser);

    let newDepositBalance: number;
    let paymentType: PaymentType;
    let description: string;

    if (operation === 'add') {
      newDepositBalance = Number(driver.deposit) + amount;
      paymentType = PaymentType.PAYMENT;
      description = reason || `Deposit top-up: +${amount}`;
    } else {
      newDepositBalance = Number(driver.deposit) - amount;
      if (newDepositBalance < 0) {
        throw new BadRequestException('Insufficient deposit balance');
      }
      paymentType = PaymentType.FINE;
      description = reason || `Deposit deduction: -${amount}`;
    }

    // Выполняем транзакцию
    return this.prisma.$transaction(async (tx) => {
      // Обновляем депозит водителя
      const updatedDriver = await tx.driver.update({
        where: { id },
        data: { deposit: newDepositBalance },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Создаем запись о движении депозита
      await tx.payment.create({
        data: {
          amount,
          type: paymentType,
          description,
          driverId: id,
          companyId: driver.companyId,
          createdById: currentUser.id,
        },
      });

      return updatedDriver;
    });
  }

  async getDriverStats(id: string, currentUser: any) {
    const driver = await this.findOne(id, currentUser);

    const [totalPayments, totalFines, totalRentPaid, activeContracts] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          driverId: id,
          type: PaymentType.PAYMENT,
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          driverId: id,
          type: PaymentType.FINE,
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          driverId: id,
          type: PaymentType.DAILY_RENT,
        },
        _sum: { amount: true },
      }),
      this.prisma.contract.count({
        where: {
          driverId: id,
          status: 'ACTIVE',
        },
      }),
    ]);

    return {
      driver,
      stats: {
        currentBalance: driver.balance,
        currentDeposit: driver.deposit,
        totalPayments: totalPayments._sum.amount || 0,
        totalFines: totalFines._sum.amount || 0,
        totalRentPaid: totalRentPaid._sum.amount || 0,
        activeContracts,
        isInDebt: Number(driver.balance) < 0,
      },
    };
  }

  async getPaymentHistory(id: string, currentUser: any, limit = 50) {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
    });

    if (!driver) {
      throw new NotFoundException(`Driver with ID ${id} not found`);
    }

    // Проверка доступа
    this.checkDriverAccess(driver, currentUser);

    return this.prisma.payment.findMany({
      where: { driverId: id },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { date: 'desc' },
      take: limit,
    });
  }

  private checkDriverAccess(driver: any, currentUser: any) {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      return; // Super Admin имеет доступ ко всем водителям
    }

    // Водители могут получать доступ только к своим данным
    if (currentUser.userType === 'driver' && driver.id !== currentUser.id) {
      throw new ForbiddenException('Drivers can only access their own data');
    }

    // Пользователи (не водители) должны принадлежать той же компании
    if (currentUser.userType !== 'driver' && driver.companyId !== currentUser.companyId) {
      throw new ForbiddenException('Access denied to this driver');
    }
  }
}