import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // FASE 10E: cookies para la sesión JWT HttpOnly (dm_session).
  app.use(cookieParser());

  const configService = app.get(ConfigService);
  // Puertos por worktree (ver <repoRoot>/.env.local). Fallback a los defaults
  // históricos: API_PORT/PORT=3001, WEB_PORT=5173.
  const port = Number(
    configService.get<string>('API_PORT') ?? configService.get<string>('PORT') ?? 3001,
  );
  const webPort = Number(configService.get<string>('WEB_PORT') ?? 5173);
  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
  const corsOrigins = configService.get<string>('CORS_ORIGINS', 'http://localhost:5173');

  // Global prefix
  app.setGlobalPrefix(apiPrefix);

  // CORS: siempre se permite el WEB_PORT de este worktree, además de CORS_ORIGINS.
  const allowedOrigins = [
    ...new Set(
      [...corsOrigins.split(','), `http://localhost:${webPort}`]
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  ];
  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Master Data Platform API')
    .setDescription('API for Master Data & Homologación de Artículos')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger docs: http://localhost:${port}/docs`);
}

bootstrap();
