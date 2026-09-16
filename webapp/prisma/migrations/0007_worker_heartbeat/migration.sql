-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "worker_id" TEXT NOT NULL,
    "concurrency" INTEGER NOT NULL,
    "in_flight" INTEGER NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("worker_id")
);
