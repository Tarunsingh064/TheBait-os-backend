import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PaymentDocument = Payment & Document;

export type PaymentStatus = 'created' | 'authorized' | 'captured' | 'failed' | 'refunded';

@Schema({ timestamps: true })
export class Payment {
  @Prop({ type: Types.ObjectId, ref: 'Agency', required: true, index: true })
  agencyId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Invoice', required: true, index: true })
  invoiceId: Types.ObjectId;

  @Prop({ required: true })
  razorpayOrderId: string;

  // Absent until the payment actually completes — but once present, must be
  // unique. This uniqueness constraint IS the idempotency guarantee: a
  // webhook retried by Razorpay (which it does on any non-2xx or timeout)
  // can never create a second Payment row for the same razorpayPaymentId.
  @Prop({ type: String, default: null, unique: true, sparse: true })
  razorpayPaymentId: string | null;

  @Prop({ type: String, default: null })
  razorpaySignature: string | null;

  @Prop({ required: true, min: 0 })
  amountMinor: number;

  @Prop({ default: 'INR' })
  currency: string;

  @Prop({
    type: String,
    required: true,
    enum: ['created', 'authorized', 'captured', 'failed', 'refunded'],
    default: 'created',
  })
  status: PaymentStatus;

  // Raw webhook body for the event that last updated this record — invaluable
  // when a payment dispute or reconciliation question comes up later.
  @Prop({ type: Object, default: null })
  lastWebhookPayload: Record<string, unknown> | null;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
