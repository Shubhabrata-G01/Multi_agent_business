import crypto from "crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { collectMetrics, renderPrometheusText } from "./metrics";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("metrics (STEP 6 item 3)", () => {
  const cleanupRunIds: string[] = [];

  afterEach(async () => {
    const { prisma } = await import("./prisma");
    if (cleanupRunIds.length) {
      await prisma.usageEvent.deleteMany({ where: { run_id: { in: cleanupRunIds } } });
      await prisma.providerErrorEvent.deleteMany({ where: { run_id: { in: cleanupRunIds } } });
      await prisma.job.deleteMany({ where: { run_id: { in: cleanupRunIds } } });
      await prisma.run.deleteMany({ where: { id: { in: cleanupRunIds } } });
    }
    cleanupRunIds.length = 0;
  });

  afterAll(async () => {
    if (!hasDb) return;
    const { prisma } = await import("./prisma");
    await prisma.$disconnect();
  });

  it("reflects a recorded provider call's tokens, cost, latency, and retries", async () => {
    const { prisma } = await import("./prisma");
    const { recordUsage, recordProviderError } = await import("./usage");
    const runId = `test-metrics-run-${crypto.randomUUID()}`;
    cleanupRunIds.push(runId);
    await prisma.run.create({
      data: {
        id: runId,
        owner_id: "u1",
        organization_id: "o1",
        status: "running",
        created_at: new Date(),
        updated_at: new Date(),
        data: {},
      },
    });

    await recordUsage({
      runId,
      userId: "u1",
      organizationId: "o1",
      provider: "anthropic",
      model: "claude-opus-5",
      inputTokens: 1000,
      outputTokens: 500,
      latencyMs: 1234,
      retries: 2,
    });
    await recordProviderError({
      runId,
      userId: "u1",
      organizationId: "o1",
      provider: "anthropic",
      model: "claude-opus-5",
      error: "simulated failure",
    });

    const samples = await collectMetrics();
    const byName = Object.fromEntries(samples.map((s) => [s.name, s]));

    expect(byName.app_provider_calls_24h.values[0].value).toBeGreaterThanOrEqual(1);
    expect(byName.app_provider_errors_24h.values[0].value).toBeGreaterThanOrEqual(1);
    expect(byName.app_tokens_24h.values.find((v) => v.labels?.direction === "input")!.value).toBeGreaterThanOrEqual(1000);
    expect(byName.app_estimated_cost_usd_24h.values[0].value).toBeGreaterThan(0);
    expect(byName.app_provider_retries_24h.values[0].value).toBeGreaterThanOrEqual(2);

    const runsGauge = byName.app_runs_total;
    expect(runsGauge.values.some((v) => v.labels?.status === "running")).toBe(true);
  });

  it("renderPrometheusText produces valid HELP/TYPE/value lines", () => {
    const text = renderPrometheusText([
      { name: "app_test_metric", help: "A test metric.", type: "gauge", values: [{ value: 42 }] },
    ]);
    expect(text).toContain("# HELP app_test_metric A test metric.");
    expect(text).toContain("# TYPE app_test_metric gauge");
    expect(text).toContain("app_test_metric 42");
  });

  it("renders labels correctly", () => {
    const text = renderPrometheusText([
      {
        name: "app_runs_total",
        help: "h",
        type: "gauge",
        values: [{ labels: { status: "running" }, value: 3 }],
      },
    ]);
    expect(text).toContain('app_runs_total{status="running"} 3');
  });
});
