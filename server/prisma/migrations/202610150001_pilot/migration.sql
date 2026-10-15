-- Additive only: no changes to v1/v2 tables, balances, sessions or history.
CREATE TABLE "PilotAccount" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PAUSED',
 "state" JSONB NOT NULL, "policy" JSONB NOT NULL, "authorizedAt" TIMESTAMP(3),
 "lastRun" TIMESTAMP(3), "nextRun" TIMESTAMP(3), "failures" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "PilotAccount_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "PilotAccount_status_check" CHECK ("status" IN ('ACTIVE','PAUSED','PROTECTED','EMERGENCY')),
 CONSTRAINT "PilotAccount_failures_check" CHECK ("failures" >= 0)
);
CREATE TABLE "PilotEvent" (
 "id" TEXT NOT NULL, "accountId" TEXT NOT NULL, "key" TEXT NOT NULL, "kind" TEXT NOT NULL,
 "fingerprint" TEXT NOT NULL, "result" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PilotEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PilotMarket" (
 "symbol" TEXT NOT NULL, "market" TEXT NOT NULL, "snapshot" JSONB NOT NULL,
 "lastAttempt" TIMESTAMP(3), "failures" INTEGER NOT NULL DEFAULT 0, "error" TEXT,
 CONSTRAINT "PilotMarket_pkey" PRIMARY KEY ("symbol")
);
CREATE TABLE "PilotClock" (
 "id" TEXT NOT NULL, "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3), "lastTick" TIMESTAMP(3),
 "lastSuccess" TIMESTAMP(3), "lastError" TEXT,
 CONSTRAINT "PilotClock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PilotAccount_userId_key" ON "PilotAccount"("userId");
CREATE INDEX "PilotAccount_status_nextRun_idx" ON "PilotAccount"("status","nextRun");
CREATE UNIQUE INDEX "PilotEvent_accountId_key_key" ON "PilotEvent"("accountId","key");
CREATE INDEX "PilotEvent_accountId_createdAt_idx" ON "PilotEvent"("accountId","createdAt");
ALTER TABLE "PilotAccount" ADD CONSTRAINT "PilotAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PilotEvent" ADD CONSTRAINT "PilotEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PilotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
