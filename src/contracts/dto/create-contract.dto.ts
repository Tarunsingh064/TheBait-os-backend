import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

class PartyOverrideDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
}

class PaymentTermsDto {
  @IsOptional()
  @IsIn(['fixed', 'hourly', 'monthly'])
  rateType?: 'fixed' | 'hourly' | 'monthly';

  @IsOptional()
  @Min(0)
  amountMinor?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  schedule?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  acceptedMethods?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  latePenalty?: string;
}

class DurationTermsDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  terminationConditions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  noticePeriod?: string;
}

export class CreateContractDto {
  @IsMongoId()
  clientId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PartyOverrideDto)
  partyAOverride?: PartyOverrideDto; // override the agency's own snapshot for this contract

  @IsOptional()
  @ValidateNested()
  @Type(() => PartyOverrideDto)
  partyBOverride?: PartyOverrideDto; // override the client's snapshot for this contract

  @IsDateString()
  effectiveDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  scopeOfWork?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentTermsDto)
  payment?: PaymentTermsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DurationTermsDto)
  duration?: DurationTermsDto;

  // Every clause below is optional — if omitted, ContractsService fills in
  // a sensible boilerplate default (see defaultClauses()).
  @IsOptional() @IsString() @MaxLength(3000) confidentiality?: string;
  @IsOptional() @IsString() @MaxLength(3000) intellectualProperty?: string;
  @IsOptional() @IsString() @MaxLength(3000) responsibilities?: string;
  @IsOptional() @IsString() @MaxLength(3000) warranties?: string;
  @IsOptional() @IsString() @MaxLength(3000) liability?: string;
  @IsOptional() @IsString() @MaxLength(3000) disputeResolution?: string;
  @IsOptional() @IsString() @MaxLength(120) governingLaw?: string;
  @IsOptional() @IsString() @MaxLength(3000) forceMajeure?: string;
  @IsOptional() @IsString() @MaxLength(3000) amendments?: string;
  @IsOptional() @IsString() @MaxLength(3000) entireAgreement?: string;
}