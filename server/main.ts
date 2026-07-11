import "reflect-metadata";
import express from "express";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { env } from "./env";
import { JsonErrorFilter } from "./nest/http-error.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  app.use(express.json({ limit: "10mb" }));
  app.useGlobalFilters(new JsonErrorFilter());

  await app.listen(env.PORT, env.HOST);
  console.log(`Nest API server listening on http://${env.HOST}:${env.PORT}`);
  console.log(`Project store: ${env.DATABASE_URL ? "postgres" : "json"}`);
}

void bootstrap();
