import { Transform } from 'class-transformer';
import { IsIn, IsString, Length } from 'class-validator';
import {
  APPEARANCE_THEMES,
  type AppearanceTheme,
} from '../types/appearance-theme.type';

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

export class UpdateAppearancePreferencesDto {
  @IsString()
  @IsIn(APPEARANCE_THEMES)
  appearanceTheme!: AppearanceTheme;
}
