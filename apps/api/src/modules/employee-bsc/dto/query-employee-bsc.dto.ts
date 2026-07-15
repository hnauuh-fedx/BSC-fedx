import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class QueryEmployeeBscDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsUUID() cycleId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsIn(['DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'REOPENED']) planStatus?: string;
  @IsOptional() @IsIn(['NOT_STARTED', 'DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'REOPENED']) evaluationStatus?: string;
  @IsOptional() @IsIn(['PLAN', 'EVALUATION']) stage?: 'PLAN' | 'EVALUATION';
  @IsOptional() @Type(() => Number) @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsIn(['bsc_code', 'created_at', 'updated_at', 'plan_submitted_at', 'evaluation_submitted_at'])
  sortBy: 'bsc_code' | 'created_at' | 'updated_at' | 'plan_submitted_at' | 'evaluation_submitted_at' = 'created_at';
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder: 'asc' | 'desc' = 'desc';
}
