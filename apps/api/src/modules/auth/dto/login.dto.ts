import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { normalizeUsername, USERNAME_PATTERN } from '../../../common/username';

export class LoginDto {
  @IsString({ message: 'Tên đăng nhập hoặc mật khẩu không chính xác.' })
  @Transform(({ value }) => typeof value === 'string' ? normalizeUsername(value) : value)
  @IsNotEmpty({ message: 'Tên đăng nhập hoặc mật khẩu không chính xác.' })
  @MinLength(3, { message: 'Tên đăng nhập hoặc mật khẩu không chính xác.' })
  @MaxLength(50, { message: 'Tên đăng nhập hoặc mật khẩu không chính xác.' })
  @Matches(USERNAME_PATTERN, { message: 'Tên đăng nhập hoặc mật khẩu không chính xác.' })
  username!: string;

  @IsString({ message: 'Tên đăng nhập hoặc mật khẩu không chính xác.' })
  @IsNotEmpty({ message: 'Tên đăng nhập hoặc mật khẩu không chính xác.' })
  @MaxLength(128)
  password!: string;
}
