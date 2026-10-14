-- CreateTable
CREATE TABLE "QuantAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "lastFetch" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuantAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuantBar" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "priceMicros" BIGINT NOT NULL,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuantBar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuantAnalysis" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuantAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuantStrategy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'sma-cross-v1',
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuantStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuantRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "state" JSONB NOT NULL,
    "datasetHash" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuantRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuantEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuantEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuantAsset_userId_symbol_key" ON "QuantAsset"("userId", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "QuantBar_assetId_date_key" ON "QuantBar"("assetId", "date");

-- CreateIndex
CREATE INDEX "QuantAnalysis_assetId_createdAt_idx" ON "QuantAnalysis"("assetId", "createdAt");

-- CreateIndex
CREATE INDEX "QuantStrategy_userId_idx" ON "QuantStrategy"("userId");

-- CreateIndex
CREATE INDEX "QuantRun_userId_createdAt_idx" ON "QuantRun"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuantRun_userId_idempotencyKey_key" ON "QuantRun"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "QuantEvent_runId_key_key" ON "QuantEvent"("runId", "key");

-- AddForeignKey
ALTER TABLE "QuantAsset" ADD CONSTRAINT "QuantAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuantBar" ADD CONSTRAINT "QuantBar_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "QuantAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuantAnalysis" ADD CONSTRAINT "QuantAnalysis_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "QuantAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuantStrategy" ADD CONSTRAINT "QuantStrategy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuantRun" ADD CONSTRAINT "QuantRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuantEvent" ADD CONSTRAINT "QuantEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "QuantRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

