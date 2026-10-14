-- AlterTable
ALTER TABLE "QuantStrategy" ADD COLUMN "idempotencyKey" TEXT;
UPDATE "QuantStrategy" SET "idempotencyKey" = 'legacy_' || "id";
ALTER TABLE "QuantStrategy" ALTER COLUMN "idempotencyKey" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "QuantStrategy_userId_idempotencyKey_key" ON "QuantStrategy"("userId", "idempotencyKey");

