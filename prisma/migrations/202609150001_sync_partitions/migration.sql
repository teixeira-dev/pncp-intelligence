CREATE TABLE "SyncPartition" (
 "modality" INTEGER NOT NULL PRIMARY KEY,
 "through" TIMESTAMP(3),
 "windowStart" TIMESTAMP(3),
 "windowEnd" TIMESTAMP(3),
 "nextPage" INTEGER NOT NULL DEFAULT 1 CHECK ("nextPage" >= 1),
 "retryAt" TIMESTAMP(3),
 "updatedAt" TIMESTAMP(3) NOT NULL
);
