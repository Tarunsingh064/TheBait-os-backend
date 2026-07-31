import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
//import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
const cookieParser = require('cookie-parser');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // needed later for Razorpay webhook HMAC verification, same as The Bait
  });

  app.use(cookieParser());

  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/users/me') || req.path.startsWith('/api/auth/')) {
      console.log('[debug] ', req.method, req.path);
      console.log('[debug] raw Cookie header:', req.headers.cookie);
      console.log('[debug] parsed req.cookies:', (req as any).cookies);
    }
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strips unknown properties from incoming bodies
      forbidNonWhitelisted: true, // rejects requests that try to smuggle extra fields
      transform: true,
    }),
  );

  const allowedOrigins = (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean);
   app.enableCors({
    origin: process.env.CLIENT_URL?.split(',') ?? ['https://www.thebait.space/','https://the-bait-os-frontend.vercel.app','http://localhost:3000'],
    credentials: true,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  });

  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Agency OS backend running on port ${port}`);
}

bootstrap();
