import { IsBoolean } from 'class-validator';

export class SetBillingAccessDto {
  @IsBoolean()
  granted: boolean;
}
