import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser') as typeof import('cookie-parser');
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { getAppConfig } from './config/app.config';
import { loadLocalEnvironment, validateEnvironment } from './config/env.validation';

export async function createApp() {
  loadLocalEnvironment();
  const env = validateEnvironment();
  const appConfig = getAppConfig(env);
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Cookie parser phải đứng trước guards để đọc được HttpOnly cookie
  app.use(cookieParser());

  app.enableCors({
    origin: appConfig.corsOrigin,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Set-Cookie'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalFilters(new GlobalExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  return { app, appConfig };
}

export async function bootstrap() {
  const { app, appConfig } = await createApp();
  await app.listen(appConfig.apiPort);
}

if (require.main === module) {
  void bootstrap();
}
