import { describe, it, expect } from "vitest";
import { enqueueRun, activeRunCount } from "./jobQueue";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("jobQueue", () => {
  it("runs jobs for the same run id strictly in order (no overlap)", async () => {
    const order: string[] = [];
    enqueueRun("run-a", async () => {
      await tick(15);
      order.push("first");
    });
    const tail = enqueueRun("run-a", async () => {
      order.push("second");
    });
    await tail;
    expect(order).toEqual(["first", "second"]);
  });

  it("swallows a job error so the chain keeps going", async () => {
    const order: string[] = [];
    enqueueRun("run-b", async () => {
      throw new Error("boom");
    });
    const tail = enqueueRun("run-b", async () => {
      order.push("after-error");
    });
    await tail;
    expect(order).toEqual(["after-error"]);
  });

  it("cleans up settled chains", async () => {
    await enqueueRun("run-c", async () => {});
    await tick(0);
    expect(activeRunCount()).toBe(0);
  });
});
