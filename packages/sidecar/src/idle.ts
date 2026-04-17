/**
 * Tracks sidecar activity and triggers graceful shutdown after
 * a configurable idle timeout. Activity is bumped on every RPC call.
 */
export class IdleWatchdog {
  private lastActivity = Date.now();
  private timer: Timer | null = null;

  constructor(
    private readonly timeoutMs: number,
    private readonly onIdle: () => void,
  ) {}

  start(): void {
    this.tick();
  }

  bump(): void {
    this.lastActivity = Date.now();
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private tick = (): void => {
    const elapsed = Date.now() - this.lastActivity;
    if (elapsed >= this.timeoutMs) {
      this.onIdle();
      return;
    }
    const delay = Math.max(1000, this.timeoutMs - elapsed);
    this.timer = setTimeout(this.tick, delay);
  };
}
