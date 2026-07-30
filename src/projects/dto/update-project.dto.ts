import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(['not_started', 'in_progress', 'on_hold', 'completed', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;
}
