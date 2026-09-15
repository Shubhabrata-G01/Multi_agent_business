import { describe, it, expect } from "vitest";
import { invokeTool } from "./tools";

describe("invokeTool", () => {
  it("refuses an unknown tool", () => {
    const r = invokeTool("nope.do", {}, { mode: "assisted", enabledScopes: ["crm"] });
    expect(r.ok).toBe(false);
    expect(r.audit.decision).toBe("refused_unknown");
  });

  it("refuses every side-effecting tool in simulation mode, without executing", () => {
    const r = invokeTool("email.send", { to: "x" }, { mode: "simulation", enabledScopes: ["email"] });
    expect(r.ok).toBe(false);
    expect(r.dry_run).toBe(false);
    expect(r.audit.decision).toBe("refused_simulation");
  });

  it("refuses when the tool's scope is not enabled for the run", () => {
    const r = invokeTool("crm.upsert_contact", {}, { mode: "assisted", enabledScopes: [] });
    expect(r.ok).toBe(false);
    expect(r.audit.decision).toBe("refused_scope");
  });

  it("dry-runs (never really executes) when the scope is enabled in assisted mode", () => {
    const r = invokeTool("crm.upsert_contact", { name: "Acme" }, { mode: "assisted", enabledScopes: ["crm"] });
    expect(r.ok).toBe(true);
    expect(r.dry_run).toBe(true);
    expect(r.audit.decision).toBe("dry_run");
    expect((r.output as { dry_run: boolean }).dry_run).toBe(true);
  });

  it("records an audit entry on every path", () => {
    const r = invokeTool("payment.charge", { amount: 100 }, { mode: "assisted", enabledScopes: [] });
    expect(r.audit.tool).toBe("payment.charge");
    expect(r.audit.args).toEqual({ amount: 100 });
    expect(typeof r.audit.at).toBe("string");
  });
});
