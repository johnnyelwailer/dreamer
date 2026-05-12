import React, { createElement, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Box, Text, useInput } from "ink";
import { colorForTag, type InkLogEntry, type InkSnapshot } from "./copilot-sdk-stream-ink-utils.js";

export function InkView({ store }: { store: { subscribe: (listener: () => void) => () => void; getSnapshot: () => InkSnapshot } }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [now, setNow] = useState(() => Date.now());
  const [scrollOffset, setScrollOffset] = useState(0);
  const frozenSnapshotRef = useRef(snapshot);

  const isLive = scrollOffset === 0;
  if (isLive) frozenSnapshotRef.current = snapshot;
  const displaySnapshot = isLive ? snapshot : frozenSnapshotRef.current;

  const viewportRows = Math.max(6, (process.stdout.rows ?? 24) - 2);
  const lines = useMemo(() => toLines(displaySnapshot, now), [displaySnapshot, now]);
  const latestLineCount = useMemo(() => toLines(snapshot, now).length, [snapshot, now]);
  const maxOffset = Math.max(0, lines.length - viewportRows);

  useEffect(() => {
    if (scrollOffset <= maxOffset) return;
    setScrollOffset(maxOffset);
  }, [maxOffset, scrollOffset]);

  useEffect(() => {
    if (!isLive || displaySnapshot.active.length === 0) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    interval.unref?.();
    return () => clearInterval(interval);
  }, [displaySnapshot.active.length, isLive]);

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setScrollOffset((value) => Math.min(maxOffset, value + 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setScrollOffset((value) => Math.max(0, value - 1));
      return;
    }
    if (key.pageUp) {
      setScrollOffset((value) => Math.min(maxOffset, value + Math.max(1, viewportRows - 1)));
      return;
    }
    if (key.pageDown) {
      setScrollOffset((value) => Math.max(0, value - Math.max(1, viewportRows - 1)));
      return;
    }
    if (key.home) {
      setScrollOffset(maxOffset);
      return;
    }
    if (key.end || input === "f") {
      setScrollOffset(0);
    }
  });

  const start = Math.max(0, lines.length - viewportRows - scrollOffset);
  const visible = lines.slice(start, start + viewportRows);
  const pendingLines = Math.max(0, latestLineCount - lines.length);
  const status = isLive
    ? "LIVE"
    : `PAUSED (${scrollOffset}/${maxOffset})${pendingLines > 0 ? ` +${pendingLines} new` : ""}`;

  return createElement(
    Box,
    { flexDirection: "column" },
    ...visible.map((line) => createElement(Text, { key: line.id, color: line.color }, line.text)),
    createElement(Text, { color: "gray" }, `[${status}] Up/Down/PgUp/PgDn/Home/End, f=end`)
  );
}

type RenderLine = { id: string; text: string; color: string };

function toLines(snapshot: InkSnapshot, now: number): RenderLine[] {
  const lines: RenderLine[] = [];

  for (const entry of snapshot.logs) {
    lines.push({
      id: `log:${entry.id}`,
      text: `${entry.tag ? `[${entry.tag}] ` : ""}${entry.message}`,
      color:
        entry.tone === "error"
          ? "red"
          : entry.tone === "signal"
            ? "cyan"
            : entry.tone === "noisy"
              ? "gray"
              : colorForTag(entry.tag)
    });
  }

  for (const event of snapshot.events) {
    const origin = event.sourceTag.trim() ? ` · ${event.sourceTag}` : "";
    const count = event.count > 1 ? ` ×${event.count}` : "";
    lines.push({
      id: `event:${event.id}`,
      text: `[event] ${event.eventType}${origin}${count}`,
      color: "gray"
    });
    if (event.summary) {
      lines.push({
        id: `event-summary:${event.id}`,
        text: `  ${event.summary}`,
        color: "gray"
      });
    }
  }

  for (const activity of snapshot.activities) {
    const title = activity.title?.trim() ? activity.title : activity.toolName;
    lines.push({ id: `activity:${activity.id}:title`, text: `[${activity.tag}] ${title}`, color: colorForTag(activity.tag) });
    if (activity.args) lines.push({ id: `activity:${activity.id}:args`, text: `  args: ${activity.args}`, color: "gray" });
    lines.push({
      id: `activity:${activity.id}:status`,
      text: `  status: ${activity.status}`,
      color: activity.status === "completed" ? "green" : activity.status === "failed" ? "red" : "gray"
    });
    if (activity.result) lines.push({ id: `activity:${activity.id}:result`, text: `  result: ${activity.result}`, color: "gray" });
    if (activity.error) lines.push({ id: `activity:${activity.id}:error`, text: `  error: ${activity.error}`, color: "red" });
  }

  for (const entry of snapshot.active) {
    lines.push({ id: `active:${entry.id}:name`, text: `- ${entry.name}`, color: "cyan" });
    if (entry.description) lines.push({ id: `active:${entry.id}:desc`, text: `  ${entry.description}`, color: "gray" });
    if (entry.toolName) {
      lines.push({
        id: `active:${entry.id}:tool`,
        text: `  ${entry.toolName}${entry.toolArgs ? ` ${entry.toolArgs}` : ""}`,
        color: "white"
      });
    } else if (entry.task?.trim()) {
      lines.push({ id: `active:${entry.id}:task`, text: `  ${entry.task}`, color: "gray" });
    }
    lines.push({
      id: `active:${entry.id}:elapsed`,
      text: `  ${Math.max(0, Math.floor((now - entry.startedAt) / 1000))}s`,
      color: "gray"
    });
  }

  return lines;
}
