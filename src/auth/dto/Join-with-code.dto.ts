import { IsEmail, IsString, MaxLength, MinLength, Matches } from 'class-validator';

export class JoinWithCodeDto {
  @IsString()
  @MinLength(8)
  @MaxLength(12)
  code!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must include an uppercase letter, a lowercase letter, and a number',
  })
  password!: string;
}