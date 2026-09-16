import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStorageBackend, resetStorageBackendCacheForTests } from "./storageBackend";

describe("getStorageBackend", () => {
  beforeEach(() => {
    resetStorageBackendCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetStorageBackendCacheForTests();
  });

  it("uses postgres by default when DATABASE_URL is set", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://x:y@localhost:5432/db");
    vi.stubEnv("STORAGE_BACKEND", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(getStorageBackend()).toBe("postgres");
  });

  it("falls back to filesystem in development when DATABASE_URL is absent", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("STORAGE_BACKEND", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(getStorageBackend()).toBe("filesystem");
  });

  it("honors an explicit STORAGE_BACKEND=filesystem opt-in even when DATABASE_URL is set", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://x:y@localhost:5432/db");
    vi.stubEnv("STORAGE_BACKEND", "filesystem");
    vi.stubEnv("NODE_ENV", "development");
    expect(getStorageBackend()).toBe("filesystem");
  });

  it("throws in production when DATABASE_URL is missing", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("STORAGE_BACKEND", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getStorageBackend()).toThrow(/DATABASE_URL is required in production/);
  });

  it("refuses STORAGE_BACKEND=filesystem in production even with DATABASE_URL set", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://x:y@localhost:5432/db");
    vi.stubEnv("STORAGE_BACKEND", "filesystem");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getStorageBackend()).toThrow(/not allowed in production/);
  });

  it("rejects an unknown STORAGE_BACKEND value", () => {
    vi.stubEnv("STORAGE_BACKEND", "sqlite");
    vi.stubEnv("NODE_ENV", "development");
    expect(() => getStorageBackend()).toThrow(/Invalid STORAGE_BACKEND/);
  });

  it("caches the decision until reset", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://x:y@localhost:5432/db");
    vi.stubEnv("NODE_ENV", "development");
    expect(getStorageBackend()).toBe("postgres");
    vi.stubEnv("DATABASE_URL", "");
    // Still postgres - cached, doesn't re-read env until reset.
    expect(getStorageBackend()).toBe("postgres");
  });
});
