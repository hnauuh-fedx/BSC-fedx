import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateEmployeeBscDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  employeeComment?: string;
}
