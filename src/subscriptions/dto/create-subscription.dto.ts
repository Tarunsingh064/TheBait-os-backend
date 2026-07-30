import { IsIn } from 'class-validator';

export class CreateSubscriptionDto {
  @IsIn(['monthly', 'yearly'])
  tier: 'monthly' | 'yearly';
}
