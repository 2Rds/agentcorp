import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

let cachedKey: Buffer | null = null;

/**
 * Derive the 256-bit encryption key from INTEGRATION_ENCRYPTION_KEY.
 * This env var is required when any integration feature is used.
 * Exported for HMAC signing (OAuth state) in addition to encrypt/decrypt.
 */
export function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY is not set. This is required for encrypting OAuth tokens and API keys. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  cachedKey = createHash("sha256").update(raw).digest();
  return cachedKey;
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns `iv:tag:ciphertext` (all base64).
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted}`;
}

/**
 * Decrypt an `iv:tag:ciphertext` string encrypted with AES-256-GCM.
 */
export function decrypt(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format");
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(parts[0], "base64");
  const tag = Buffer.from(parts[1], "base64");
  const ciphertext = parts[2];

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
