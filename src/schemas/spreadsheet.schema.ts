import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SpreadsheetDocument = Spreadsheet & Document;

@Schema({ timestamps: true })
export class Spreadsheet {
  @Prop({ type: Types.ObjectId, ref: 'Agency', required: true, index: true })
  agencyId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  // Grid stored as rows of plain-text cell values — no formulas, no cell
  // formatting. This is a lightweight "good enough to replace a basic Excel
  // sheet for tracking numbers" grid, not a spreadsheet engine. Each inner
  // array is one row; cells are always strings, parsed as numbers on the
  // frontend/export step where needed.
  @Prop({ type: [[String]], default: () => Spreadsheet.blankGrid(20, 10) })
  data: string[][];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  static blankGrid(rows: number, cols: number): string[][] {
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''));
  }
}

export const SpreadsheetSchema = SchemaFactory.createForClass(Spreadsheet);
