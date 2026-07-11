-- CreateTable
CREATE TABLE "WorkflowEdge" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourcePort" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetPort" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowEdge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowEdge_projectId_idx" ON "WorkflowEdge"("projectId");

-- CreateIndex
CREATE INDEX "WorkflowEdge_sourceType_sourceId_idx" ON "WorkflowEdge"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "WorkflowEdge_targetType_targetId_idx" ON "WorkflowEdge"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "WorkflowEdge_kind_idx" ON "WorkflowEdge"("kind");

-- AddForeignKey
ALTER TABLE "WorkflowEdge" ADD CONSTRAINT "WorkflowEdge_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
