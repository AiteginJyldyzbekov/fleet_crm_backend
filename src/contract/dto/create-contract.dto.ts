import { IsString, IsOptional, IsDateString, IsEnum, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ContractStatus } from '@prisma/client';

export class CreateContractDto {
  @IsString()
  driverId: string;

  @IsString()
  vehicleId: string;

  @Transform(({ value }) => parseFloat(value))
  @Type(() => Number)
  @Min(0.01)
  dailyRate: number;

  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @Type(() => Number)
  @Min(0)
  deposit?: number = 0;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus = ContractStatus.ACTIVE;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  companyId?: string; // Будет автоматически установлен
}