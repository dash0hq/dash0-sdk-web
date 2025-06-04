/**
 * Creates a new object by picking specified properties from the source object.
 * Similar to TypeScript's Pick<T, K> utility type but as a runtime function.
 *
 * @param obj - The source object to pick properties from
 * @param keys - Array of property keys to pick from the source object
 * @returns A new object containing only the specified properties
 */
export function pick<T extends Record<string, any>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;

  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }

  return result;
}
