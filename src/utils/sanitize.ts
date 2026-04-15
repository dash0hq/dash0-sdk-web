const SUSPICIOUS_CHARS = /['"<>{};\x00-\x1F\x7F]/;

/**
 * Returns true if the value is safe to use as a `service.name` resource attribute.
 *
 * Rejects values containing characters commonly used in injection payloads:
 * quotes, angle brackets, braces, semicolons, and C0 control characters / DEL.
 * Forward and back slashes are intentionally permitted so names like
 * `myteam/myservice` remain valid.
 */
export function isSafeServiceName(value: string): boolean {
  return !SUSPICIOUS_CHARS.test(value);
}
