import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ContractDocument = Contract & Document;
export type ContractStatus = 'draft' | 'sent' | 'signed' | 'void';
export type PaymentRateType = 'fixed' | 'hourly' | 'monthly';

// Snapshotted at creation time — a contract is a historical legal document
// and must not silently change if the agency's address or a client's name
// is edited later. Reused for both parties (the agency and the client).
@Schema({ _id: false })
export class PartySnapshot {
  @Prop({ required: true, trim: true })
  legalName!: string;

  @Prop({ default: '', trim: true })
  address!: string;

  @Prop({ required: true, trim: true })
  email!: string;

  @Prop({ default: '', trim: true })
  phone!: string;
}
export const PartySnapshotSchema = SchemaFactory.createForClass(PartySnapshot);

@Schema({ _id: false })
export class PaymentTerms {
  @Prop({ type: String, enum: ['fixed', 'hourly', 'monthly'], default: 'fixed' })
  rateType!: PaymentRateType;

  // Minor units (paise) — same convention as Invoice, avoids float rounding.
  @Prop({ default: 0, min: 0 })
  amountMinor!: number;

  @Prop({ default: 'INR' })
  currency!: string;

  @Prop({ default: '', trim: true })
  schedule!: string;

  @Prop({ default: '', trim: true })
  acceptedMethods!: string;

  @Prop({ default: '', trim: true })
  latePenalty!: string;
}
export const PaymentTermsSchema = SchemaFactory.createForClass(PaymentTerms);

@Schema({ _id: false })
export class DurationTerms {
  @Prop({ type: Date, default: null })
  startDate!: Date | null;

  @Prop({ type: Date, default: null })
  endDate!: Date | null;

  @Prop({ default: '', trim: true })
  terminationConditions!: string;

  @Prop({ default: '', trim: true })
  noticePeriod!: string;
}
export const DurationTermsSchema = SchemaFactory.createForClass(DurationTerms);

@Schema({ timestamps: true })
export class Contract {
  @Prop({ type: Types.ObjectId, ref: 'Agency', required: true, index: true })
  agencyId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  clientId!: Types.ObjectId;

  // e.g. "Employment Agreement", "Service Agreement", "Freelance Contract"
  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ type: PartySnapshotSchema, required: true })
  partyA!: PartySnapshot; // the agency

  @Prop({ type: PartySnapshotSchema, required: true })
  partyB!: PartySnapshot; // the client

  @Prop({ required: true })
  effectiveDate!: Date;

  @Prop({ default: '', trim: true })
  scopeOfWork!: string;

  @Prop({ type: PaymentTermsSchema, default: () => ({}) })
  payment!: PaymentTerms;

  @Prop({ type: DurationTermsSchema, default: () => ({}) })
  duration!: DurationTerms;

  // The following are all free-text legal clauses. Each gets a sensible
  // boilerplate default filled in at creation time (see
  // ContractsService.defaultClauses()) so an agency owner isn't staring at
  // a blank "Force Majeure" field with no idea what belongs there — but
  // every clause remains fully editable, since this is not a substitute for
  // real legal counsel on anything high-stakes.
  @Prop({ default: '', trim: true })
  confidentiality!: string;

  @Prop({ default: '', trim: true })
  intellectualProperty!: string;

  @Prop({ default: '', trim: true })
  responsibilities!: string;

  @Prop({ default: '', trim: true })
  warranties!: string;

  @Prop({ default: '', trim: true })
  liability!: string;

  @Prop({ default: '', trim: true })
  disputeResolution!: string;

  @Prop({ default: '', trim: true })
  governingLaw!: string;

  @Prop({ default: '', trim: true })
  forceMajeure!: string;

  @Prop({ default: '', trim: true })
  amendments!: string;

  @Prop({ default: '', trim: true })
  entireAgreement!: string;

  @Prop({ type: String, required: true, enum: ['draft', 'sent', 'signed', 'void'], default: 'draft' })
  status!: ContractStatus;

  @Prop({ type: Date, default: null })
  sentAt!: Date | null;

  // Lightweight e-sign, not a legally-binding digital signature scheme —
  // good enough for an MVP; swap for a real e-sign provider (DocuSign,
  // HelloSign, etc.) if this needs to hold up legally later.
  @Prop({ type: String, default: null })
  signedByName!: string | null;

  // Uploaded via Cloudinary at signing time — a drawn/uploaded signature
  // image, separate from the typed legal name above.
  @Prop({ type: String, default: null })
  signatureImageUrl!: string | null;

  @Prop({ type: Date, default: null })
  signedAt!: Date | null;

  @Prop({ type: String, default: null })
  signedFromIp!: string | null;

  // Optional — "Witnesses or notarization if required." Left as a single
  // free-text name rather than a full second signature flow, since most
  // agency-client contracts won't need this.
  @Prop({ type: String, default: null })
  witnessName!: string | null;
}

export const ContractSchema = SchemaFactory.createForClass(Contract);