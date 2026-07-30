import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { SpreadsheetsService } from './spreadsheets.service';
import { CreateSpreadsheetDto } from './dto/create-spreadsheet.dto';
import { UpdateSpreadsheetDto } from './dto/update-spreadsheet.dto';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantGuard } from '../tenants/tenant.guard';
import { SubscriptionGuard } from '../subscriptions/subscription.guard';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB — generous for a spreadsheet, not for arbitrary file abuse

// Spreadsheets/Accounts is a paid-plan feature, same tier as Contracts/Meetings.
@Controller('spreadsheets')
@UseGuards(TenantGuard,SubscriptionGuard)
@Roles('agency_owner', 'agency_member', 'agency_team_head')
export class SpreadsheetsController {
  constructor(private spreadsheetsService: SpreadsheetsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSpreadsheetDto) {
    return this.spreadsheetsService.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.spreadsheetsService.findAll(user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.spreadsheetsService.findOne(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateSpreadsheetDto) {
    return this.spreadsheetsService.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.spreadsheetsService.remove(user, id);
  }

  /** Upload a new .xlsx/.xls/.csv file to create a fresh spreadsheet from it. */
  @Post('import')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async importNew(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.spreadsheetsService.importFromExcel(user, file.originalname, file.buffer);
  }

  /** Re-upload a file to overwrite an EXISTING spreadsheet's contents — "edit the existing Excel here." */
  @Post(':id/import')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async reimport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.spreadsheetsService.reimportFromExcel(user, id, file.buffer);
  }

  @Get(':id/export')
  async export(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.spreadsheetsService.exportToExcel(user, id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
