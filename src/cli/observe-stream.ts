/** Bounded, serial observation of the two management log surfaces. */
import { readBoundedResponseBytes } from "../lib/bounded-body";
import { runningProxyUpdateHeaders } from "../oauth/login-cli";
import { findLiveProxy, type LiveProxy } from "../server/proxy-liveness";
import { runtimeBaseUrl, type RuntimeApiDeps } from "./runtime-api";

const POLL_MS = 1_000;
const REQUEST_MS = 10_000;
const RESPONSE_BYTES = 32 * 1024 * 1024;
type ObservationPath = "/api/logs" | "/api/debug/injection-logs";

export interface ObserveStreamDeps extends RuntimeApiDeps {
  signal?: AbortSignal;
  /** Reduced timings for isolated tests only; never command-line options. */
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
}

export class ObservationError extends Error {}

function reduced(value: number | undefined, ceiling: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 && value <= ceiling ? value : ceiling;
}

function interrupted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    work.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) abort();
  });
}

function waitForPoll(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(signal.reason); };
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

function identity(live: LiveProxy | undefined): string {
  return JSON.stringify(live ? [live.pid, live.port, live.hostname, live.role] : null);
}

export interface ObserveStream {
  signal: AbortSignal;
  get(path: ObservationPath, query: URLSearchParams): Promise<unknown>;
  wait(): Promise<void>;
}

/** Each invocation owns its signals, in-flight request and pinned runtime identity. */
export async function withObserveStream(
  deps: ObserveStreamDeps,
  run: (stream: ObserveStream) => Promise<void>,
): Promise<number> {
  const controller = new AbortController();
  let exit = 0;
  const stop = (code: number) => {
    if (controller.signal.aborted) return;
    exit = code;
    controller.abort();
  };
  const onInt = () => stop(130);
  const onTerm = () => stop(143);
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);
  deps.signal?.addEventListener("abort", onInt, { once: true });
  if (deps.signal?.aborted) onInt();
  let pinned: { origin: string; identity: string } | undefined;
  const signal = controller.signal;
  const timeoutMs = reduced(deps.requestTimeoutMs, REQUEST_MS);
  const get = async (path: ObservationPath, query: URLSearchParams): Promise<unknown> => {
    signal.throwIfAborted();
    let live: LiveProxy | undefined;
    const origin = await interrupted(runtimeBaseUrl({ ...deps, findLiveProxy: async () => {
      const found = await (deps.findLiveProxy ?? findLiveProxy)();
      live = found ? { ...found } : undefined;
      return found;
    } }), signal);
    signal.throwIfAborted();
    const current = { origin, identity: identity(live) };
    if (pinned && (pinned.origin !== current.origin || pinned.identity !== current.identity)) {
      throw new ObservationError("The runtime changed. Restart follow to observe the current runtime.");
    }
    pinned = current;
    const request = new AbortController();
    const abort = () => request.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    try {
      signal.throwIfAborted();
      const responsePromise = (deps.fetchImpl ?? fetch)(`${origin}${path}?${query}`, {
        method: "GET", headers: runningProxyUpdateHeaders(), credentials: "omit", redirect: "error", signal: request.signal,
      });
      // A test transport or late fetch may settle after abort. Release its body too.
      void responsePromise.then(response => {
        if (request.signal.aborted) void response.body?.cancel().catch(() => {});
      }, () => {});
      const response = await interrupted(responsePromise, request.signal);
      const result = await readBoundedResponseBytes(response, { maxBytes: RESPONSE_BYTES, signal: request.signal });
      signal.throwIfAborted();
      request.signal.throwIfAborted();
      if (result.oversized) throw new ObservationError("The observation window exceeds 32 MiB. Reduce --limit and restart follow.");
      if (!response.ok) throw new ObservationError("The observation request was refused. Check runtime access and restart follow.");
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(result.bytes));
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      request.abort();
    }
  };
  try {
    signal.throwIfAborted();
    await run({ signal, get, wait: () => waitForPoll(reduced(deps.pollIntervalMs, POLL_MS), signal) });
    return exit;
  } catch (error) {
    if (exit) return exit;
    console.error(`Error: ${error instanceof ObservationError ? error.message : "Observation failed or timed out. Check the runtime and restart follow."}`);
    return 1;
  } finally {
    controller.abort();
    process.removeListener("SIGINT", onInt);
    process.removeListener("SIGTERM", onTerm);
    deps.signal?.removeEventListener("abort", onInt);
  }
}
