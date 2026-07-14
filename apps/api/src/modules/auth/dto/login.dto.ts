import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Email hoặc mật khẩu không chính xác.' })
  @IsNotEmpty({ message: 'Email hoặc mật khẩu không chính xác.' })
  @MaxLength(255)
  email!: string;

  @IsString({ message: 'Email hoặc mật khẩu không chính xác.' })
  @IsNotEmpty({ message: 'Email hoặc mật khẩu không chính xác.' })
  @MaxLength(128)
  password!: string;
}
