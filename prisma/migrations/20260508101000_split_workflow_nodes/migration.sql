-- CreateTable
CREATE TABLE "CharacterModel" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "consistencyPrompt" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "imageAspectRatio" TEXT,
    "candidateImages" JSONB NOT NULL,
    "confirmedImageId" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SceneModel" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "visualKeywords" JSONB NOT NULL,
    "generationPrompt" TEXT,
    "imageAspectRatio" TEXT,
    "candidateImages" JSONB NOT NULL,
    "confirmedImageId" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SceneModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoFlow" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "shotId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "nodes" JSONB NOT NULL,
    "selectedCharacterModelId" TEXT,
    "selectedSceneModelId" TEXT,
    "selectedCharacterModelIds" JSONB NOT NULL,
    "selectedSceneModelIds" JSONB NOT NULL,
    "imagePrompt" TEXT,
    "imagePromptImageUrl" TEXT,
    "imagePromptImageName" TEXT,
    "prompt" TEXT NOT NULL,
    "actionDescription" TEXT NOT NULL,
    "emotion" TEXT NOT NULL,
    "cameraMovement" TEXT NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "aspectRatio" TEXT NOT NULL,
    "videoAssetId" TEXT,
    "pendingVideoJobId" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoFlow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CharacterModel_projectId_idx" ON "CharacterModel"("projectId");

-- CreateIndex
CREATE INDEX "CharacterModel_characterId_idx" ON "CharacterModel"("characterId");

-- CreateIndex
CREATE INDEX "CharacterModel_status_idx" ON "CharacterModel"("status");

-- CreateIndex
CREATE INDEX "SceneModel_projectId_idx" ON "SceneModel"("projectId");

-- CreateIndex
CREATE INDEX "SceneModel_status_idx" ON "SceneModel"("status");

-- CreateIndex
CREATE INDEX "VideoFlow_projectId_idx" ON "VideoFlow"("projectId");

-- CreateIndex
CREATE INDEX "VideoFlow_shotId_idx" ON "VideoFlow"("shotId");

-- CreateIndex
CREATE INDEX "VideoFlow_status_idx" ON "VideoFlow"("status");

-- AddForeignKey
ALTER TABLE "CharacterModel" ADD CONSTRAINT "CharacterModel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SceneModel" ADD CONSTRAINT "SceneModel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoFlow" ADD CONSTRAINT "VideoFlow_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
