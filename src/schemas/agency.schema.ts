import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AgencyDocument = Agency & Document;

@Schema({ timestamps: true })
export class Agency {
  @Prop({ required: true, trim: true })
  name!: string;

  // URL-safe unique identifier, e.g. used as subdomain or portal path: /agency/{slug}
  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  slug!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  ownerId!: Types.ObjectId;

  @Prop({ default: 'trial', enum: ['trial', 'active', 'past_due', 'suspended'] })
  status!: string;

  // Set once by the owner in Business Settings, reused on every invoice PDF —
  // this is what fills the "Business Information" and default "Payment
  // Information" / "Payment Terms" / "Notes" sections of an invoice.
  @Prop({ type: String, default: null })
  logoUrl!: string | null;

  @Prop({ default: '', trim: true })
  address!: string;

  @Prop({ default: '', trim: true })
  contactEmail!: string;

  @Prop({ default: '', trim: true })
  contactPhone!: string;

  @Prop({ default: '', trim: true })
  taxId!: string; // GST/VAT/Tax ID, labeled generically since this varies by country

  @Prop({ default: '', trim: true })
  bankDetails!: string; // free text — account name/number/IFSC/SWIFT, whatever the agency needs to show

  @Prop({ default: '', trim: true })
  upiId!: string;

  @Prop({ default: '', trim: true })
  paymentLink!: string; // e.g. a Razorpay/Stripe/PayPal link, shown as a fallback manual payment option

  @Prop({ default: 'Due on receipt', trim: true })
  defaultPaymentTerms!: string;

  @Prop({ default: '', trim: true })
  defaultNotes!: string;
}

export const AgencySchema = SchemaFactory.createForClass(Agency);