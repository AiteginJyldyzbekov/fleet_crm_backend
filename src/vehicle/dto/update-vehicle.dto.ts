import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsEnum } from 'class-validator';
import { CreateVehicleDto } from './create-vehicle.dto';
import { VehicleStatus } from '@prisma/client';

export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {
  // Исключаем некоторые поля из обновления
  companyId?: never;
  vin?: never; // VIN нельзя менять

  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;
}