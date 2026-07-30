import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
// Marks a route as reachable without a valid access token, e.g. /auth/login, /auth/register
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
