import { IsMongoId } from 'class-validator';

export class TeamMemberDto {
  @IsMongoId()
  userId: string;
}
