import { IsEnum, IsOptional, IsString } from 'class-validator';
import { VehicleStatus } from '@prisma/client';

export class UpdateStatusDto {
  @IsEnum(VehicleStatus)
  status: VehicleStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}