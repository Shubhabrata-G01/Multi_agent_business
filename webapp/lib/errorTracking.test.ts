import { afterEach, describe, expect, it, vi } from "vitest";
import { captureException } from "./errorTracking";

describe("captureException (STEP 6 item 5)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("never throws even when nothing is configured", async () => {
    vi.stubEnv("ERROR_WEBHOOK_URL", "");
    await expect(captureException("something broke", new Error("boom"), { runId: "r1" })).resolves.toBeUndefined();
  });

  it("posts to ERROR_WEBHOOK_URL when configured", async () => {
    vi.stubEnv("ERROR_WEBHOOK_URL", "https://hooks.example.com/errors");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await captureException("something broke", new Error("boom"), { runId: "r1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hooks.example.com/errors");
    const body = JSON.parse(init.body);
    expect(body.message).toBe("something broke");
    expect(body.error.message).toBe("boom");
    expect(body.context.runId).toBe("r1");
  });

  it("swallows a webhook delivery failure without throwing", async () => {
    vi.stubEnv("ERROR_WEBHOOK_URL", "https://hooks.example.com/errors");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(captureException("something broke", new Error("boom"))).resolves.toBeUndefined();
  });
});
