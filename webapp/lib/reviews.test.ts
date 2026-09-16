import crypto from "crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("reviews (STEP 5 item 7)", () => {
  const cleanupRunIds: string[] = [];

  afterEach(async () => {
    const { prisma } = await import("./prisma");
    if (cleanupRunIds.length) {
      await prisma.comment.deleteMany({ where: { run_id: { in: cleanupRunIds } } });
      await prisma.stepReview.deleteMany({ where: { run_id: { in: cleanupRunIds } } });
    }
    cleanupRunIds.length = 0;
  });

  afterAll(async () => {
    if (!hasDb) return;
    const { prisma } = await import("./prisma");
    await prisma.$disconnect();
  });

  function newRunId(): string {
    const id = `test-review-run-${crypto.randomUUID()}`;
    cleanupRunIds.push(id);
    return id;
  }

  it("adds and lists comments on a step", async () => {
    const { addComment, listComments } = await import("./reviews");
    const runId = newRunId();
    const author = { id: "u1", email: "u1@example.com" };

    await addComment({ runId, flowStep: "05", attempt: 1, author, body: "Looks solid." });
    await addComment({ runId, flowStep: "05", attempt: 1, taskId: "task-123", author, body: "But check this claim." });
    await addComment({ runId, flowStep: "06", attempt: 1, author, body: "Different step." });

    const all = await listComments(runId);
    expect(all).toHaveLength(3);

    const stepFive = await listComments(runId, "05");
    expect(stepFive).toHaveLength(2);
    expect(stepFive.map((c) => c.body)).toEqual(["Looks solid.", "But check this claim."]);
    expect(stepFive[1].task_id).toBe("task-123");
  });

  it("assigns a reviewer, then marks reviewed, then request-changes - status transitions correctly", async () => {
    const { assignReviewer, setReviewStatus, listReviews } = await import("./reviews");
    const runId = newRunId();
    const reviewer = { id: "u2", email: "u2@example.com" };

    const assigned = await assignReviewer(runId, "07", 1, reviewer);
    expect(assigned.status).toBe("assigned");
    expect(assigned.reviewer_email).toBe("u2@example.com");

    const reviewed = await setReviewStatus(runId, "07", 1, "reviewed", reviewer);
    expect(reviewed.status).toBe("reviewed");

    const changesRequested = await setReviewStatus(runId, "07", 1, "changes_requested", reviewer, "Fix the citation.");
    expect(changesRequested.status).toBe("changes_requested");
    expect(changesRequested.note).toBe("Fix the citation.");

    const all = await listReviews(runId);
    expect(all).toHaveLength(1); // upserted onto the same (run, step, attempt) row
  });

  it("keeps reviews for different attempts of the same step separate", async () => {
    const { setReviewStatus, listReviews } = await import("./reviews");
    const runId = newRunId();
    const reviewer = { id: "u3", email: "u3@example.com" };

    await setReviewStatus(runId, "08", 1, "reviewed", reviewer);
    await setReviewStatus(runId, "08", 2, "changes_requested", reviewer);

    const all = await listReviews(runId);
    expect(all).toHaveLength(2);
    expect(all.find((r) => r.attempt === 1)?.status).toBe("reviewed");
    expect(all.find((r) => r.attempt === 2)?.status).toBe("changes_requested");
  });
});
