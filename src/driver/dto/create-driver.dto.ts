import { IsEmail, IsString, MinLength, IsOptional, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateDriverDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @MinLength(2)
  firstName: string;

  @IsString()
  @MinLength(2)
  lastName: string;

  @IsString()
  phone: string;

  @IsString()
  licenseNumber: string;

  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @Type(() => Number)
  @Min(0)
  balance?: number = 0;

  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @Type(() => Number)
  @Min(0)
  deposit?: number = 0;

  @IsOptional()
  @IsString()
  companyId?: string;
}