import { describe, it, expect } from "vitest";
import {
  needsHumanApproval,
  pendingApprovalFor,
  hasApproved,
  hasPendingApproval,
} from "./orchestrator";
import type { ApprovalRequest, RunState } from "./types";

function req(partial: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: "a1",
    run_id: "r1",
    flow_step: "13",
    node_id: "saas.13",
    attempt: 1,
    level: 2,
    activity: "Go / No-Go",
    output_artifact: "Go / No-Go Decision",
    summary: "needs approval",
    status: "pending",
    created_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("needsHumanApproval (assisted-mode gate predicate)", () => {
  it("requires approval for an assisted-mode gate step with no approval yet", () => {
    expect(needsHumanApproval("assisted", true, [], "13", 1)).toBe(true);
  });

  it("does not require approval once an approval for this step+attempt exists", () => {
    expect(needsHumanApproval("assisted", true, [req({ status: "approved" })], "13", 1)).toBe(false);
  });

  it("still requires approval if the approval was for a different attempt", () => {
    expect(needsHumanApproval("assisted", true, [req({ status: "approved", attempt: 1 })], "13", 2)).toBe(true);
  });

  it("never requires approval in simulation mode", () => {
    expect(needsHumanApproval("simulation", true, [], "13", 1)).toBe(false);
  });

  it("never requires approval on a non-gate step", () => {
    expect(needsHumanApproval("assisted", false, [], "13", 1)).toBe(false);
  });
});

describe("approval lookup helpers", () => {
  it("pendingApprovalFor finds a pending request for the exact step+attempt", () => {
    expect(pendingApprovalFor([req()], "13", 1)?.id).toBe("a1");
    expect(pendingApprovalFor([req({ status: "approved" })], "13", 1)).toBeUndefined();
    expect(pendingApprovalFor([req()], "13", 2)).toBeUndefined();
    expect(pendingApprovalFor(undefined, "13", 1)).toBeUndefined();
  });

  it("hasApproved is true only for an approved request on that step+attempt", () => {
    expect(hasApproved([req({ status: "approved" })], "13", 1)).toBe(true);
    expect(hasApproved([req({ status: "pending" })], "13", 1)).toBe(false);
    expect(hasApproved([req({ status: "rejected" })], "13", 1)).toBe(false);
  });

  it("hasPendingApproval reflects any pending request on the run", () => {
    const base = { approvals: [] as ApprovalRequest[] } as unknown as RunState;
    expect(hasPendingApproval(base)).toBe(false);
    expect(hasPendingApproval({ ...base, approvals: [req()] } as RunState)).toBe(true);
    expect(hasPendingApproval({ ...base, approvals: [req({ status: "approved" })] } as RunState)).toBe(false);
    expect(hasPendingApproval({} as RunState)).toBe(false);
  });
});
