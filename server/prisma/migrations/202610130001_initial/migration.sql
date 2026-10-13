CREATE TYPE "MovementType" AS ENUM ('DEPOSIT', 'WITHDRAW');
CREATE TABLE "User" (
  "id" TEXT NOT NULL, "email" TEXT NOT NULL, "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Portfolio" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "cashCents" BIGINT NOT NULL DEFAULT 0, "contributedCents" BIGINT NOT NULL DEFAULT 0,
  "withdrawnCents" BIGINT NOT NULL DEFAULT 0, "paused" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CashMovement" (
  "id" TEXT NOT NULL, "portfolioId" TEXT NOT NULL, "type" "MovementType" NOT NULL,
  "amountCents" BIGINT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Portfolio_userId_key" ON "Portfolio"("userId");
CREATE INDEX "CashMovement_portfolioId_createdAt_idx" ON "CashMovement"("portfolioId", "createdAt");
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
