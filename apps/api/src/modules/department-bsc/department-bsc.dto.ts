import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
import { BSC_GOAL_GROUP_CODES } from '../employee-bsc/bsc-goal-groups';

export class CreateDepartmentBscDto { @IsUUID() cycleId!: string; }
export class UpdateDepartmentBscDto { @IsOptional() @IsString() @MaxLength(5000) managerComment?: string; }
export class QueryDepartmentBscDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsUUID() cycleId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsIn(['DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'REOPENED']) planStatus?: string;
  @IsOptional() @IsIn(['NOT_STARTED', 'DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'REOPENED']) evaluationStatus?: string;
  @IsOptional() @IsIn(['PLAN', 'EVALUATION']) stage?: 'PLAN' | 'EVALUATION';
  @IsOptional() @Type(() => Number) @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @Min(1) @Max(100) limit = 20;
}
export class CreateDepartmentBscItemDto {
  @IsString() @Length(1, 50) kpiCode!: string;
  @IsString() @Length(1, 500) kpiName!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsIn(BSC_GOAL_GROUP_CODES) goalGroupCode?: string;
  @IsOptional() @IsString() @Length(1, 100) measurementUnit?: string;
  @IsOptional() @IsString() @Length(1, 100) measurementFrequency?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ allowInfinity: false, allowNaN: false }) targetValue?: number;
  @IsOptional() @IsString() @MaxLength(5000) targetText?: string;
  @Type(() => Number) @IsNumber({ allowInfinity: false, allowNaN: false }) weight!: number;
  @IsOptional() @IsIn(['ACTUAL_DIV_TARGET', 'TARGET_DIV_ACTUAL', 'BINARY']) calculationMethod?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder = 0;
}
export class UpdateDepartmentBscItemDto {
  @IsOptional() @IsString() @Length(1, 50) kpiCode?: string;
  @IsOptional() @IsString() @Length(1, 500) kpiName?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsIn(BSC_GOAL_GROUP_CODES) goalGroupCode?: string;
  @IsOptional() @IsString() @Length(1, 100) measurementUnit?: string;
  @IsOptional() @IsString() @Length(1, 100) measurementFrequency?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ allowInfinity: false, allowNaN: false }) targetValue?: number;
  @IsOptional() @IsString() @MaxLength(5000) targetText?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ allowInfinity: false, allowNaN: false }) weight?: number;
  @IsOptional() @IsIn(['ACTUAL_DIV_TARGET', 'TARGET_DIV_ACTUAL', 'BINARY']) calculationMethod?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}
export class UpdateDepartmentBscActualDto {
  @IsOptional() @Type(() => Number) @IsNumber({ allowInfinity: false, allowNaN: false }) actualValue?: number;
  @IsOptional() @IsString() @MaxLength(5000) actualText?: string;
  @IsOptional() @IsString() @MaxLength(5000) managerNote?: string;
}
export class ReturnDepartmentBscDto { @IsString() @Length(1, 2000) reason!: string; }
export class DuplicateDepartmentBscDto { @IsUUID() targetCycleId!: string; }
export class DepartmentBscReopenDto {
  @IsIn(['PLAN', 'EVALUATION']) stage!: 'PLAN' | 'EVALUATION';
  @IsString() @Length(1, 2000) reason!: string;
}
export class ReviewDepartmentBscReopenDto { @IsOptional() @IsString() @MaxLength(2000) reason?: string; }
