import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class InviteClientDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;
}
