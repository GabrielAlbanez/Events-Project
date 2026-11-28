-- Gemini three-line summary cache (additive, nullable).
ALTER TABLE "events" ADD COLUMN "aiSummary" JSONB;
ALTER TABLE "events" ADD COLUMN "aiSummaryHash" TEXT;
