ALTER TABLE "SyncJob" ADD COLUMN "detailsDeferred" INTEGER, ADD COLUMN "detailPages" INTEGER;
CREATE TABLE "DetailImport" (
 "opportunityId" TEXT PRIMARY KEY REFERENCES "Opportunity"("id") ON DELETE CASCADE,
 "contentHash" TEXT NOT NULL, "kind" TEXT NOT NULL DEFAULT 'itens', "nextPage" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "DetailPage" (
 "opportunityId" TEXT NOT NULL REFERENCES "DetailImport"("opportunityId") ON DELETE CASCADE,
 "kind" TEXT NOT NULL, "page" INTEGER NOT NULL, "payload" JSONB NOT NULL,
 PRIMARY KEY ("opportunityId", "kind", "page")
);
