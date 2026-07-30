import { IsMongoId, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class CreateMeetingDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @IsString()
  @MinLength(20) // a real transcript, not a placeholder
  transcript: string;

  @IsOptional()
  @IsMongoId()
  clientId?: string;
}
