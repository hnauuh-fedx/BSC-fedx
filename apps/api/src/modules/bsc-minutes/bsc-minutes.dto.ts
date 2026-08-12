import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const optionalScore = /^(?:|\d+(?:\.\d{1,4})?)$/;
const assignableGrades = ['', 'D', 'C', 'B', 'A', 'A+'] as const;

export class BscMinutesIndividualRowDto {
  @IsUUID() id!: string;
  @Transform(trim) @IsString() @MaxLength(255) employeeName!: string;
  @IsOptional() @IsString() @MaxLength(50) selfScore!: string | null;
  @IsOptional() @IsString() @MaxLength(20) selfGrade!: string | null;
  @IsString() @Matches(optionalScore) unitScore!: string;
  @IsIn(assignableGrades) unitGrade!: string;
  @IsString() @MaxLength(5000) explanation!: string;
}

export class BscMinutesCollectiveRowDto {
  @IsUUID() id!: string;
  @Transform(trim) @IsString() @MaxLength(255) departmentName!: string;
  @IsString() @MaxLength(50) selfScore!: string;
  @IsString() @MaxLength(20) selfGrade!: string;
  @IsString() @Matches(optionalScore) unitScore!: string;
  @IsIn(assignableGrades) unitGrade!: string;
  @IsString() @MaxLength(5000) explanation!: string;
}

export class BscMinutesSnapshotDto {
  @IsArray() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => BscMinutesIndividualRowDto)
  rows!: BscMinutesIndividualRowDto[];

  @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => BscMinutesCollectiveRowDto)
  collectiveRows!: BscMinutesCollectiveRowDto[];
}

export class SaveBscMinutesDto {
  @IsUUID() cycleId!: string;
  @Transform(trim) @IsString() @MaxLength(50) number!: string;
  @Transform(trim) @IsString() @MaxLength(255) issuePlace!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime!: string;
  @Transform(trim) @IsString() @MaxLength(500) location!: string;
  @Transform(trim) @IsString() @MaxLength(255) chairName!: string;
  @Transform(trim) @IsString() @MaxLength(255) secretaryName!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(100000) absentCount!: number;
  @Transform(trim) @IsString() @MaxLength(5000) subject!: string;
  @Transform(trim) @IsString() @MaxLength(10000) meetingContent!: string;
  @Transform(trim) @IsString() @MaxLength(10000) nextMonthAssignment!: string;
  @Transform(trim) @IsString() @MaxLength(10000) conclusion!: string;
  @ValidateNested() @Type(() => BscMinutesSnapshotDto) snapshot!: BscMinutesSnapshotDto;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) expectedVersion?: number;
}

export class QueryBscMinutesDto {
  @IsOptional() @IsUUID() cycleId?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class RecordBscMinutesOutputDto {
  @IsIn(['PRINT', 'PDF']) type!: 'PRINT' | 'PDF';
}
