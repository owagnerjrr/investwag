CREATE TABLE "Session" (
  "tokenHash" TEXT NOT NULL, "userId" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("tokenHash")
);
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashMovement" ADD COLUMN "idempotencyKey" TEXT;
UPDATE "CashMovement" SET "idempotencyKey" = 'legacy_' || "id";
ALTER TABLE "CashMovement" ALTER COLUMN "idempotencyKey" SET NOT NULL;
CREATE UNIQUE INDEX "CashMovement_portfolioId_idempotencyKey_key" ON "CashMovement"("portfolioId", "idempotencyKey");
ALTER TABLE "Portfolio" DROP CONSTRAINT "Portfolio_userId_fkey";
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashMovement" DROP CONSTRAINT "CashMovement_portfolioId_fkey";
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_nonnegative" CHECK ("cashCents" >= 0 AND "contributedCents" >= 0 AND "withdrawnCents" >= 0);
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_reconciled" CHECK ("cashCents" = "contributedCents" - "withdrawnCents");
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_positive" CHECK ("amountCents" > 0);
