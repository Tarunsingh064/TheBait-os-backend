import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';

class LineItemDto {
  @IsString()
  description!: string;

  @Min(1)
  quantity!: number;

  @Min(0)
  unitAmountMinor!: number;
}

// Optional per-invoice overrides for the customer snapshot — anything not
// provided here falls back to the linked client User's name/email at
// creation time. See CustomerSnapshot on the Invoice schema for why this is
// a snapshot rather than a live reference.
class CustomerOverrideDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
}

export class CreateInvoiceDto {
  @IsMongoId()
  clientId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems!: LineItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CustomerOverrideDto)
  customer?: CustomerOverrideDto;

  @IsOptional()
  @IsIn(['none', 'percentage', 'fixed'])
  discountType?: 'none' | 'percentage' | 'fixed';

  @IsOptional()
  @Min(0)
  discountValue?: number;

  @IsOptional()
  @Min(0)
  taxMinor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  taxLabel?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsDateString()
  dueDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  lateFeePolicy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  // true = stays hidden from the client and no notification fires until
  // explicitly sent via POST /invoices/:id/send. false/omitted = the
  // existing immediate-send behavior.
  @IsOptional()
  @IsBoolean()
  saveAsDraft?: boolean;
}