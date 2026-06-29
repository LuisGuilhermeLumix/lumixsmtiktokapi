// Retry com backoff exponencial — tratamento de erros estilo n8n (retryOnFail/
// maxTries/retryWait). Usado nas chamadas de provider (LLM, geração de cena).

export interface RetryOpts {
  /** número máximo de tentativas (>=1) */
  tries?: number;
  /** espera BASE entre tentativas (ms); backoff = base * 2^(n-1) */
  waitMs?: number;
  /** callback por tentativa falha (para logar) */
  onAttempt?: (attempt: number, err: Error) => void | Promise<void>;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const tries = Math.max(1, opts.tries ?? 1);
  const base = Math.max(0, opts.waitMs ?? 0);
  let last: Error = new Error("retry: nenhuma tentativa executada");
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e instanceof Error ? e : new Error(String(e));
      await opts.onAttempt?.(attempt, last);
      if (attempt < tries && base > 0) {
        await new Promise((r) => setTimeout(r, base * 2 ** (attempt - 1)));
      }
    }
  }
  throw last;
}
