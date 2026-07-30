import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InvoiceDocument = Invoice & Document;
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void';
export type DiscountType = 'none' | 'percentage' | 'fixed';

@Schema({ _id: false })
export class LineItem {
  @Prop({ required: true, trim: true })
  description!: string;

  @Prop({ required: true, min: 1 })
  quantity!: number;

  // stored in the smallest currency unit (paise for INR) to avoid float
  // rounding errors — same convention Razorpay itself uses for `amount`.
  @Prop({ required: true, min: 0 })
  unitAmountMinor!: number;
}

// Snapshotted at invoice creation time, not a live reference — an invoice is
// a historical document and shouldn't silently reflect a client's LATER
// profile edits. Defaults are pulled from the linked User at creation, but
// every field can be overridden per-invoice (e.g. billing to a client's
// company rather than the client personally).
@Schema({ _id: false })
export class CustomerSnapshot {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ default: '', trim: true })
  company!: string;

  @Prop({ default: '', trim: true })
  address!: string;

  @Prop({ required: true, trim: true })
  email!: string;

  @Prop({ default: '', trim: true })
  phone!: string;
}

export const CustomerSnapshotSchema = SchemaFactory.createForClass(CustomerSnapshot);

@Schema({ timestamps: true })
export class Invoice {
  @Prop({ type: Types.ObjectId, ref: 'Agency', required: true, index: true })
  agencyId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  clientId!: Types.ObjectId;

  // Human-facing number, unique per agency (not globally) — e.g. "INV-0007".
  @Prop({ required: true })
  invoiceNumber!: string;

  @Prop({ default: 'INR' })
  currency!: string;

  @Prop({ type: CustomerSnapshotSchema, required: true })
  customer!: CustomerSnapshot;

  @Prop({ type: [LineItem], required: true })
  lineItems!: LineItem[];

  @Prop({ required: true, min: 0 })
  subtotalMinor!: number;

  @Prop({ type: String, enum: ['none', 'percentage', 'fixed'], default: 'none' })
  discountType!: DiscountType;

  // Interpreted per discountType: a whole-number percentage (e.g. 10 = 10%)
  // when 'percentage', or a minor-unit amount directly when 'fixed'.
  @Prop({ default: 0, min: 0 })
  discountValue!: number;

  // Computed at creation time from discountType/discountValue so every
  // downstream read (PDF, list view) just uses this without recalculating.
  @Prop({ default: 0, min: 0 })
  discountMinor!: number;

  @Prop({ default: 0, min: 0 })
  taxMinor!: number;

  // Display label only (e.g. "GST 18%", "VAT", "Sales Tax") — taxMinor is
  // still just entered as a plain amount, this is purely for how it reads
  // on the invoice/PDF.
  @Prop({ default: '', trim: true })
  taxLabel!: string;

  @Prop({ required: true, min: 0 })
  totalMinor!: number;

  @Prop({
    type: String,
    required: true,
    enum: ['draft', 'sent', 'paid', 'overdue', 'void'],
    default: 'draft',
  })
  status!: InvoiceStatus;

  @Prop({ required: true })
  issueDate!: Date;

  @Prop({ required: true })
  dueDate!: Date;

  // e.g. "Due on receipt", "Net 15", "Net 30" — defaults from the agency's
  // Business Settings but can be overridden per invoice.
  @Prop({ default: '', trim: true })
  paymentTerms!: string;

  @Prop({ default: '', trim: true })
  lateFeePolicy!: string;

  // Thank-you message / refund / warranty notes — defaults from the
  // agency's Business Settings but editable per invoice.
  @Prop({ default: '', trim: true })
  notes!: string;

  @Prop({ type: String, default: null })
  razorpayOrderId!: string | null;

  @Prop({ type: Date, default: null })
  paidAt!: Date | null;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);

// One invoice number per agency, not globally unique — two different
// agencies can both have "INV-0001".
InvoiceSchema.index({ agencyId: 1, invoiceNumber: 1 }, { unique: true });