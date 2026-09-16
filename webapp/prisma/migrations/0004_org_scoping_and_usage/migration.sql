/*
  Warnings:

  - Added the required column `organization_id` to the `Run` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "estimated_cost_usd" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsageEvent_organization_id_created_at_idx" ON "UsageEvent"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "UsageEvent_user_id_created_at_idx" ON "UsageEvent"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "UsageEvent_run_id_idx" ON "UsageEvent"("run_id");

-- CreateIndex
CREATE INDEX "Run_organization_id_created_at_idx" ON "Run"("organization_id", "created_at");
