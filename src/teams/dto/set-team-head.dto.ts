import { IsMongoId, IsOptional } from 'class-validator';

export class SetTeamHeadDto {
  // Omit or send null to clear the head.
  @IsOptional()
  @IsMongoId()
  headUserId?: string | null;
}
