import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InviteCodeDocument = InviteCode & Document;
export type InviteCodeKind = 'agency_member' | 'client';

/**
 * One active code per (agency, kind) at a time. "Revoking" a code is
 * implemented as regenerating it — the old code string simply stops
 * matching anything once replaced, which is simpler and safer than tracking
 * a separate revoked/active flag that could drift.
 */
@Schema({ timestamps: true })
export class InviteCode {
  @Prop({ type: Types.ObjectId, ref: 'Agency', required: true, index: true })
  agencyId: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['agency_member', 'client'] })
  kind: InviteCodeKind;

  // Short, human-shareable code (e.g. "BAIT-7F3K2Q") — unique across the
  // whole system, not just per agency, since it's looked up with no other
  // context at join time.
  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;
}

export const InviteCodeSchema = SchemaFactory.createForClass(InviteCode);

// One active code per (agency, kind) — regenerating replaces this row's
// `code` field in place rather than creating a new document.
InviteCodeSchema.index({ agencyId: 1, kind: 1 }, { unique: true });
