-- AlterTable
ALTER TABLE "UsageEvent" ADD COLUMN     "latency_ms" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "retries" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ProviderErrorEvent" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "error" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderErrorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderErrorEvent_organization_id_created_at_idx" ON "ProviderErrorEvent"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "ProviderErrorEvent_created_at_idx" ON "ProviderErrorEvent"("created_at");
