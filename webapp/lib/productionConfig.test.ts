import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStorageBackendCacheForTests } from "./storageBackend";
import {
  ProductionConfigError,
  validateSharedProductionConfig,
  validateWorkerProductionConfig,
} from "./productionConfig";

describe("productionConfig (STEP 7 items 5-6)", () => {
  beforeEach(() => {
    resetStorageBackendCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetStorageBackendCacheForTests();
  });

  it("throws when AUTH_SECRET is missing in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://x:y@localhost:5432/db");
    vi.stubEnv("AUTH_SECRET", "");
    expect(() => validateSharedProductionConfig()).toThrow(ProductionConfigError);
    expect(() => validateSharedProductionConfig()).toThrow(/AUTH_SECRET/);
  });

  it("passes in production when AUTH_SECRET and DATABASE_URL are set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://x:y@localhost:5432/db");
    vi.stubEnv("AUTH_SECRET", "a-long-random-production-secret");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-configured");
    expect(() => validateSharedProductionConfig()).not.toThrow();
  });

  it("warns (does not throw) when no server-side provider key is configured in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://x:y@localhost:5432/db");
    vi.stubEnv("AUTH_SECRET", "a-long-random-production-secret");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    const { warnings } = validateSharedProductionConfig();
    expect(warnings.some((w) => w.includes("No server-side provider API key"))).toBe(true);
  });

  it("does not require AUTH_SECRET outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(() => validateSharedProductionConfig()).not.toThrow();
  });

  it("validateWorkerProductionConfig throws when the backend is not PostgreSQL, in any environment", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("STORAGE_BACKEND", "filesystem");
    expect(() => validateWorkerProductionConfig()).toThrow(ProductionConfigError);
    expect(() => validateWorkerProductionConfig()).toThrow(/PostgreSQL/);
  });

  it("validateWorkerProductionConfig passes on the PostgreSQL backend with valid config", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", "postgresql://x:y@localhost:5432/db");
    vi.stubEnv("STORAGE_BACKEND", "");
    expect(() => validateWorkerProductionConfig()).not.toThrow();
  });
});
