import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateIf } from 'class-validator';

export class DepartmentMutationDto {
  @IsString() @Length(1, 50) code!: string;
  @IsString() @Length(1, 255) name!: string;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsUUID() parentId?: string | null;
}
export class UpdateDepartmentDto {
  @IsOptional() @IsString() @Length(1, 50) code?: string;
  @IsOptional() @IsString() @Length(1, 255) name?: string;
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsUUID() parentId?: string | null;
}
export class DepartmentQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
  @IsOptional() @Type(() => Number) @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsIn(['code', 'name', 'created_at']) sortBy: 'code' | 'name' | 'created_at' = 'name';
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder: 'asc' | 'desc' = 'asc';
}
export class SetDepartmentManagerDto {
  @IsUUID() managerId!: string;
  @IsString() @Length(1, 2000) reason!: string;
}
