import { IsDecimal, IsEnum, IsOptional, IsString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaymentType } from '@prisma/client';

export class UpdateBalanceDto {
  @Transform(({ value }) => parseFloat(value))
  @Type(() => Number)
  @Min(0.01)
  amount: number;

  @IsEnum(PaymentType)
  type: PaymentType;

  @IsOptional()
  @IsString()
  description?: string;
}