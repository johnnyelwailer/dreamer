import { render } from "ink";
import React from "react";
import {
  resolveVerboseDefault,
  isToolStart,
  isToolComplete,
  type CopilotEvent
} from "./copilot-sdk-stream-event-helpers.js";
import { createStreamState } from "./copilot-sdk-stream-state.js";
import { createInkStore } from "./copilot-sdk-stream-ink-store.js";
import { InkView } from "./copilot-sdk-stream-ink-view.js";
import { createInkEventHandlers } from "./copilot-sdk-stream-ink-handlers.js";

let _inkSingleton: { store: ReturnType<typeof createInkStore>; agentTag: string; verbose: boolean } | undefined;

function getOrCreateInkSingleton(agentTag: string, verbose: boolean): ReturnType<typeof createInkStore> {
  if (!_inkSingleton) {
    const store = createInkStore();
    const ink = render(React.createElement(InkView, { store }), {
      patchConsole: true,
      stdout: process.stdout,
      stderr: process.stderr
    });
    process.once("exit", () => ink.unmount());
    _inkSingleton = { store, agentTag, verbose };
  }
  return _inkSingleton.store;
}

export function createDreamAgentInkStreamHandler(options: { agentTag?: string; verbose?: boolean } = {}): ((event: unknown) => void) | undefined {
  const interactive = Boolean(process.stderr.isTTY && process.env.CI !== "true");
  if (!interactive) return undefined;

  const agentTag = options.agentTag?.trim() || "dream agent";
  const verbose = resolveVerboseDefault(options.verbose);
  const state = createStreamState(agentTag);
  const store = getOrCreateInkSingleton(agentTag, verbose);
  const handlers = createInkEventHandlers(verbose, store, state);

  return (event: unknown) => {
    const record = (event ?? {}) as CopilotEvent;
    const type = record.type ?? "";

    if (type.startsWith("subagent.")) {
      handlers.handleSubagent(record, type);
      return;
    }

    if (isToolStart(type) || isToolComplete(type)) {
      handlers.handleTool(record, isToolStart(type));
      return;
    }

    handlers.handleVerboseEvents(record, type);
  };
}
