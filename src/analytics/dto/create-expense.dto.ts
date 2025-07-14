import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ExpenseType, ExpensePayer } from '@prisma/client';

export class CreateExpenseDto {
  @ApiProperty({ 
    enum: ExpenseType,
    description: 'Тип расхода',
    examples: ['MAINTENANCE', 'REPAIR', 'INSURANCE', 'OTHER']
  })
  @IsEnum(ExpenseType)
  type: ExpenseType;

  @ApiProperty({ 
    description: 'Категория расхода',
    examples: ['Замена масла и фильтров', 'Ремонт тормозной системы', 'ОСАГО на год', 'Прочие расходы']
  })
  @IsString()
  category: string;

  @ApiProperty({ description: 'Сумма расхода в сомах' })
  @IsNumber()
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, description: 'ID автомобиля, если расход связан с конкретным авто' })
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @ApiProperty({ 
    enum: ExpensePayer, 
    default: ExpensePayer.COMPANY,
    description: 'Кто покрывает расход: автопарк или водитель'
  })
  @IsOptional()
  @IsEnum(ExpensePayer)
  paidBy?: ExpensePayer = ExpensePayer.COMPANY;

  @ApiProperty({ required: false })
  @IsOptional()
  date?: Date;
}