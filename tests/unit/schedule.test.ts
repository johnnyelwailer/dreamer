import { describe, expect, it } from "vitest";
import { buildPortableCronExpression, buildTaskLabel, normalizeCronExpression, parseDailyTime } from "../../src/scheduling/durable-schedule.js";

describe("parseDailyTime", () => {
  it("parses valid HH:MM values", () => {
    expect(parseDailyTime("09:05")).toEqual({ hour: 9, minute: 5 });
    expect(parseDailyTime("23:59")).toEqual({ hour: 23, minute: 59 });
    expect(parseDailyTime("0:00")).toEqual({ hour: 0, minute: 0 });
  });

  it("rejects invalid time formats", () => {
    expect(() => parseDailyTime("9")).toThrow(/Invalid time format/);
    expect(() => parseDailyTime("24:00")).toThrow(/Invalid time value/);
    expect(() => parseDailyTime("12:60")).toThrow(/Invalid time value/);
    expect(() => parseDailyTime("ab:cd")).toThrow(/Invalid time format/);
  });
});

describe("buildTaskLabel", () => {
  it("is deterministic for a workspace", () => {
    const workspace = "/tmp/dreamer-a";
    expect(buildTaskLabel(workspace)).toBe(buildTaskLabel(workspace));
  });

  it("differs across workspaces", () => {
    const left = buildTaskLabel("/tmp/dreamer-a");
    const right = buildTaskLabel("/tmp/dreamer-b");
    expect(left).not.toBe(right);
  });
});

describe("normalizeCronExpression", () => {
  it("normalizes whitespace in valid 5-field expressions", () => {
    expect(normalizeCronExpression(" 0   9  *  *   1-5 ")).toBe("0 9 * * 1-5");
  });

  it("rejects invalid cron field counts", () => {
    expect(() => normalizeCronExpression("0 9 * *")).toThrow(/Expected 5 fields/);
    expect(() => normalizeCronExpression("0 9 * * 1-5 extra")).toThrow(/Expected 5 fields/);
  });
});

describe("buildPortableCronExpression", () => {
  it("builds hourly and daily expressions", () => {
    expect(buildPortableCronExpression({ kind: "hourly", at: "09:15" })).toBe("15 * * * *");
    expect(buildPortableCronExpression({ kind: "daily", at: "09:15" })).toBe("15 9 * * *");
  });

  it("builds weekly and monthly expressions", () => {
    expect(buildPortableCronExpression({ kind: "weekly", at: "09:15", weekday: 5 })).toBe("15 9 * * 5");
    expect(buildPortableCronExpression({ kind: "monthly", at: "09:15", dayOfMonth: 17 })).toBe("15 9 17 * *");
  });
});
