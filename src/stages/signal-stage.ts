import type { PipelineStage } from "../core/contracts.js";
import { enforceTranscriptInertness } from "../core/safety.js";
import type { DreamContext } from "../core/types.js";

export class SignalStage implements PipelineStage {
  readonly id = "stage.signal";

  async run(context: DreamContext): Promise<DreamContext> {
    const safeEvents = enforceTranscriptInertness(context.events);
    context.events = safeEvents;
    const starts = safeEvents.filter((e) => e.kind === "session_start").length;
    const messages = safeEvents.filter((e) => e.kind === "message");
    const tools = safeEvents.filter((e) => e.kind === "tool").length;
    const userMessages = messages.filter((event) => event.metadata.role === "user").length;
    const assistantMessages = messages.filter((event) => event.metadata.role === "assistant").length;
    const transcriptChars = messages.reduce((sum, event) => sum + event.text.length, 0);

    context.signals.push(`session_starts=${starts}`);
    context.signals.push(`message_events=${messages.length}`);
    context.signals.push(`tool_events=${tools}`);
    context.signals.push(`user_messages=${userMessages}`);
    context.signals.push(`assistant_messages=${assistantMessages}`);
    context.signals.push(`transcript_characters=${transcriptChars}`);
    context.diary.push(`signals:events=${safeEvents.length}`);
    context.metrics.sessionsProcessed += starts;
    return context;
  }
}
