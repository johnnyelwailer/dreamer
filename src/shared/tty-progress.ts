import { clearLine, cursorTo } from "node:readline";
import { ttyFormatTagged } from "./tty-log-format.js";

export type TtyStatus = {
  update: (message: string) => void;
  done: (message?: string) => void;
  track: <T>(message: string, work: Promise<T>, options?: { intervalMs?: number; heartbeat?: (elapsedMs: number, message: string) => string }) => Promise<T>;
};

type StatusEntry = {
  id: number;
  prefix: string;
  message: string;
  noisy: boolean;
  noPrefix: boolean;
};

const interactive = Boolean(process.stderr.isTTY && process.env.CI !== "true");
const entries = new Map<number, StatusEntry>();
const activeStack: number[] = [];
let nextId = 1;

function renderLine(message: string): void {
  if (!interactive) return;
  clearLine(process.stderr, 0);
  cursorTo(process.stderr, 0);
  process.stderr.write(message);
}

function removeFromStack(id: number): void {
  const index = activeStack.lastIndexOf(id);
  if (index >= 0) activeStack.splice(index, 1);
}

function renderTop(): void {
  if (!interactive) return;
  for (let i = activeStack.length - 1; i >= 0; i -= 1) {
    const entry = entries.get(activeStack[i] ?? -1);
    if (!entry) continue;
    renderLine(entry.noPrefix ? entry.message : ttyFormatTagged(entry.prefix, entry.message, { noisy: entry.noisy }));
    return;
  }
  clearLine(process.stderr, 0);
  cursorTo(process.stderr, 0);
}

export function createTtyStatus(prefix: string, options: { noisy?: boolean; noPrefix?: boolean } = {}): TtyStatus {
  const id = nextId;
  nextId += 1;
  entries.set(id, { id, prefix, message: "", noisy: options.noisy === true, noPrefix: options.noPrefix === true });

  return {
    update(message) {
      const entry = entries.get(id);
      if (!entry) return;
      entry.message = message;
      removeFromStack(id);
      activeStack.push(id);
      renderTop();
    },
    done(message = "done") {
      const entry = entries.get(id);
      if (!entry) return;
      entry.message = message;
      const wasTop = activeStack[activeStack.length - 1] === id;
      removeFromStack(id);
      entries.delete(id);
      if (!interactive) return;
      if (wasTop && activeStack.length === 0) {
        renderLine(entry.noPrefix ? message : ttyFormatTagged(prefix, message, { noisy: entry.noisy }));
        process.stderr.write("\n");
        return;
      }
      renderTop();
    },
    async track<T>(
      message: string,
      work: Promise<T>,
      options: { intervalMs?: number; heartbeat?: (elapsedMs: number, message: string) => string } = {}
    ): Promise<T> {
      const startedAt = Date.now();
      this.update(message);
      const timer = setInterval(() => {
        const elapsedMs = Date.now() - startedAt;
        this.update(options.heartbeat ? options.heartbeat(elapsedMs, message) : `${message} · ${Math.round(elapsedMs / 1000)}s`);
      }, options.intervalMs ?? 10000);

      try {
        return await work;
      } finally {
        clearInterval(timer);
      }
    }
  };
}

export async function withHeartbeat<T>(
  status: TtyStatus,
  message: string,
  work: Promise<T>,
  options: { intervalMs?: number; heartbeat?: (elapsedMs: number) => string } = {}
): Promise<T> {
  return status.track(message, work, {
    intervalMs: options.intervalMs,
    heartbeat: options.heartbeat ? (elapsedMs) => options.heartbeat?.(elapsedMs) ?? message : undefined
  });
}