ALTER TABLE "AppUser"
  ADD COLUMN "billingMode" TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN "coinBalance" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "AppUser_billingMode_idx" ON "AppUser"("billingMode");

CREATE TABLE "CoinLedger" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "delta" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "action" TEXT,
  "projectId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoinLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CoinLedger_userId_idx" ON "CoinLedger"("userId");
CREATE INDEX "CoinLedger_type_idx" ON "CoinLedger"("type");
CREATE INDEX "CoinLedger_createdAt_idx" ON "CoinLedger"("createdAt");

CREATE TABLE "RechargeRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "amountCny" INTEGER NOT NULL,
  "coins" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "note" TEXT,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RechargeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RechargeRequest_userId_idx" ON "RechargeRequest"("userId");
CREATE INDEX "RechargeRequest_status_idx" ON "RechargeRequest"("status");
CREATE INDEX "RechargeRequest_createdAt_idx" ON "RechargeRequest"("createdAt");

CREATE TABLE "PasswordResetRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "contact" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PasswordResetRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PasswordResetRequest_userId_idx" ON "PasswordResetRequest"("userId");
CREATE INDEX "PasswordResetRequest_status_idx" ON "PasswordResetRequest"("status");
CREATE INDEX "PasswordResetRequest_createdAt_idx" ON "PasswordResetRequest"("createdAt");

ALTER TABLE "CoinLedger"
  ADD CONSTRAINT "CoinLedger_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RechargeRequest"
  ADD CONSTRAINT "RechargeRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PasswordResetRequest"
  ADD CONSTRAINT "PasswordResetRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
