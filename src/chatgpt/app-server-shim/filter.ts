import { rewriteAppServerLine } from "./app-server-rewrite";

/** Byte-preserving stdout filter; unexpected rewrite machinery failures disable filtering. */
const NEWLINE = 0x0a;

/**
 * Splits a byte stream into lines and rewrites the ones that need it. Returns the bytes to write
 * for each chunk; a partial trailing line is held back until its newline arrives (or `flush`).
 */
export function createRpcLineFilter(
  rewrite: (line: string) => string | null = rewriteAppServerLine,
): { push(chunk: Uint8Array): Uint8Array[]; flush(): Uint8Array[] } {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending: Uint8Array = new Uint8Array(0);
  let passthrough = false;

  // `line` excludes the newline, `whole` includes it when there is one. An untouched line is
  // returned as the very bytes that arrived; only a rewritten one is re-encoded.
  const emit = (line: Uint8Array, whole: Uint8Array, terminated: boolean): Uint8Array => {
    let rewritten: string | null;
    try {
      rewritten = rewrite(decoder.decode(line));
    } catch {
      return whole;
    }
    if (rewritten === null) return whole;
    const body = encoder.encode(rewritten);
    if (!terminated) return body;
    const out = new Uint8Array(body.length + 1);
    out.set(body, 0);
    out[body.length] = NEWLINE;
    return out;
  };

  return {
    push(chunk) {
      if (passthrough) return [chunk];
      const previous = pending;
      try {
        const joined = new Uint8Array(previous.length + chunk.length);
        joined.set(previous, 0);
        joined.set(chunk, previous.length);
        const out: Uint8Array[] = [];
        let start = 0;
        for (let i = 0; i < joined.length; i++) {
          if (joined[i] !== NEWLINE) continue;
          out.push(emit(joined.subarray(start, i), joined.subarray(start, i + 1), true));
          start = i + 1;
        }
        pending = joined.slice(start);
        return out;
      } catch {
        pending = new Uint8Array(0);
        passthrough = true;
        return previous.length ? [previous, chunk] : [chunk];
      }
    },
    flush() {
      if (pending.length === 0) return [];
      const last = pending;
      pending = new Uint8Array(0);
      if (passthrough) return [last];
      try { return [emit(last, last, false)]; } catch { return [last]; }
    },
  };
}

/** Copy `input` to `write`, rewriting gate lines on the way. Resolves when `input` ends. */
export async function runStdoutFilter(
  input: AsyncIterable<Uint8Array>,
  write: (bytes: Uint8Array) => Promise<unknown> | unknown,
  rewrite?: (line: string) => string | null,
): Promise<void> {
  let filter: ReturnType<typeof createRpcLineFilter> | undefined;
  try { filter = createRpcLineFilter(rewrite); } catch { /* Raw passthrough if setup fails. */ }
  for await (const chunk of input) {
    for (const out of filter ? filter.push(chunk) : [chunk]) await write(out);
  }
  for (const out of filter?.flush() ?? []) await write(out);
}

/** Hidden CLI entry; the self-test emits no stdout so the launcher can probe it safely. */
export async function runChatgptAppServerFilter({ selfTest = false }: { selfTest?: boolean } = {}): Promise<number> {
  if (selfTest) {
    try {
      const fixture = JSON.stringify({ id: 1, result: {
        ordinaryUsageAllowed: false,
        rateLimits: { rateLimitReachedType: "rate_limit_reached", primary: { usedPercent: 100 } },
      } });
      const rewritten = rewriteAppServerLine(fixture);
      if (!rewritten) return 1;
      const result = JSON.parse(rewritten).result;
      return result.ordinaryUsageAllowed === true
        && result.rateLimits.rateLimitReachedType === null
        && result.rateLimits.primary.usedPercent === 100 ? 0 : 1;
    } catch { return 1; }
  }
  await runStdoutFilter(Bun.stdin.stream(), bytes => Bun.write(Bun.stdout, bytes));
  return 0;
}
