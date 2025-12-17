// @ts-nocheck
import * as Crypto from "expo-crypto";

const byteToHex: string[] = Array.from({ length: 256 }, (_, index) =>
  index.toString(16).padStart(2, "0")
);

const uuidFromBytes = (bytes: Uint8Array): string => {
  // Per RFC 4122 variant 4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return (
    byteToHex[bytes[0]] +
    byteToHex[bytes[1]] +
    byteToHex[bytes[2]] +
    byteToHex[bytes[3]] +
    "-" +
    byteToHex[bytes[4]] +
    byteToHex[bytes[5]] +
    "-" +
    byteToHex[bytes[6]] +
    byteToHex[bytes[7]] +
    "-" +
    byteToHex[bytes[8]] +
    byteToHex[bytes[9]] +
    "-" +
    byteToHex[bytes[10]] +
    byteToHex[bytes[11]] +
    byteToHex[bytes[12]] +
    byteToHex[bytes[13]] +
    byteToHex[bytes[14]] +
    byteToHex[bytes[15]]
  );
};

export function generateUUID(): string {
  // Try expo-crypto first (React Native)
  if (Crypto.randomUUID) {
    return Crypto.randomUUID();
  }

  // Try browser crypto API
  const globalCrypto =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;

  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }

  if (globalCrypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    globalCrypto.getRandomValues(bytes);
    return uuidFromBytes(bytes);
  }

  throw new Error(
    "Secure random UUID generation is not supported in this environment."
  );
}
