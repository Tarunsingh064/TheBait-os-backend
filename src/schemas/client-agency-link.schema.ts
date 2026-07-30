import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ClientAgencyLinkDocument = ClientAgencyLink & Document;

/**
 * A client can belong to multiple agencies (e.g. hiring both a design studio
 * and a marketing agency). `User.agencyId` only tracks which one is
 * *currently active* in their session/JWT — this table is the source of
 * truth for the full list, and is what the agency switcher reads from.
 */
@Schema({ timestamps: true })
export class ClientAgencyLink {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  clientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Agency', required: true, index: true })
  agencyId: Types.ObjectId;
}

export const ClientAgencyLinkSchema = SchemaFactory.createForClass(ClientAgencyLink);

// A client can only be linked to the same agency once.
ClientAgencyLinkSchema.index({ clientId: 1, agencyId: 1 }, { unique: true });
