import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSpreadsheetDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  // Full-grid replace, not a per-cell patch — the frontend holds the whole
  // grid in state anyway (it's a small dataset by design, not a millions-of-
  // rows spreadsheet engine), so "save" just PATCHes the entire data array.
  @IsOptional()
  @IsArray()
  data?: string[][];
}
