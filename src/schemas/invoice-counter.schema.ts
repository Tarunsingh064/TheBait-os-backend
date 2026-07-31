import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InvoiceCounterDocument = InvoiceCounter & Document;

@Schema()
export class InvoiceCounter {
  @Prop({ type: Types.ObjectId, ref: 'Agency', required: true, unique: true })
  agencyId!: Types.ObjectId;

  @Prop({ required: true, default: 0 })
  seq!: number;
}

export const InvoiceCounterSchema = SchemaFactory.createForClass(InvoiceCounter);