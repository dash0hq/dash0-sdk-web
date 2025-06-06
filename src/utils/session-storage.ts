// sessionStorage API re-exposed to allow testing.

import { sessionStorage } from "./globals";

export const isSupported =
  sessionStorage != null &&
  typeof sessionStorage.getItem === "function" &&
  typeof sessionStorage.setItem === "function";

export function getItem(k: string): string | null | undefined {
  if (isSupported && sessionStorage) {
    return sessionStorage.getItem(k);
  }
  return null;
}

export function setItem(k: string, v: string): void {
  if (isSupported && sessionStorage) {
    sessionStorage.setItem(k, v);
  }
}

export function removeItem(k: string): void {
  if (isSupported && sessionStorage) {
    sessionStorage.removeItem(k);
  }
}
