import { vars } from "../vars";

export function storageKey(key: string): string {
  return vars.storageNamespace ? `${vars.storageNamespace}:${key}` : key;
}
