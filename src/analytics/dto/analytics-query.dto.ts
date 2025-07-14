import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export enum DateRange {
  LAST_7_DAYS = 'last_7_days',
  LAST_30_DAYS = 'last_30_days',
  LAST_90_DAYS = 'last_90_days',
  THIS_MONTH = 'this_month',
  THIS_YEAR = 'this_year',
  CUSTOM = 'custom',
}

export class AnalyticsQueryDto {
  @ApiProperty({ enum: DateRange, required: false })
  @IsOptional()
  @IsEnum(DateRange)
  range?: DateRange = DateRange.LAST_30_DAYS;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  driverId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  includeInactive?: boolean = false;
}