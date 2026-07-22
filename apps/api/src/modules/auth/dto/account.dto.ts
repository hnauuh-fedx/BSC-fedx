import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class UpdateOwnProfileDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 255)
  fullName!: string;
}

export class ChangeOwnPasswordDto {
  @IsString()
  @Length(1, 128)
  currentPassword!: string;

  @IsString()
  newPassword!: string;
}
