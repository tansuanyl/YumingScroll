import { Router } from "express";
import { characterImageSchema, imagePromptImageSchema, sceneImageSchema, videoSchema } from "../schemas";
import type { MediaPipelineService } from "../services/MediaPipelineService";

export function createMediaRouter(media: MediaPipelineService): Router {
  const router = Router();

  router.get("/provider-status", (_req, res) => {
    res.json(media.status());
  });

  router.post("/generate-character-image", async (req, res, next) => {
    try {
      res.json(await media.generateCharacterImage(characterImageSchema.parse(req.body)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/generate-scene-image", async (req, res, next) => {
    try {
      res.json(await media.generateSceneImage(sceneImageSchema.parse(req.body)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/generate-image-prompt-image", async (req, res, next) => {
    try {
      res.json(await media.generateImagePromptImage(imagePromptImageSchema.parse(req.body)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/generate-video", async (req, res, next) => {
    try {
      res.json(await media.generateVideo(videoSchema.parse(req.body)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/jobs/:jobId", async (req, res, next) => {
    try {
      res.json(await media.getJob(req.params.jobId));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
