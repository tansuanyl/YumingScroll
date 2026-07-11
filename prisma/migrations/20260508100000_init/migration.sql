CREATE TABLE "Project" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "inspiration" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "storyState" JSONB NOT NULL,
  "characterModels" JSONB NOT NULL,
  "sceneModels" JSONB NOT NULL,
  "videoFlows" JSONB NOT NULL,
  "assets" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaAsset" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "storageKey" TEXT,
  "provider" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "jobId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GenerationJob" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "requestPayload" JSONB NOT NULL,
  "resultPayload" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MediaAsset_projectId_idx" ON "MediaAsset"("projectId");
CREATE INDEX "MediaAsset_jobId_idx" ON "MediaAsset"("jobId");
CREATE INDEX "GenerationJob_projectId_idx" ON "GenerationJob"("projectId");
CREATE INDEX "GenerationJob_status_idx" ON "GenerationJob"("status");
CREATE INDEX "GenerationJob_targetType_targetId_idx" ON "GenerationJob"("targetType", "targetId");

ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GenerationJob"
  ADD CONSTRAINT "GenerationJob_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
