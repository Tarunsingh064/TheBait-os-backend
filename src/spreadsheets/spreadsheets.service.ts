import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as XLSX from 'xlsx';
import { Spreadsheet, SpreadsheetDocument } from '../schemas/spreadsheet.schema';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { scopeToTenant } from '../tenants/tenant-scope.util';
import { CreateSpreadsheetDto } from './dto/create-spreadsheet.dto';
import { UpdateSpreadsheetDto } from './dto/update-spreadsheet.dto';
import { computeDisplayGrid } from './formula.util';

@Injectable()
export class SpreadsheetsService {
  constructor(@InjectModel(Spreadsheet.name) private sheetModel: Model<SpreadsheetDocument>) {}

  async create(user: AuthenticatedUser, dto: CreateSpreadsheetDto) {
    const { agencyId } = scopeToTenant(user);
    return this.sheetModel.create({
      agencyId,
      name: dto.name,
      data: Spreadsheet.blankGrid(dto.rows ?? 20, dto.columns ?? 10),
      createdBy: new Types.ObjectId(user.userId),
    });
  }

  async findAll(user: AuthenticatedUser) {
    const { agencyId } = scopeToTenant(user);
    // Exclude the (potentially large) data grid from the list view — only
    // the detail view needs the full cell contents.
    return this.sheetModel.find({ agencyId }).select('-data').sort({ updatedAt: -1 }).lean();
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const { agencyId } = scopeToTenant(user);
    const sheet = await this.sheetModel.findOne({ _id: id, agencyId }).lean();
    if (!sheet) throw new NotFoundException('Spreadsheet not found');
    return sheet;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateSpreadsheetDto) {
    const { agencyId } = scopeToTenant(user);
    const sheet = await this.sheetModel.findOne({ _id: id, agencyId });
    if (!sheet) throw new NotFoundException('Spreadsheet not found');

    if (dto.name !== undefined) sheet.name = dto.name;
    if (dto.data !== undefined) sheet.data = dto.data;

    await sheet.save();
    return sheet;
  }

  async remove(user: AuthenticatedUser, id: string) {
    const { agencyId } = scopeToTenant(user);
    const result = await this.sheetModel.deleteOne({ _id: id, agencyId });
    if (result.deletedCount === 0) throw new NotFoundException('Spreadsheet not found');
    return { deleted: true };
  }

  /**
   * Reads a worksheet cell-by-cell (rather than via sheet_to_json) so that a
   * cell holding a formula is preserved as our own "=" syntax instead of
   * being flattened to its last-calculated value. Cells without a formula
   * fall back to their formatted display text.
   *
   * Caveat worth knowing: Excel's formula language is far larger than what
   * this app's formula engine understands (SUM/AVERAGE/MIN/MAX/COUNT + basic
   * arithmetic). A complex imported formula (VLOOKUP, IF, etc.) will show as
   * "#ERROR!" in-app even though the raw formula text is preserved — it'll
   * still export back out correctly since we round-trip the formula text itself.
   */
  private worksheetToGrid(worksheet: XLSX.WorkSheet): string[][] {
    const ref = worksheet['!ref'];
    if (!ref) return Spreadsheet.blankGrid(20, 10);

    const range = XLSX.utils.decode_range(ref);
    const rows: string[][] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = worksheet[XLSX.utils.encode_cell({ r, c })];
        if (!cell) {
          row.push('');
        } else if (cell.f) {
          row.push(`=${cell.f}`);
        } else if (cell.w !== undefined) {
          row.push(String(cell.w));
        } else if (cell.v !== undefined) {
          row.push(String(cell.v));
        } else {
          row.push('');
        }
      }
      rows.push(row);
    }
    return rows.length > 0 ? rows : Spreadsheet.blankGrid(20, 10);
  }

  /**
   * Parses an uploaded .xlsx/.xls/.csv buffer into a grid and creates a new
   * Spreadsheet from it — the "upload an existing Excel file so the company
   * can edit it here" flow. Only the first worksheet is imported.
   */
  async importFromExcel(user: AuthenticatedUser, fileName: string, buffer: Buffer) {
    const { agencyId } = scopeToTenant(user);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = this.worksheetToGrid(worksheet);

    return this.sheetModel.create({
      agencyId,
      name: fileName.replace(/\.(xlsx|xls|csv)$/i, ''),
      data,
      createdBy: new Types.ObjectId(user.userId),
    });
  }

  /** Overwrites an EXISTING sheet's data from a re-uploaded Excel file — "make changes on the existing Excel" via re-upload. */
  async reimportFromExcel(user: AuthenticatedUser, id: string, buffer: Buffer) {
    const { agencyId } = scopeToTenant(user);
    const sheet = await this.sheetModel.findOne({ _id: id, agencyId });
    if (!sheet) throw new NotFoundException('Spreadsheet not found');

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    sheet.data = this.worksheetToGrid(worksheet);
    await sheet.save();
    return sheet;
  }

  /**
   * Exports a sheet back to a downloadable .xlsx buffer. Formula cells are
   * written as REAL Excel formulas (the `.f` property) with a cached
   * computed value (`.v`) alongside — so the file opens showing correct
   * numbers immediately AND stays live/editable as a formula in Excel,
   * rather than exporting as dead text.
   */
  async exportToExcel(user: AuthenticatedUser, id: string): Promise<{ buffer: Buffer; filename: string }> {
    const sheet = await this.findOne(user, id);
    const computedGrid = computeDisplayGrid(sheet.data);

    const worksheet = XLSX.utils.aoa_to_sheet(sheet.data);
    sheet.data.forEach((row, r) => {
      row.forEach((rawCell, c) => {
        if (!rawCell.startsWith('=')) return;
        const addr = XLSX.utils.encode_cell({ r, c });
        const computed = computedGrid[r][c];
        const numeric = parseFloat(computed);
        worksheet[addr] = Number.isNaN(numeric)
          ? { t: 'str', v: computed, f: rawCell.slice(1) }
          : { t: 'n', v: numeric, f: rawCell.slice(1) };
      });
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return { buffer, filename: `${sheet.name || 'spreadsheet'}.xlsx` };
  }
}
