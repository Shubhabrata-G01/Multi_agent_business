-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "flow_step" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "task_id" TEXT,
    "author_id" TEXT NOT NULL,
    "author_email" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepReview" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "flow_step" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "reviewer_id" TEXT,
    "reviewer_email" TEXT,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StepReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Comment_run_id_flow_step_attempt_idx" ON "Comment"("run_id", "flow_step", "attempt");

-- CreateIndex
CREATE INDEX "StepReview_run_id_idx" ON "StepReview"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "StepReview_run_id_flow_step_attempt_key" ON "StepReview"("run_id", "flow_step", "attempt");
