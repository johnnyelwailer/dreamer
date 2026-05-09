import type { PipelineStage } from "../core/contracts.js";
import { enforceTranscriptInertness } from "../core/safety.js";
import type { DreamContext } from "../core/types.js";

export class SignalStage implements PipelineStage {
  readonly id = "stage.signal";

  async run(context: DreamContext): Promise<DreamContext> {
    const safeEvents = enforceTranscriptInertness(context.events);
    context.events = safeEvents;
    const starts = safeEvents.filter((e) => e.kind === "session_start").length;
    context.signals.push(`session_starts=${starts}`);
    context.diary.push(`signals:events=${safeEvents.length}`);
    context.metrics.sessionsProcessed += starts;
    return context;
  }
}
