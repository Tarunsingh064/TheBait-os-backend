import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Spreadsheet, SpreadsheetSchema } from '../schemas/spreadsheet.schema';
import { SpreadsheetsService } from './spreadsheets.service';
import { SpreadsheetsController } from './spreadsheets.controller';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Spreadsheet.name, schema: SpreadsheetSchema }]),
    SubscriptionsModule,
  ],
  controllers: [SpreadsheetsController],
  providers: [SpreadsheetsService],
})
export class SpreadsheetsModule {}
