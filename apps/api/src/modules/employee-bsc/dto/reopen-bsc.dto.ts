import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateReopenRequestDto {
  @IsIn(['PLAN', 'EVALUATION']) stage!: 'PLAN' | 'EVALUATION';
  @IsString() @MaxLength(2000) reason!: string;
}

export class RejectReopenRequestDto {
  @IsString() @MaxLength(2000) reason!: string;
}

export class QueryReopenRequestDto {
  @IsOptional() @IsIn(['PLAN', 'EVALUATION']) stage?: 'PLAN' | 'EVALUATION';
  @IsOptional() @IsIn(['PENDING', 'APPROVED', 'REJECTED']) status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  @IsOptional() @Type(() => Number) @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @Min(1) @Max(100) limit = 20;
}

export class DuplicateBscDto {
  @IsUUID() targetCycleId!: string;
}
