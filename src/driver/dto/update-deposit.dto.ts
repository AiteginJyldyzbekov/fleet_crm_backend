import { IsEnum, IsOptional, IsString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class UpdateDepositDto {
  @Transform(({ value }) => parseFloat(value))
  @Type(() => Number)
  @Min(0.01)
  amount: number;

  @IsEnum(['add', 'subtract'])
  operation: 'add' | 'subtract';

  @IsOptional()
  @IsString()
  reason?: string;
}