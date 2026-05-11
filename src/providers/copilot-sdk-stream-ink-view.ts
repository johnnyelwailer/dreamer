import React, { createElement, useEffect, useState, useSyncExternalStore } from "react";
import { Box, Static, Text } from "ink";
import { colorForTag, type InkLogEntry, type InkSnapshot } from "./copilot-sdk-stream-ink-utils.js";

export function InkView({ store }: { store: { subscribe: (listener: () => void) => () => void; getSnapshot: () => InkSnapshot } }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    interval.unref?.();
    return () => clearInterval(interval);
  }, []);

  return createElement(
    Box,
    { flexDirection: "column" },
    createElement(
      Static,
      {
        items: snapshot.logs
      },
      (entry: InkLogEntry) =>
        createElement(
          Box,
          { key: entry.id },
          createElement(Text, { color: colorForTag(entry.tag) }, entry.tag ? `[${entry.tag}] ` : ""),
          createElement(
            Text,
            {
              color:
                entry.tone === "error"
                  ? "red"
                  : entry.tone === "signal"
                    ? "cyan"
                    : entry.tone === "noisy"
                      ? "gray"
                      : "white"
            },
            entry.message
          )
        )
    ),
    snapshot.events.length > 0
      ? createElement(
          Box,
          { marginTop: 1, flexDirection: "column" },
          ...snapshot.events.map((event) => {
            const origin = event.sourceTag.trim() ? ` · ${event.sourceTag}` : "";
            const count = event.count > 1 ? ` ×${event.count}` : "";
            return createElement(
              Box,
              { key: event.id, flexDirection: "column" },
              createElement(Text, { color: "gray" }, `[event] ${event.eventType}${origin}${count}`),
              event.summary
                ? createElement(Text, { color: "gray" }, `  ${event.summary}`)
                : null
            );
          })
        )
      : null,
    snapshot.activities.length > 0
      ? createElement(
          Box,
          { marginTop: 1, flexDirection: "column" },
          ...snapshot.activities.map((activity) =>
            createElement(
              Box,
              { key: activity.id, flexDirection: "column" },
              createElement(
                Box,
                null,
                createElement(Text, { color: colorForTag(activity.tag) }, `[${activity.tag}] `),
                activity.title
                  ? createElement(Text, { color: "white" }, activity.title)
                  : null
              ),
              activity.args
                ? createElement(Text, { color: "gray" }, `  args: ${activity.args}`)
                : null,
              activity.status === "running"
                ? createElement(Text, { color: "gray" }, "  status: running")
                : activity.status === "completed"
                  ? createElement(Text, { color: "green" }, "  status: completed")
                  : createElement(Text, { color: "red" }, "  status: failed"),
              activity.result
                ? createElement(Text, { color: "gray" }, `  result: ${activity.result}`)
                : null,
              activity.error
                ? createElement(Text, { color: "red" }, `  error: ${activity.error}`)
                : null
            )
          )
        )
      : null,
    snapshot.active.length > 0
      ? createElement(
          Box,
          { marginTop: 1, flexDirection: "column" },
          ...snapshot.active.map((entry) =>
            createElement(
              Box,
              { key: entry.id, flexDirection: "column" },
              createElement(Text, { color: "cyan" }, `- ${entry.name}`),
              entry.description
                ? createElement(Text, { color: "gray" }, `  ${entry.description}`)
                : null,
              entry.toolName
                ? createElement(
                    Box,
                    null,
                    createElement(Text, { color: "white" }, `  ${entry.toolName}`),
                    entry.toolArgs ? createElement(Text, { color: "gray" }, ` ${entry.toolArgs}`) : null
                  )
                : entry.task?.trim()
                  ? createElement(Text, { color: "gray" }, `  ${entry.task}`)
                  : null,
              createElement(Text, { color: "gray" }, `  ${Math.max(0, Math.floor((now - entry.startedAt) / 1000))}s`)
            )
          )
        )
      : null
  );
}
