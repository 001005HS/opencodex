// Raw child output is drained but never persisted or returned by this boundary.
type Channel = "batch" | "observer" | "observer-error";
export class OutputCapture {
  private readonly readers = new Map<ReadableStreamDefaultReader<Uint8Array>, Channel>();
  private tail = "";
  private protocol = "";
  private bytes = 0;
  private observerBytes = 0;
  private errorBytes = 0;
  private overflow = false;
  private unexpected = false;
  private readFailure = false;
  constructor(private readonly signal: (value: "READY" | "CAPTURE") => void) {}
  cancel(group: "batch" | "observer"): void {
    for (const [reader, channel] of this.readers) {
      if ((channel === "batch") === (group === "batch")) void reader.cancel().catch(() => {});
    }
  }
  async drain(stream: ReadableStream<Uint8Array>, channel: Channel = "batch"): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    this.readers.set(reader, channel);
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        const chunk = next.value;
        if (channel === "observer-error") this.errorBytes += chunk.length;
        else if (channel === "batch") {
          this.bytes += chunk.length;
          this.tail = (this.tail + decoder.decode(chunk, { stream: true })).slice(-65536);
        } else {
          this.observerBytes += chunk.length;
          if (this.observerBytes > 8192) { this.overflow = true; continue; }
          this.protocol += decoder.decode(chunk, { stream: true });
          let end: number;
          while ((end = this.protocol.indexOf("\n")) >= 0) {
            const line = this.protocol.slice(0, end).trim(); this.protocol = this.protocol.slice(end + 1);
            if (line === "READY" || line === "CAPTURE") this.signal(line);
            else if (line) this.unexpected = true;
          }
        }
      }
    } catch { this.readFailure = true; }
    finally { this.readers.delete(reader); reader.releaseLock(); }
  }
  summary(): Record<string, unknown> {
    return {
      rawOutputBytesDiscarded: this.bytes, observerStderrBytes: this.errorBytes,
      observerProtocolOverflow: this.overflow, observerProtocolUnexpected: this.unexpected,
      pipeReadFailure: this.readFailure,
      passCount: Number([...this.tail.matchAll(/\n\s*(\d+) pass\b/g)].at(-1)?.[1] ?? 0),
      failCount: Number([...this.tail.matchAll(/\n\s*(\d+) fail\b/g)].at(-1)?.[1] ?? 0),
      targetCaseFailureInOutput: /\(fail\).*self logout revokes only the current GUI session/.test(this.tail),
    };
  }
}
