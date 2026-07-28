import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class QueryNotificationsDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(50)
  limit = 20;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unreadOnly = false;
}

