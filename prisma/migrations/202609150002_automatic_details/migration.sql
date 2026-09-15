ALTER TABLE "Opportunity" ADD COLUMN "detailsHash" TEXT,
 ADD COLUMN "detailsSyncedAt" TIMESTAMP(3),
 ADD COLUMN "detailsRetryAt" TIMESTAMP(3),
 ADD COLUMN "detailsError" TEXT;
CREATE INDEX "Opportunity_details_retry_idx" ON "Opportunity" ("detailsRetryAt", "discoveredAt") WHERE "detailsHash" IS NULL OR "detailsHash" <> "contentHash";
