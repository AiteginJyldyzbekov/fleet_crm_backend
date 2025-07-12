import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentType, ContractStatus } from '@prisma/client';
import { DailyBillingCompletedEvent, PaymentFailedEvent } from './events/billing.events';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Основной CRON JOB для ежедневного списания аренды
   * Запускается каждый день в 1:00 AM
   */
  @Cron('0 1 * * *', {
    name: 'daily-rental-billing',
    timeZone: 'Asia/Bishkek',
  })
// @Cron('*/30 * * * * *', {  // Каждые 30 секунд
//   name: 'daily-rental-billing',
//   timeZone: 'Asia/Bishkek',
// }) ТЕСТОВЫЙ КАЖДЫЕ 30 секунд
  async processDailyRentals() {
    this.logger.log('🔄 Запуск ежедневного списания аренды...');
    
    try {
      const stats = await this.processAllActiveContracts();
      
      // Эмитируем событие о завершении
      this.eventEmitter.emit('billing.daily.completed', new DailyBillingCompletedEvent(stats));

      this.logger.log(
        `✅ Обработка завершена. Контрактов: ${stats.total}, ` +
        `Успешно: ${stats.successful}, Ошибок: ${stats.failed}, ` +
        `Сумма: ${stats.totalAmount.toFixed(2)} сом`
      );

      return stats;
    } catch (error) {
      this.logger.error('💥 Критическая ошибка при обработке списания:', error);
      throw error;
    }
  }

  /**
   * Ручной запуск процесса списания (для тестирования)
   */
  async manualProcessDailyRentals() {
    this.logger.log('🔧 Ручной запуск ежедневного списания...');
    return await this.processDailyRentals();
  }

  /**
   * Обработка всех активных контрактов
   */
  private async processAllActiveContracts() {
    const stats = { total: 0, successful: 0, failed: 0, totalAmount: 0 };

    // Получаем активные контракты с минимальными данными
    const activeContracts = await this.prisma.contract.findMany({
      where: {
        status: ContractStatus.ACTIVE,
        OR: [
          { endDate: null },
          { endDate: { gte: new Date() } },
        ],
      },
      select: {
        id: true,
        dailyRate: true,
        driverId: true,
        companyId: true,
        driver: {
          select: {
            firstName: true,
            lastName: true,
            balance: true,
          },
        },
        vehicle: {
          select: {
            brand: true,
            model: true,
            plateNumber: true,
          },
        },
      },
    });

    this.logger.log(`📋 Найдено ${activeContracts.length} активных контрактов`);

    // Обрабатываем каждый контракт
    for (const contract of activeContracts) {
      stats.total++;
      
      try {
        const amount = await this.processContractPayment(contract);
        stats.successful++;
        stats.totalAmount += amount;
        
        // Показываем баланс после списания для мониторинга долгов
        const newBalance = contract.driver.balance.toNumber() - amount;
        const balanceStatus = newBalance < 0 ? `(ДОЛГ: ${Math.abs(newBalance).toFixed(2)})` : `(баланс: ${newBalance.toFixed(2)})`;
        
        this.logger.debug(
          `✅ ${contract.driver.firstName} ${contract.driver.lastName} - списано ${amount} сом ${balanceStatus}`
        );
      } catch (error) {
        stats.failed++;
        
        this.logger.error(
          `❌ ${contract.driver.firstName} ${contract.driver.lastName}: ${error.message}`
        );

        // Событие о неудачном платеже (теперь только для технических ошибок)
        this.eventEmitter.emit('billing.payment.failed', new PaymentFailedEvent(
          contract.id,
          contract.driverId,
          contract.dailyRate.toNumber(),
          error.message,
        ));

        // Записываем ошибку в платежи
        await this.createFailedPaymentRecord(contract, error.message);
      }
    }

    return stats;
  }

  /**
   * Обработка конкретного контракта - списание с баланса
   * Баланс может уходить в минус (долг водителя)
   */
  private async processContractPayment(contract: any): Promise<number> {
    const dailyRate = contract.dailyRate;

    // Атомарная транзакция списания (без проверки баланса)
    await this.prisma.$transaction(async (tx) => {
      // Списываем с баланса водителя (может уйти в минус)
      await tx.driver.update({
        where: { id: contract.driverId },
        data: { balance: { decrement: dailyRate } },
      });

      // Создаем запись о платеже
      await tx.payment.create({
        data: {
          amount: dailyRate,
          type: PaymentType.DAILY_RENT,
          description: `Ежедневная аренда ${contract.vehicle.brand} ${contract.vehicle.model} (${contract.vehicle.plateNumber})`,
          date: new Date(),
          driverId: contract.driverId,
          contractId: contract.id,
          companyId: contract.companyId,
        },
      });
    });

    return dailyRate.toNumber();
  }

  /**
   * Запись неудачного платежа в историю
   */
  private async createFailedPaymentRecord(contract: any, errorMessage: string) {
    try {
      await this.prisma.payment.create({
        data: {
          amount: contract.dailyRate,
          type: PaymentType.DAILY_RENT,
          description: `ОШИБКА: Ежедневная аренда ${contract.vehicle.brand} ${contract.vehicle.model}. ${errorMessage}`,
          date: new Date(),
          driverId: contract.driverId,
          contractId: contract.id,
          companyId: contract.companyId,
        },
      });
    } catch (error) {
      this.logger.error(`Не удалось записать ошибку для контракта ${contract.id}:`, error);
    }
  }

  /**
   * Получение статистики сегодняшних списаний (для мониторинга)
   */
  async getTodayBillingStats(companyId?: string) {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const whereClause: any = {
      type: PaymentType.DAILY_RENT,
      date: { gte: startOfDay, lte: endOfDay },
    };

    if (companyId) {
      whereClause.companyId = companyId;
    }

    const [payments, totalAmount] = await Promise.all([
      this.prisma.payment.findMany({
        where: whereClause,
        select: {
          id: true,
          amount: true,
          description: true,
          driver: {
            select: { firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.payment.aggregate({
        where: whereClause,
        _sum: { amount: true },
      }),
    ]);

    const successful = payments.filter(p => !p.description?.includes('ОШИБКА'));
    const failed = payments.filter(p => p.description?.includes('ОШИБКА'));

    return {
      date: startOfDay.toISOString().split('T')[0],
      total: payments.length,
      successful: successful.length,
      failed: failed.length,
      totalAmount: totalAmount._sum.amount?.toNumber() || 0,
      details: {
        successfulPayments: successful,
        failedPayments: failed,
      },
    };
  }

  /**
   * Получение водителей с отрицательным балансом (должники)
   */
  async getDriversInDebt(companyId?: string) {
    const whereClause: any = {
      balance: { lt: 0 }, // Только должники
      contracts: { some: { status: ContractStatus.ACTIVE } },
      isActive: true,
    };

    if (companyId) {
      whereClause.companyId = companyId;
    }

    const drivers = await this.prisma.driver.findMany({
      where: whereClause,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        balance: true,
        contracts: {
          where: { status: ContractStatus.ACTIVE },
          select: {
            id: true,
            dailyRate: true,
            startDate: true,
            vehicle: {
              select: { brand: true, model: true, plateNumber: true },
            },
          },
        },
      },
    });

    return drivers.map(driver => {
      const totalDailyRate = driver.contracts.reduce(
        (sum, contract) => sum + contract.dailyRate.toNumber(),
        0
      );

      const debtAmount = Math.abs(driver.balance.toNumber());
      const daysInDebt = totalDailyRate > 0 ? Math.ceil(debtAmount / totalDailyRate) : 0;

      return {
        driverId: driver.id,
        name: `${driver.firstName} ${driver.lastName}`,
        balance: driver.balance.toNumber(),
        debtAmount,
        dailyRate: totalDailyRate,
        daysInDebt,
        contracts: driver.contracts.map(c => ({
          contractId: c.id,
          vehicle: `${c.vehicle.brand} ${c.vehicle.model} (${c.vehicle.plateNumber})`,
          dailyRate: c.dailyRate.toNumber(),
          daysSinceStart: Math.ceil((new Date().getTime() - c.startDate.getTime()) / (1000 * 60 * 60 * 24)),
        })),
      };
    }).sort((a, b) => a.balance - b.balance); // Сортируем по размеру долга
  }
}