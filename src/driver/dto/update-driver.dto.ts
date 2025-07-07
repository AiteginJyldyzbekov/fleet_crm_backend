import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsBoolean } from 'class-validator';
import { CreateDriverDto } from './create-driver.dto';

export class UpdateDriverDto extends PartialType(CreateDriverDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Исключаем некоторые поля из обновления
  password?: never;
  email?: never;
  companyId?: never;
}