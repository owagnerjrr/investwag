-- Additive provenance; preserve original observations and their hashes.
ALTER TABLE "QuantBar" ADD COLUMN "sourceDate" DATE;
ALTER TABLE "QuantBar" ADD COLUMN "provenance" JSONB;
