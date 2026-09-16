CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'REVIEWER');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Membership" (
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL DEFAULT 'MEMBER',
    CONSTRAINT "Membership_pkey" PRIMARY KEY ("user_id", "organization_id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Membership_organization_id_idx" ON "Membership"("organization_id");

ALTER TABLE "Membership"
  ADD CONSTRAINT "Membership_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Membership"
  ADD CONSTRAINT "Membership_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,
    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ArtifactVersion" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "flow_step" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "gate_decision" TEXT,
    "gate_reason" TEXT,
    "data" JSONB NOT NULL,
    CONSTRAINT "ArtifactVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArtifactVersion_run_id_flow_step_attempt_key"
  ON "ArtifactVersion"("run_id", "flow_step", "attempt");
CREATE INDEX "Run_owner_id_created_at_idx" ON "Run"("owner_id", "created_at");
CREATE INDEX "ArtifactVersion_run_id_flow_step_attempt_idx"
  ON "ArtifactVersion"("run_id", "flow_step", "attempt");

ALTER TABLE "ArtifactVersion"
  ADD CONSTRAINT "ArtifactVersion_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
