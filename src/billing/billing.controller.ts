import {
  Controller,
  Get,
  Post,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CompanyFilter } from './common/decorators/company-filter.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('💰 Billing - Автоматическое списание аренды')
@ApiBearerAuth()
@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('process-daily-rentals')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '🔧 Ручной запуск ежедневного списания',
    description: 'Принудительно запускает процесс списания аренды (для тестирования)',
  })
  @ApiResponse({
    status: 200,
    description: 'Обработка завершена',
    schema: {
      example: {
        success: true,
        message: 'Обработка завершена',
        stats: { total: 15, successful: 12, failed: 3, totalAmount: 1800 },
      },
    },
  })
  async manualProcessDailyRentals() {
    const stats = await this.billingService.manualProcessDailyRentals();
    
    return {
      success: true,
      message: 'Ежедневное списание обработано',
      stats,
    };
  }

  @Get('today-stats')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
  @ApiOperation({
    summary: '📊 Статистика сегодняшних списаний',
    description: 'Показывает результаты списаний за текущий день',
  })
  @ApiResponse({
    status: 200,
    description: 'Статистика получена',
    schema: {
      example: {
        date: '2025-07-12',
        total: 15,
        successful: 12,
        failed: 3,
        totalAmount: 1800,
      },
    },
  })
  async getTodayStats(@CompanyFilter() companyId: string) {
    return await this.billingService.getTodayBillingStats(companyId);
  }

  @Get('drivers-in-debt')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_MANAGER)
  @ApiOperation({
    summary: '💸 Водители-должники',
    description: 'Список водителей с отрицательным балансом (в долгах)',
  })
  @ApiResponse({
    status: 200,
    description: 'Список должников',
    schema: {
      example: [
        {
          driverId: 'driver_id',
          name: 'Иван Петров',
          balance: -450,
          debtAmount: 450,
          dailyRate: 150,
          daysInDebt: 3,
          contracts: [
            {
              contractId: 'contract_id',
              vehicle: 'Toyota Camry (01KG123A)',
              dailyRate: 150,
              daysSinceStart: 25,
            },
          ],
        },
      ],
    },
  })
  async getDriversInDebt(@CompanyFilter() companyId: string) {
    return await this.billingService.getDriversInDebt(companyId);
  }
}