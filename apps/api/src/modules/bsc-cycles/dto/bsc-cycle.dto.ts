import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { BscCycleStatus, BscCycleType } from '../bsc-cycle.policy';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CreateBscCycleDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(50)
  code!: string;

  @Transform(trim) @IsString() @MinLength(1) @MaxLength(255)
  name!: string;

  @IsIn(['MONTH'])
  cycleType!: BscCycleType;

  @Type(() => Number) @IsInt() @Min(2000) @Max(2200)
  year!: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12)
  month?: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;

}

export class UpdateBscCycleDto {
  @Transform(trim) @IsOptional() @IsString() @MinLength(1) @MaxLength(50)
  code?: string;

  @Transform(trim) @IsOptional() @IsString() @MinLength(1) @MaxLength(255)
  name?: string;

  @IsOptional() @IsIn(['MONTH'])
  cycleType?: BscCycleType;

  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2200)
  year?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12)
  month?: number;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @Type(() => Number) @IsInt() @Min(1)
  expectedVersion!: number;
}

export class TransitionBscCycleDto {
  @Type(() => Number) @IsInt() @Min(1)
  expectedVersion!: number;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  reason?: string;
}

export class QueryBscCycleDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2200)
  year?: number;

  @IsOptional() @IsIn(['MONTH', 'QUARTER', 'YEAR'])
  cycleType?: BscCycleType;

  @IsOptional() @IsIn(['DRAFT', 'OPEN', 'LOCKED', 'CLOSED'])
  status?: BscCycleStatus;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 20;

  @IsOptional() @IsIn(['start_date', 'end_date', 'year', 'created_at', 'updated_at', 'code', 'name'])
  sortBy: 'start_date' | 'end_date' | 'year' | 'created_at' | 'updated_at' | 'code' | 'name' = 'start_date';

  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
