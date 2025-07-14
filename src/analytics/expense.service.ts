import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@Injectable()
export class ExpenseService {
  constructor(private prisma: PrismaService) {}

  async create(companyId: string, createExpenseDto: CreateExpenseDto) {
    return this.prisma.expense.create({
      data: {
        ...createExpenseDto,
        companyId,
        date: createExpenseDto.date || new Date(),
      },
      include: {
        vehicle: {
          select: { model: true, plateNumber: true },
        },
      },
    });
  }

  async findAll(companyId: string, query: any) {
    const { page = 1, limit = 20, type, category, vehicleId, paidBy } = query;
    const skip = (page - 1) * limit;

    const where = {
      companyId,
      ...(type && { type }),
      ...(category && { category }),
      ...(vehicleId && { vehicleId }),
      ...(paidBy && { paidBy }),
    };

    const [expenses, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          vehicle: {
            select: { model: true, plateNumber: true },
          },
        },
      }),
      this.prisma.expense.count({ where }),
    ]);

    return {
      data: expenses,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getExpenseSummary(companyId: string, query: AnalyticsQueryDto) {
    const { startDate, endDate } = this.getDateRange(query);

    const [totalByType, totalByCategory, monthlyExpenses] = await Promise.all([
      this.prisma.expense.groupBy({
        by: ['type'],
        where: {
          companyId,
          paidBy: 'COMPANY', // Только расходы автопарка
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.expense.groupBy({
        by: ['category'],
        where: {
          companyId,
          paidBy: 'COMPANY',
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.getMonthlyExpenses(companyId, startDate, endDate),
    ]);

    const totalAmount = totalByType.reduce((sum, item) => sum + (item._sum.amount || 0), 0);
    const averageMonthlyExpense = monthlyExpenses.length > 0 
      ? monthlyExpenses.reduce((sum, item) => sum + item.amount, 0) / monthlyExpenses.length 
      : 0;

    return {
      totalAmount,
      averageMonthlyExpense,
      totalByType: totalByType.reduce((acc, item) => {
        acc[item.type] = {
          amount: item._sum.amount || 0,
          count: item._count,
        };
        return acc;
      }, {}),
      totalByCategory: totalByCategory.reduce((acc, item) => {
        acc[item.category] = {
          amount: item._sum.amount || 0,
          count: item._count,
        };
        return acc;
      }, {}),
      monthlyExpenses,
    };
  }

  async remove(companyId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, companyId },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    return this.prisma.expense.delete({
      where: { id },
    });
  }

  private async getMonthlyExpenses(companyId: string, startDate: Date, endDate: Date) {
    const expenses = await this.prisma.expense.findMany({
      where: {
        companyId,
        paidBy: 'COMPANY',
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        amount: true,
        date: true,
      },
      orderBy: { date: 'asc' },
    });

    const monthlyData = new Map<string, number>();
    
    for (const expense of expenses) {
      const monthKey = expense.date.toISOString().substring(0, 7); // YYYY-MM
      monthlyData.set(monthKey, (monthlyData.get(monthKey) || 0) + expense.amount);
    }

    return Array.from(monthlyData.entries()).map(([month, amount]) => ({
      month,
      amount,
    }));
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