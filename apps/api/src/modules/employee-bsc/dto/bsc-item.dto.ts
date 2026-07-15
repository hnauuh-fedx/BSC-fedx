import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';

const METHODS = ['ACTUAL_DIV_TARGET', 'TARGET_DIV_ACTUAL', 'BINARY', 'THRESHOLD'] as const;

export class CreateBscItemDto {
  @IsString() @Length(1, 50) kpiCode!: string;
  @IsString() @Length(1, 500) kpiName!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(50) measurementUnit?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ allowInfinity: false, allowNaN: false }) targetValue?: number;
  @IsOptional() @IsString() @MaxLength(5000) targetText?: string;
  @Type(() => Number) @IsNumber({ allowInfinity: false, allowNaN: false }) weight!: number;
  @IsIn(METHODS) calculationMethod!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder = 0;
}

export class UpdateBscItemDto {
  @IsOptional() @IsString() @Length(1, 50) kpiCode?: string;
  @IsOptional() @IsString() @Length(1, 500) kpiName?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(50) measurementUnit?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ allowInfinity: false, allowNaN: false }) targetValue?: number;
  @IsOptional() @IsString() @MaxLength(5000) targetText?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ allowInfinity: false, allowNaN: false }) weight?: number;
  @IsOptional() @IsIn(METHODS) calculationMethod?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateBscActualDto {
  /** For BINARY KPI definitions, the domain accepts only 1 (pass) or 0 (fail). */
  @IsOptional() @Type(() => Number) @IsNumber({ allowInfinity: false, allowNaN: false }) actualValue?: number;
  @IsOptional() @IsString() @MaxLength(5000) actualText?: string;
  @IsOptional() @IsString() @MaxLength(5000) employeeNote?: string;
}
