import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsEnum, IsDateString } from 'class-validator';
import { CreateContractDto } from './create-contract.dto';
import { ContractStatus } from '@prisma/client';

export class UpdateContractDto extends PartialType(CreateContractDto) {
  // Исключаем некоторые поля из обновления
  driverId?: never;
  vehicleId?: never;
  companyId?: never;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}