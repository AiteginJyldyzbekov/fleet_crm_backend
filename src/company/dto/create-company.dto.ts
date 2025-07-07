import { IsString, IsEmail, IsOptional, IsNotEmpty, Length } from 'class-validator';

export class CreateCompanyDto {
  @IsNotEmpty()
  @IsString()
  @Length(2, 100)
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;
}