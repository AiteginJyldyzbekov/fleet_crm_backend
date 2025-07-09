import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { ContractStatus } from '@prisma/client';

export class UpdateStatusDto {
  @IsEnum(ContractStatus)
  status: ContractStatus;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string; // Для завершения контракта
}