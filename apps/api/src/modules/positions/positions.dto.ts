import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class PositionMutationDto { @IsString() @Length(1, 50) code!: string; @IsString() @Length(1, 255) name!: string; @Type(() => Number) @IsInt() @Min(1) level!: number; }
export class UpdatePositionDto { @IsOptional() @IsString() @Length(1, 50) code?: string; @IsOptional() @IsString() @Length(1, 255) name?: string; @IsOptional() @Type(() => Number) @IsInt() @Min(1) level?: number; }
export class PositionQueryDto { @IsOptional() @IsString() search?: string; @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string; @IsOptional() @Type(() => Number) @Min(1) page = 1; @IsOptional() @Type(() => Number) @Min(1) @Max(100) limit = 20; @IsOptional() @IsIn(['code', 'name', 'level', 'created_at']) sortBy: 'code' | 'name' | 'level' | 'created_at' = 'name'; @IsOptional() @IsIn(['asc', 'desc']) sortOrder: 'asc' | 'desc' = 'asc'; }
