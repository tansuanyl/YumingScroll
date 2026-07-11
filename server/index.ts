import cors from "cors";
import express from "express";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env";
import { OpenAITextProvider } from "./providers/OpenAITextProvider";
import { SeedanceMediaProvider } from "./providers/SeedanceMediaProvider";
import { createMediaRouter } from "./routes/media";
import { createProjectRouter } from "./routes/projects";
import { createTextRouter } from "./routes/text";
import { MediaPipelineService } from "./services/MediaPipelineService";
import { JsonProjectStore } from "./services/ProjectStore";
import { PrismaProjectStore } from "./services/PrismaProjectStore";
import { TextPipelineService } from "./services/TextPipelineService";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const app = express();
const port = env.PORT;
const store = env.DATABASE_URL
  ? new PrismaProjectStore()
  : new JsonProjectStore(join(__dirname, "storage", "projects.json"));
const textProvider = new OpenAITextProvider();
const textPipeline = new TextPipelineService(textProvider);
const mediaPipeline = new MediaPipelineService(store, new SeedanceMediaProvider(), undefined, undefined, textProvider);

app.use(cors({ origin: env.WEB_ORIGIN }));
app.use(express.json({ limit: "10mb" }));
app.use("/api/projects", createProjectRouter(store));
app.use("/api/text", createTextRouter(store, textPipeline));
app.use("/api/media", createMediaRouter(mediaPipeline));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unknown server error";
  res.status(500).json({ error: message });
});

app.listen(port, () => {
  console.log(`API server listening on http://127.0.0.1:${port}`);
  console.log(`Project store: ${env.DATABASE_URL ? "postgres" : "json"}`);
});
