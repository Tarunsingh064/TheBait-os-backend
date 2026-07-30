import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateSpreadsheetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  rows?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  columns?: number;
}
