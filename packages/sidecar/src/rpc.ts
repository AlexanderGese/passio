import {
  type RpcMessage,
  type RpcNotification,
  type RpcRequest,
  type RpcResponse,
  RpcErrorCodes,
  RpcRequestSchema,
} from "@passio/shared";

export type RpcHandler<P = unknown, R = unknown> = (params: P) => Promise<R> | R;

export class RpcBus {
  private handlers = new Map<string, RpcHandler>();
  private buffer = "";
  /** Pending gate verdicts (id → resolver). */
  private gatePending = new Map<
    string,
    { resolve: (allowed: boolean) => void; timer: Timer }
  >();

  /** Register a handler for an RPC method name. */
  on<P, R>(method: string, handler: RpcHandler<P, R>): void {
    this.handlers.set(method, handler as RpcHandler);
  }

  /** Invoke a registered handler directly — used by the HTTP /rpc bridge. */
  async invoke(method: string, params: unknown): Promise<unknown> {
    const handler = this.handlers.get(method);
    if (!handler) throw new Error(`Unknown method: ${method}`);
    return handler(params);
  }

  /** Feed raw stdin data. Parses newline-delimited JSON and dispatches. */
  async feed(chunk: string): Promise<void> {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      await this.handleLine(trimmed);
    }
  }

  private async handleLine(line: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.send({
        jsonrpc: "2.0",
        id: 0,
        error: { code: RpcErrorCodes.PARSE_ERROR, message: "Invalid JSON" },
      });
      return;
    }

    const check = RpcRequestSchema.safeParse(parsed);
    if (!check.success) {
      // Responses flow only Rust→sidecar on shutdown ack path; ignore for now.
      return;
    }
    const req = check.data;
    const handler = this.handlers.get(req.method);
    if (!handler) {
      this.send({
        jsonrpc: "2.0",
        id: req.id,
        error: {
          code: RpcErrorCodes.METHOD_NOT_FOUND,
          message: `Unknown method: ${req.method}`,
        },
      });
      return;
    }

    try {
      const result = await handler(req.params);
      this.send({ jsonrpc: "2.0", id: req.id, result });
    } catch (err) {
      this.send({
        jsonrpc: "2.0",
        id: req.id,
        error: {
          code: RpcErrorCodes.INTERNAL_ERROR,
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  /** Send a response or notification to the parent (Rust core).
   *  Swallows EPIPE so a dead parent doesn't crash the sidecar mid-stream. */
  send(msg: RpcMessage): void {
    try {
      process.stdout.write(`${JSON.stringify(msg)}\n`);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code === "EPIPE") {
        process.exit(0);
      }
    }
  }

  notify(method: string, params?: unknown): void {
    const n: RpcNotification = { jsonrpc: "2.0", method, ...(params !== undefined ? { params } : {}) };
    this.send(n);
  }

  /**
   * Wait for a matching `passio.gate.resolve` RPC call (Rust → sidecar).
   * Resolves with `allowed`. On timeout, resolves `true` (fail-open —
   * Rust's own timer will also fire and call us; we just race them).
   */
  awaitGateResolve(id: string, timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        if (this.gatePending.delete(id)) resolve(true);
      }, timeoutMs);
      this.gatePending.set(id, { resolve, timer });
    });
  }

  /** Called by the passio.gate.resolve handler in main.ts. */
  resolveGate(id: string, allowed: boolean): void {
    const entry = this.gatePending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.gatePending.delete(id);
    entry.resolve(allowed);
  }
}

// Re-exports for convenience
export type { RpcRequest, RpcResponse, RpcNotification };
