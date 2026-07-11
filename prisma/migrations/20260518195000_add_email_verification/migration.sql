ALTER TABLE "AppUser"
  ADD COLUMN "email" TEXT,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "emailVerificationTokenHash" TEXT,
  ADD COLUMN "emailVerificationExpiresAt" TIMESTAMP(3),
  ADD COLUMN "emailVerificationSentAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");
CREATE UNIQUE INDEX "AppUser_emailVerificationTokenHash_key" ON "AppUser"("emailVerificationTokenHash");
CREATE INDEX "AppUser_emailVerifiedAt_idx" ON "AppUser"("emailVerifiedAt");
