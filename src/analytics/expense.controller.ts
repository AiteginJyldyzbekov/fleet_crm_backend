import { Controller, Get, Post, Body, Param, Delete, Query, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { User } from '@prisma/client';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { ExpenseService } from './expense.service';

// Расширяем интерфейс Request для типизации пользователя
interface AuthenticatedRequest extends Request {
  user: User;
}

@ApiTags('Expenses')
@Controller('expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  private validateCompanyId(user: User): string {
    if (!user.companyId) {
      throw new BadRequestException('User must be associated with a company');
    }
    return user.companyId;
  }

  @Post()
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER')
  @ApiOperation({ summary: 'Create a new expense' })
  @ApiResponse({ status: 201, description: 'Expense created successfully' })
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() createExpenseDto: CreateExpenseDto,
  ) {
    const companyId = this.validateCompanyId(req.user);
    return this.expenseService.create(companyId, createExpenseDto);
  }

  @Get()
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER')
  @ApiOperation({ summary: 'Get all expenses' })
  async findAll(
    @Req() req: AuthenticatedRequest,
    @Query() query: any,
  ) {
    const companyId = this.validateCompanyId(req.user);
    return this.expenseService.findAll(companyId, query);
  }

  @Get('summary')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN', 'COMPANY_MANAGER')
  @ApiOperation({ summary: 'Get expense summary' })
  async getExpenseSummary(
    @Req() req: AuthenticatedRequest,
    @Query() query: AnalyticsQueryDto,
  ) {
    const companyId = this.validateCompanyId(req.user);
    return this.expenseService.getExpenseSummary(companyId, query);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN')
  @ApiOperation({ summary: 'Delete an expense' })
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const companyId = this.validateCompanyId(req.user);
    return this.expenseService.remove(companyId, id);
  }
}