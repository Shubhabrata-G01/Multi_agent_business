import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptProviderKey, encryptProviderKey } from "./providerKeyBox";

describe("providerKeyBox", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips a plaintext key", () => {
    vi.stubEnv("AUTH_SECRET", "test-secret-value-not-real");
    const ciphertext = encryptProviderKey("sk-ant-abc123");
    expect(ciphertext).not.toContain("sk-ant-abc123");
    expect(decryptProviderKey(ciphertext)).toBe("sk-ant-abc123");
  });

  it("produces different ciphertext for the same plaintext each time (random IV)", () => {
    vi.stubEnv("AUTH_SECRET", "test-secret-value-not-real");
    const a = encryptProviderKey("sk-ant-abc123");
    const b = encryptProviderKey("sk-ant-abc123");
    expect(a).not.toBe(b);
    expect(decryptProviderKey(a)).toBe("sk-ant-abc123");
    expect(decryptProviderKey(b)).toBe("sk-ant-abc123");
  });

  it("fails to decrypt under a different AUTH_SECRET", () => {
    vi.stubEnv("AUTH_SECRET", "secret-one");
    const ciphertext = encryptProviderKey("sk-ant-abc123");

    vi.stubEnv("AUTH_SECRET", "secret-two");
    expect(() => decryptProviderKey(ciphertext)).toThrow();
  });

  it("fails to decrypt tampered ciphertext (authenticated encryption)", () => {
    vi.stubEnv("AUTH_SECRET", "test-secret-value-not-real");
    const ciphertext = encryptProviderKey("sk-ant-abc123");
    const tampered = ciphertext.slice(0, -4) + "abcd";
    expect(() => decryptProviderKey(tampered)).toThrow();
  });

  it("throws a clear error when AUTH_SECRET is not set", () => {
    vi.stubEnv("AUTH_SECRET", "");
    expect(() => encryptProviderKey("sk-ant-abc123")).toThrow(/AUTH_SECRET/);
  });
});
