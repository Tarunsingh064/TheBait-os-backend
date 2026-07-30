import { IsMongoId } from 'class-validator';

export class SwitchAgencyDto {
  @IsMongoId()
  agencyId!: string;
}