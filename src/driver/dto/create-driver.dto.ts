import { IsEmail, IsString, MinLength, IsOptional, IsDecimal } from 'class-validator';
import { Transform } from 'class-transformer';
import { Type } from 'class-transformer';

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
  balance?: number = 0;

  @IsOptional()
  @IsString()
  companyId?: string; // Будет автоматически установлен для Company Admin
}