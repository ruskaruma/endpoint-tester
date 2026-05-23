/**
 * Limits how many endpoint tests (or LLM calls) run at once.
 * Same API keys are shared — semaphore avoids rate limits and stampedes.
 */

export class Semaphore {
  private permits: number;
  private readonly queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = Math.max(1, permits);
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
  }

  release(): void {
    const next = this.queue.shift();
    if (next) next();
    else this.permits++;
  }

  async use<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

export function concurrencyFromEnv(
  env: Record<string, string>,
  key: string,
  fallback: number
): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Run all items concurrently but at most `concurrency` at a time. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const sem = new Semaphore(concurrency);
  return Promise.all(
    items.map((item, index) => sem.use(() => fn(item, index)))
  );
}
