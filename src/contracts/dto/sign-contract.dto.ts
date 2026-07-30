import { IsString, MinLength, MaxLength,IsOptional } from 'class-validator';

export class SignContractDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  witnessName?: string;
}