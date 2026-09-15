CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'USER',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Organization" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Membership" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "PasswordReset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "RateLimit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "count" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "Company" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "tradeName" TEXT NOT NULL DEFAULT '',
  "cnpj" TEXT NOT NULL,
  "city" TEXT NOT NULL DEFAULT '',
  "state" TEXT NOT NULL DEFAULT '',
  "activity" TEXT NOT NULL DEFAULT '',
  "products" TEXT NOT NULL DEFAULT '',
  "services" TEXT NOT NULL DEFAULT '',
  "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "excludedTerms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "regions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "modalities" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "minValue" DECIMAL(20,2),
  "maxValue" DECIMAL(20,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "ContractingAgency" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "sphere" TEXT,
  "power" TEXT
);

CREATE TABLE "Opportunity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "agencyId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  "number" TEXT NOT NULL,
  "object" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "city" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "modality" INTEGER NOT NULL,
  "modalityName" TEXT NOT NULL,
  "disputeMode" TEXT,
  "officialStatus" TEXT NOT NULL,
  "estimatedValue" DECIMAL(20,2),
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "opensAt" TIMESTAMP(3),
  "closesAt" TIMESTAMP(3),
  "officialUrl" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "raw" JSONB NOT NULL,
  "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "OpportunityItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "opportunityId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(20,4),
  "unit" TEXT,
  "unitValue" DECIMAL(20,4),
  "raw" JSONB NOT NULL
);

CREATE TABLE "OpportunityDocument" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "opportunityId" TEXT NOT NULL,
  "officialId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "type" TEXT
);

CREATE TABLE "OpportunityMatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "reasons" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "Favorite" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "OpportunityTracking" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "Alert" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "companyId" TEXT,
  "name" TEXT NOT NULL,
  "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "state" TEXT,
  "city" TEXT,
  "agency" TEXT,
  "modality" INTEGER,
  "minValue" DECIMAL(20,2),
  "maxValue" DECIMAL(20,2),
  "minScore" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "email" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "alertId" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "emailedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AIAnalysis" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "SyncJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "source" TEXT NOT NULL DEFAULT 'PNCP',
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "received" INTEGER NOT NULL DEFAULT 0,
  "created" INTEGER NOT NULL DEFAULT 0,
  "updated" INTEGER NOT NULL DEFAULT 0,
  "unchanged" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT
);

CREATE TABLE "SyncLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "jobId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "SyncCursor" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "through" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "JobRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "entityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Membership_userId_organizationId_key" ON "Membership" ("userId","organizationId");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Session_expiresAt_idx" ON "Session" ("expiresAt");

ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Company" ADD CONSTRAINT "Company_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Company_organizationId_cnpj_key" ON "Company" ("organizationId","cnpj");

ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "ContractingAgency" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Opportunity_publishedAt_idx" ON "Opportunity" ("publishedAt");

CREATE INDEX "Opportunity_closesAt_idx" ON "Opportunity" ("closesAt");

CREATE INDEX "Opportunity_state_modality_idx" ON "Opportunity" ("state","modality");

CREATE INDEX "Opportunity_estimatedValue_idx" ON "Opportunity" ("estimatedValue");

CREATE INDEX "Opportunity_discoveredAt_idx" ON "Opportunity" ("discoveredAt");

ALTER TABLE "OpportunityItem" ADD CONSTRAINT "OpportunityItem_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "OpportunityItem_opportunityId_number_key" ON "OpportunityItem" ("opportunityId","number");

ALTER TABLE "OpportunityDocument" ADD CONSTRAINT "OpportunityDocument_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "OpportunityDocument_opportunityId_officialId_key" ON "OpportunityDocument" ("opportunityId","officialId");

ALTER TABLE "OpportunityMatch" ADD CONSTRAINT "OpportunityMatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OpportunityMatch" ADD CONSTRAINT "OpportunityMatch_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "OpportunityMatch_companyId_opportunityId_key" ON "OpportunityMatch" ("companyId","opportunityId");

CREATE INDEX "OpportunityMatch_companyId_score_idx" ON "OpportunityMatch" ("companyId","score");

ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Favorite_userId_opportunityId_key" ON "Favorite" ("userId","opportunityId");

ALTER TABLE "OpportunityTracking" ADD CONSTRAINT "OpportunityTracking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OpportunityTracking" ADD CONSTRAINT "OpportunityTracking_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "OpportunityTracking_userId_opportunityId_key" ON "OpportunityTracking" ("userId","opportunityId");

ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Alert" ADD CONSTRAINT "Alert_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Notification_alertId_opportunityId_key" ON "Notification" ("alertId","opportunityId");

CREATE INDEX "Notification_userId_readAt_idx" ON "Notification" ("userId","readAt");

ALTER TABLE "AIAnalysis" ADD CONSTRAINT "AIAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AIAnalysis" ADD CONSTRAINT "AIAnalysis_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "AIAnalysis_userId_opportunityId_contentHash_provider_model_version_key" ON "AIAnalysis" ("userId","opportunityId","contentHash","provider","model","version");

ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SyncJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog" ("userId","createdAt");

CREATE INDEX "Opportunity_search_idx" ON "Opportunity" USING GIN (to_tsvector('portuguese', coalesce("object",'') || ' ' || coalesce("description",'')));
