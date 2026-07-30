import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateBusinessInfoDto {
  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bankDetails?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  upiId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  paymentLink?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  defaultPaymentTerms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  defaultNotes?: string;
}