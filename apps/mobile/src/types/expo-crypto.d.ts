declare module "expo-crypto" {
  export function randomUUID(): string;
  export function getRandomBytes(length: number): Uint8Array;
}
