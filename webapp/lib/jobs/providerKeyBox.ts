// Encrypts a user-supplied (BYOK) provider API key for the brief, bounded
// window it needs to travel from the web process (which resolved it from the
// request) to the separate `npm run worker` process (which makes the actual
// provider call) - see lib/jobs/jobRepository.ts. A server-configured
// (env-var) key never goes through this at all: the worker just re-resolves
// it from its own environment.
//
// The encryption key is derived from AUTH_SECRET (already a required
// production secret - see lib/storageBackend.ts/instrumentation.ts) rather
// than a new env var, using AES-256-GCM (authenticated - a tampered
// ciphertext fails to decrypt rather than silently returning garbage).
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function deriveKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET must be set to encrypt/decrypt provider API keys for durable job execution.",
    );
  }
  // A fixed, purpose-specific salt is fine here: this isn't a password hash,
  // it's a KDF binding "this app's AUTH_SECRET" to "this specific use" so a
  // key derived for provider-key encryption can never collide with AUTH_SECRET
  // being used verbatim anywhere else.
  return crypto.scryptSync(secret, "webapp:provider-key-box:v1", 32);
}

export function encryptProviderKey(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptProviderKey(encoded: string): string {
  const key = deriveKey();
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");
}
