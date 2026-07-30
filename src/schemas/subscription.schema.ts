import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SubscriptionDocument = Subscription & Document;
export type SubscriptionTier = 'monthly' | 'yearly';
export type SubscriptionStatus = 'created' | 'authenticated' | 'active' | 'past_due' | 'halted' | 'cancelled';

@Schema({ timestamps: true })
export class Subscription {
  @Prop({ type: Types.ObjectId, ref: 'Agency', required: true, unique: true, index: true })
  agencyId!: Types.ObjectId;

  @Prop({ required: true, enum: ['monthly', 'yearly'] })
  tier!: SubscriptionTier;

  @Prop({ required: true })
  razorpayPlanId!: string;

  @Prop({ required: true, unique: true })
  razorpaySubscriptionId!: string;

  @Prop({
    required: true,
    enum: ['created', 'authenticated', 'active', 'past_due', 'halted', 'cancelled'],
    default: 'created',
  })
  status!: SubscriptionStatus;

  @Prop({ type: Date, default: null })
currentPeriodEnd!: Date | null;

  @Prop({ default: false })
  cancelAtPeriodEnd!: boolean;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
