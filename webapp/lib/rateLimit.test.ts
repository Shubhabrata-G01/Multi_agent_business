import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, isRateLimited, resetRateLimitsForTests } from "./rateLimit";

describe("rateLimit (STEP 4 item 5)", () => {
  beforeEach(() => {
    resetRateLimitsForTests();
  });

  it("allows requests under the limit", () => {
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited("user-1", "signup")).toBe(false);
    }
  });

  it("blocks once the limit is exceeded", () => {
    // signup's limit is 5/minute (lib/rateLimit.ts RULES)
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited("user-2", "signup")).toBe(false);
    }
    expect(isRateLimited("user-2", "signup")).toBe(true);
  });

  it("tracks separate keys independently", () => {
    for (let i = 0; i < 5; i++) isRateLimited("user-3", "signup");
    expect(isRateLimited("user-3", "signup")).toBe(true);
    expect(isRateLimited("user-4", "signup")).toBe(false); // different key, fresh bucket
  });

  it("tracks separate rules independently for the same key", () => {
    for (let i = 0; i < 5; i++) isRateLimited("user-5", "signup");
    expect(isRateLimited("user-5", "signup")).toBe(true);
    expect(isRateLimited("user-5", "login")).toBe(false); // different rule, fresh bucket
  });

  it("checkRateLimit returns a 429 NextResponse with a Retry-After header once over the limit", async () => {
    for (let i = 0; i < 5; i++) expect(checkRateLimit("user-6", "signup")).toBeNull();
    const response = checkRateLimit("user-6", "signup");
    expect(response).not.toBeNull();
    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBeTruthy();
    const body = await response?.json();
    expect(body.error).toMatch(/too many requests/i);
  });
});
