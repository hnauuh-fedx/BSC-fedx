import { Transform, Type } from 'class-transformer';
import { IsDefined, IsIn, IsInt, IsNotEmpty, IsNotIn, IsOptional, IsString, Length, Max, Min, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const normalizeCode = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value;
const normalizeLevel = ({ value }: { value: unknown }) => typeof value === 'string' ? (value.trim() ? Number(value.trim()) : null) : value;
const LEVEL_REQUIRED = 'Vui lòng nhập thứ bậc tổ chức.';
const LEVEL_INTEGER = 'Thứ bậc tổ chức phải là số nguyên.';
const LEVEL_RANGE = 'Thứ bậc tổ chức phải nằm trong khoảng từ 1 đến 999.';

export class PositionMutationDto {
  @Transform(normalizeCode) @IsString({ message: 'Mã chức danh phải là chuỗi.' }) @IsNotEmpty({ message: 'Vui lòng nhập mã chức danh.' }) @Length(1, 50, { message: 'Mã chức danh phải có từ 1 đến 50 ký tự.' }) @IsNotIn(['ADMIN'], { message: 'ADMIN là mã vai trò hệ thống, không phải mã chức danh.' }) code!: string;
  @Transform(trim) @IsString({ message: 'Tên chức danh phải là chuỗi.' }) @IsNotEmpty({ message: 'Vui lòng nhập tên chức danh.' }) @Length(1, 255, { message: 'Tên chức danh phải có từ 1 đến 255 ký tự.' }) name!: string;
  @Transform(normalizeLevel) @IsDefined({ message: LEVEL_REQUIRED }) @IsInt({ message: LEVEL_INTEGER }) @Min(1, { message: LEVEL_RANGE }) @Max(999, { message: LEVEL_RANGE }) level!: number;
}

export class UpdatePositionDto {
  @ValidateIf((_object, value) => value !== undefined) @Transform(normalizeCode) @IsString({ message: 'Mã chức danh phải là chuỗi.' }) @IsNotEmpty({ message: 'Vui lòng nhập mã chức danh.' }) @Length(1, 50, { message: 'Mã chức danh phải có từ 1 đến 50 ký tự.' }) @IsNotIn(['ADMIN'], { message: 'ADMIN là mã vai trò hệ thống, không phải mã chức danh.' }) code?: string;
  @ValidateIf((_object, value) => value !== undefined) @Transform(trim) @IsString({ message: 'Tên chức danh phải là chuỗi.' }) @IsNotEmpty({ message: 'Vui lòng nhập tên chức danh.' }) @Length(1, 255, { message: 'Tên chức danh phải có từ 1 đến 255 ký tự.' }) name?: string;
  @Transform(normalizeLevel) @ValidateIf((_object, value) => value !== undefined) @IsDefined({ message: LEVEL_REQUIRED }) @IsInt({ message: LEVEL_INTEGER }) @Min(1, { message: LEVEL_RANGE }) @Max(999, { message: LEVEL_RANGE }) level?: number;
}

export class PositionQueryDto {
  @IsOptional() @Transform(trim) @IsString() search?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
  @IsOptional() @Type(() => Number) @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsIn(['code', 'name', 'level', 'created_at']) sortBy: 'code' | 'name' | 'level' | 'created_at' = 'level';
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder: 'asc' | 'desc' = 'desc';
}
