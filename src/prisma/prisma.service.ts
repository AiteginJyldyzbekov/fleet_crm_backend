import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      // Можно добавить дополнительные настройки
      log: ['query', 'info', 'warn', 'error'], // Логирование запросов в dev режиме
    });
  }

  async onModuleInit() {
    // Подключаемся к базе данных при инициализации модуля
    await this.$connect();
    console.log('✅ Connected to PostgreSQL database');
  }

  async onModuleDestroy() {
    // Отключаемся от базы данных при завершении работы модуля
    await this.$disconnect();
    console.log('❌ Disconnected from PostgreSQL database');
  }

  // Helper метод для очистки базы данных (полезно для тестов)
  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean database in production!');
    }

    // Удаляем все записи в правильном порядке (учитывая foreign keys)
    await this.payment.deleteMany();
    await this.contract.deleteMany();
    await this.subscription.deleteMany();
    await this.driver.deleteMany();
    await this.vehicle.deleteMany();
    await this.user.deleteMany();
    await this.company.deleteMany();
  }

  // Helper метод для включения/выключения логов
  enableQueryLogging() {
    return new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });
  }
}