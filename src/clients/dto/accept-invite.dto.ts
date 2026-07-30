import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class AcceptInviteDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must include an uppercase letter, a lowercase letter, and a number',
  })
  password: string;
}
