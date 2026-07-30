import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RefreshTokenDocument = RefreshToken & Document;

@Schema({ timestamps: true })
export class RefreshToken {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  // never store the raw token — only a hash, same principle as a password
  @Prop({ required: true, unique: true })
  tokenHash!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ default: false })
  revoked!: boolean;

  // set when this token is rotated, pointing to the token that replaced it —
  // lets us detect reuse of a stolen/rotated-out token and revoke the whole chain
  @Prop({ type: String, default: null })
replacedByHash!: string | null;

  @Prop({ type: String, default: null })
userAgent!: string | null;

  @Prop({ type: String, default: null })
ip!: string | null;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);