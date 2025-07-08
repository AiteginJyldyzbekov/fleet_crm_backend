import { IsString, IsInt, IsEnum, IsOptional, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { VehicleStatus } from '@prisma/client';

export class CreateVehicleDto {
  @IsString()
  @Transform(({ value }) => value?.trim())
  brand: string;

  @IsString()
  @Transform(({ value }) => value?.trim())
  model: string;

  @IsInt()
  @Type(() => Number)
  @Min(1900)
  @Max(new Date().getFullYear() + 1)
  year: number;

  @IsString()
  @Transform(({ value }) => value?.trim().toUpperCase())
  plateNumber: string;

  @IsString()
  @Transform(({ value }) => value?.trim().toUpperCase())
  vin: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  color?: string;

  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus = VehicleStatus.AVAILABLE;

  @Transform(({ value }) => parseFloat(value))
  @Type(() => Number)
  @Min(0.01)
  dailyRate: number;

  @IsOptional()
  @IsString()
  companyId?: string; // Будет автоматически установлен для Company Admin
}