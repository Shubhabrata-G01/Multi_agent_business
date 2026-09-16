-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "api_key_ciphertext" TEXT,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_by" TEXT,
    "locked_at" TIMESTAMP(3),
    "lease_expires_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Job_run_id_key" ON "Job"("run_id");

-- CreateIndex
CREATE INDEX "Job_status_available_at_idx" ON "Job"("status", "available_at");
