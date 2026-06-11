// Criptografia de segredos em repouso (tokens OAuth) — AES-256-GCM.
// Importar via "@lsm/shared/crypto" (server-only; usa node:crypto).
//
// Formato do payload: base64( iv[12] | authTag[16] | ciphertext )

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function parseKey(keyHex: string): Buffer {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY inválida: esperado 64 chars hex (32 bytes). Gere com: openssl rand -hex 32",
    );
  }
  return key;
}

export function encryptSecret(plaintext: string, keyHex: string): string {
  const key = parseKey(keyHex);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decryptSecret(payload: string, keyHex: string): string {
  const key = parseKey(keyHex);
  const raw = Buffer.from(payload, "base64");
  if (raw.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Payload criptografado inválido");
  }
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// comparação em tempo constante (state CSRF, assinaturas de webhook)
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
