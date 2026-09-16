// Metrics (STEP 6 item 3), computed live from persisted state on every
// scrape rather than kept as in-process counters - the execution loop runs
// in a separate worker process (STEP 3), so in-memory counters in the web
// process would never see it, and vice versa. Everything here is derived
// from tables every process already writes to, which makes the numbers
// correct regardless of which process (or how many) actually did the work.
import { prisma } from "./prisma";

export interface MetricSample {
  name: string;
  help: string;
  type: "counter" | "gauge";
  // Prometheus labels, e.g. { status: "running" }
  values: { labels?: Record<string, string>; value: number }[];
}

const RUN_STATUSES = ["running", "held", "completed", "failed", "stopped_no_go", "cancelled"];

export async function collectMetrics(): Promise<MetricSample[]> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    runCountsByStatus,
    queueDepth,
    staleJobs,
    usageAgg,
    providerErrorCount,
    terminalRuns,
    recentApprovals,
  ] = await Promise.all([
    Promise.all(
      RUN_STATUSES.map(async (status) => ({
        status,
        count: await prisma.run.count({ where: { status } }),
      })),
    ),
    prisma.job.count({ where: { status: "queued" } }),
    prisma.job.count({ where: { status: "running", lease_expires_at: { lt: new Date() } } }),
    prisma.usageEvent.aggregate({
      where: { created_at: { gte: dayAgo } },
      _sum: { input_tokens: true, output_tokens: true, estimated_cost_usd: true, retries: true },
      _avg: { latency_ms: true },
      _count: true,
    }),
    prisma.providerErrorEvent.count({ where: { created_at: { gte: dayAgo } } }),
    // Bounded sample of recently-finished runs for duration - a full-table
    // scan isn't needed for a representative average.
    prisma.run.findMany({
      where: { status: { in: ["completed", "failed", "stopped_no_go", "cancelled"] } },
      orderBy: { updated_at: "desc" },
      take: 200,
      select: { created_at: true, updated_at: true },
    }),
    prisma.run.findMany({
      where: { updated_at: { gte: dayAgo } },
      orderBy: { updated_at: "desc" },
      take: 200,
      select: { data: true },
    }),
  ]);

  const runDurationsSec = terminalRuns.map(
    (r) => (r.updated_at.getTime() - r.created_at.getTime()) / 1000,
  );
  const avgRunDurationSec = runDurationsSec.length
    ? runDurationsSec.reduce((a, b) => a + b, 0) / runDurationsSec.length
    : 0;

  // Approval wait time lives inside each run's JSONB `data.approvals` (see
  // lib/types.ts's ApprovalRequest) rather than a normalized column - a
  // small in-JS scan over a bounded recent sample is simpler and cheap
  // enough than a JSONB query for a metrics endpoint scraped periodically.
  const approvalWaitsSec: number[] = [];
  for (const row of recentApprovals) {
    const approvals = (row.data as { approvals?: { created_at: string; decided_at?: string }[] })
      .approvals;
    for (const a of approvals ?? []) {
      if (a.decided_at) {
        approvalWaitsSec.push((Date.parse(a.decided_at) - Date.parse(a.created_at)) / 1000);
      }
    }
  }
  const avgApprovalWaitSec = approvalWaitsSec.length
    ? approvalWaitsSec.reduce((a, b) => a + b, 0) / approvalWaitsSec.length
    : 0;

  return [
    {
      name: "app_runs_total",
      help: "Number of runs by status.",
      type: "gauge",
      values: runCountsByStatus.map((r) => ({ labels: { status: r.status }, value: r.count })),
    },
    {
      name: "app_job_queue_depth",
      help: "Number of jobs currently queued and waiting for a worker.",
      type: "gauge",
      values: [{ value: queueDepth }],
    },
    {
      name: "app_job_stale_count",
      help: "Number of jobs whose lease has expired without being renewed (likely a dead worker).",
      type: "gauge",
      values: [{ value: staleJobs }],
    },
    {
      name: "app_provider_calls_24h",
      help: "Number of provider calls recorded in the last 24 hours.",
      type: "gauge",
      values: [{ value: usageAgg._count }],
    },
    {
      name: "app_provider_latency_ms_avg_24h",
      help: "Average provider call latency (ms) in the last 24 hours.",
      type: "gauge",
      values: [{ value: usageAgg._avg.latency_ms ?? 0 }],
    },
    {
      name: "app_provider_retries_24h",
      help: "Total provider-call retries in the last 24 hours.",
      type: "gauge",
      values: [{ value: usageAgg._sum.retries ?? 0 }],
    },
    {
      name: "app_provider_errors_24h",
      help: "Number of provider calls that failed even after retries in the last 24 hours.",
      type: "gauge",
      values: [{ value: providerErrorCount }],
    },
    {
      name: "app_tokens_24h",
      help: "Total input+output tokens recorded in the last 24 hours.",
      type: "gauge",
      values: [
        { labels: { direction: "input" }, value: usageAgg._sum.input_tokens ?? 0 },
        { labels: { direction: "output" }, value: usageAgg._sum.output_tokens ?? 0 },
      ],
    },
    {
      name: "app_estimated_cost_usd_24h",
      help: "Total estimated provider cost (USD) in the last 24 hours.",
      type: "gauge",
      values: [{ value: usageAgg._sum.estimated_cost_usd ?? 0 }],
    },
    {
      name: "app_run_duration_seconds_avg",
      help: "Average wall-clock duration of the most recent terminal runs (sampled, up to 200).",
      type: "gauge",
      values: [{ value: avgRunDurationSec }],
    },
    {
      name: "app_approval_wait_seconds_avg",
      help: "Average time between an approval request being raised and decided (sampled, up to 200 recent runs).",
      type: "gauge",
      values: [{ value: avgApprovalWaitSec }],
    },
  ];
}

export function renderPrometheusText(samples: MetricSample[]): string {
  const lines: string[] = [];
  for (const sample of samples) {
    lines.push(`# HELP ${sample.name} ${sample.help}`);
    lines.push(`# TYPE ${sample.name} ${sample.type}`);
    for (const v of sample.values) {
      const labels = v.labels
        ? `{${Object.entries(v.labels)
            .map(([k, val]) => `${k}="${val.replace(/"/g, '\\"')}"`)
            .join(",")}}`
        : "";
      lines.push(`${sample.name}${labels} ${v.value}`);
    }
  }
  return lines.join("\n") + "\n";
}
