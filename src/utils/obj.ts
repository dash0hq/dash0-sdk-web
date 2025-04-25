const globalHasOwnProperty = Object.prototype.hasOwnProperty;

/**
 * protection against hasOwnProperty overrides.
 */
export function hasOwnProperty(obj: Record<string, unknown>, key: string) {
  return globalHasOwnProperty.call(obj, key);
}

export function hasKey<O extends object>(obj: O, key: string | number | symbol): key is keyof O {
  return key in obj;
}
