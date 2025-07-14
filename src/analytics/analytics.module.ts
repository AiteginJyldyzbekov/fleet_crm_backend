import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { FinancialAnalyticsService } from './financial-analytics.service';
import { FleetAnalyticsService } from './fleet-analytics.service';
import { DriverAnalyticsService } from './driver-analytics.service';
import { ExpenseService } from './expense.service';
import { ExpenseController } from './expense.controller';
import { AnalyticsListener } from './listeners/analytics.listener';

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  controllers: [AnalyticsController, ExpenseController],
  providers: [
    AnalyticsService,
    FinancialAnalyticsService,
    FleetAnalyticsService,
    DriverAnalyticsService,
    ExpenseService,
    AnalyticsListener,
  ],
  exports: [
    AnalyticsService,
    FinancialAnalyticsService,
    FleetAnalyticsService,
    DriverAnalyticsService,
    ExpenseService,
  ],
})
export class AnalyticsModule {}