-- AlterTable
ALTER TABLE "ArtifactVersion" ADD COLUMN     "agent_id" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "confidence" TEXT,
ADD COLUMN     "evidence_quality" TEXT;

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "ArtifactVersion_run_id_agent_id_idx" ON "ArtifactVersion"("run_id", "agent_id");

-- CreateIndex
CREATE INDEX "ArtifactVersion_run_id_confidence_idx" ON "ArtifactVersion"("run_id", "confidence");

-- CreateIndex
CREATE INDEX "Run_status_idx" ON "Run"("status");
