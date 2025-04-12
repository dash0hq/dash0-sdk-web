const globalHasOwnProperty = Object.prototype.hasOwnProperty;

/**
 * protection against hasOwnProperty overrides.
 */
export function hasOwnProperty(obj: Record<string, unknown>, key: string) {
  return globalHasOwnProperty.call(obj, key);
}
