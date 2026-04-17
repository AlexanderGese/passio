import { describe, expect, test } from "bun:test";
import { RpcBus } from "./rpc.js";

describe("RpcBus", () => {
  test("dispatches a registered method and responds with result", async () => {
    const bus = new RpcBus();
    const responses: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    // biome-ignore lint: test-local stdout capture
    (process.stdout as any).write = (s: string) => {
      responses.push(s);
      return true;
    };

    bus.on("test.echo", async (params: { x: number }) => ({ doubled: params.x * 2 }));
    await bus.feed('{"jsonrpc":"2.0","id":1,"method":"test.echo","params":{"x":21}}\n');

    (process.stdout as any).write = origWrite;

    expect(responses).toHaveLength(1);
    const payload = JSON.parse(responses[0] ?? "{}");
    expect(payload).toEqual({ jsonrpc: "2.0", id: 1, result: { doubled: 42 } });
  });

  test("returns METHOD_NOT_FOUND for unknown methods", async () => {
    const bus = new RpcBus();
    const responses: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    (process.stdout as any).write = (s: string) => {
      responses.push(s);
      return true;
    };

    await bus.feed('{"jsonrpc":"2.0","id":2,"method":"nope"}\n');

    (process.stdout as any).write = origWrite;

    expect(responses).toHaveLength(1);
    const payload = JSON.parse(responses[0] ?? "{}");
    expect(payload.error?.code).toBe(-32601);
  });

  test("buffers partial lines until a newline arrives", async () => {
    const bus = new RpcBus();
    const responses: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    (process.stdout as any).write = (s: string) => {
      responses.push(s);
      return true;
    };

    bus.on("test.ok", async () => ({ ok: true }));
    await bus.feed('{"jsonrpc":"2.0","id":3,');
    await bus.feed('"method":"test.ok"}\n');

    (process.stdout as any).write = origWrite;

    expect(responses).toHaveLength(1);
    const payload = JSON.parse(responses[0] ?? "{}");
    expect(payload.result).toEqual({ ok: true });
  });
});
