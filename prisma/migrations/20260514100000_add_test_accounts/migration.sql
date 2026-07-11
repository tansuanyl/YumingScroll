ALTER TABLE "Project" ADD COLUMN "ownerUserId" TEXT;

CREATE TABLE "AppUser" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "displayName" TEXT,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "note" TEXT,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UsageLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "projectId" TEXT,
  "action" TEXT NOT NULL,
  "model" TEXT,
  "status" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UsageLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppUser_username_key" ON "AppUser"("username");
CREATE INDEX "AppUser_role_idx" ON "AppUser"("role");
CREATE INDEX "AppUser_status_idx" ON "AppUser"("status");
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE INDEX "UsageLog_userId_idx" ON "UsageLog"("userId");
CREATE INDEX "UsageLog_projectId_idx" ON "UsageLog"("projectId");
CREATE INDEX "UsageLog_action_idx" ON "UsageLog"("action");
CREATE INDEX "UsageLog_createdAt_idx" ON "UsageLog"("createdAt");
CREATE INDEX "Project_ownerUserId_idx" ON "Project"("ownerUserId");

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "AppUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuthSession"
  ADD CONSTRAINT "AuthSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "AppUser"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UsageLog"
  ADD CONSTRAINT "UsageLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "AppUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UsageLog"
  ADD CONSTRAINT "UsageLog_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
