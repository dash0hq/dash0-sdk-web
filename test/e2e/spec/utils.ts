export function retry<T>(fn: () => Promise<T>, maxMillis: number = 10000, until?: number): Promise<T> {
  until = until || Date.now() + maxMillis;

  if (Date.now() > until) {
    return fn();
  }

  return delay(maxMillis / 20)
    .then(fn)
    .catch(() => retry(fn, maxMillis, until));
}

export function delay(millis: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, millis));
}
