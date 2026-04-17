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

  /** Register a handler for an RPC method name. */
  on<P, R>(method: string, handler: RpcHandler<P, R>): void {
    this.handlers.set(method, handler as RpcHandler);
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

  /** Send a response or notification to the parent (Rust core). */
  send(msg: RpcMessage): void {
    process.stdout.write(`${JSON.stringify(msg)}\n`);
  }

  notify(method: string, params?: unknown): void {
    const n: RpcNotification = { jsonrpc: "2.0", method, ...(params !== undefined ? { params } : {}) };
    this.send(n);
  }
}

// Re-exports for convenience
export type { RpcRequest, RpcResponse, RpcNotification };
