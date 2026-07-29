import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { BSC_REPORT_GRADES } from './reports.constants';

export class BscReportFilterDto {
  @IsOptional() @IsIn(['PERSONAL', 'MANAGEMENT']) viewScope?: 'PERSONAL' | 'MANAGEMENT';
  @IsOptional() @IsUUID() cycleId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsIn(['DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'REOPENED']) planStatus?: string;
  @IsOptional() @IsIn(['NOT_STARTED', 'DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'REOPENED']) evaluationStatus?: string;
  @IsOptional() @IsIn(BSC_REPORT_GRADES) finalGrade?: string;
  @IsOptional() @IsString() search?: string;
}

export class BscReportQueryDto extends BscReportFilterDto {
  @IsOptional() @Type(() => Number) @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsIn(['bsc_code', 'created_at', 'updated_at', 'final_score', 'plan_approved_at', 'evaluation_approved_at'])
  sortBy: 'bsc_code' | 'created_at' | 'updated_at' | 'final_score' | 'plan_approved_at' | 'evaluation_approved_at' = 'created_at';
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder: 'asc' | 'desc' = 'desc';
}

export class BscDashboardQueryDto {
  @IsOptional() @IsUUID() cycleId?: string;
}
