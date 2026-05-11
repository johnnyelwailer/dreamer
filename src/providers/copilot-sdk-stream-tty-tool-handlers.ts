import { ttyWriteContinuation, ttyWriteTagged } from "../shared/tty-log-format.js";
import { buildToolErrorPreview } from "./copilot-sdk-stream-format.js";
import { buildToolResultVerboseLines } from "./copilot-sdk-stream-verbose-format.js";
import { type CopilotEvent } from "./copilot-sdk-stream-event-helpers.js";

export function createToolHandlers(interactive: boolean, verbose: boolean, toolStream: NodeJS.WritableStream) {
  function closeStreamingLine(): void {
    toolStream.write("\n");
  }

  function writeVerboseToolBlock(record: CopilotEvent, tag: string, argsLines: string[], argsPreview: string): void {
    const resultLines = buildToolResultVerboseLines(record.data);
    closeStreamingLine();
    if (interactive) toolStream.write("\n");

    if (argsLines.length > 0) {
      ttyWriteTagged(tag, argsLines[0] ?? "", { noisy: true, stream: toolStream });
      for (const line of argsLines.slice(1)) ttyWriteContinuation(line, { noisy: true, indent: 4, stream: toolStream });
    } else {
      ttyWriteTagged(tag, argsPreview ?? "", { noisy: true, stream: toolStream });
    }

    if (resultLines.length === 0) return;
    ttyWriteContinuation("result:", { noisy: true, indent: 2, stream: toolStream });
    for (const line of resultLines) ttyWriteContinuation(line, { noisy: true, indent: 4, stream: toolStream });
  }

  function writeToolFailure(record: CopilotEvent, tag: string, args: string): void {
    const preview = buildToolErrorPreview(record.data);
    const failure = preview ? `failed ✗ ${preview}` : "failed ✗";
    if (interactive) toolStream.write("\n");
    if (args && !verbose) ttyWriteTagged(tag, args, { noisy: true, stream: toolStream });
    ttyWriteTagged(tag, failure, { error: true, stream: toolStream });
  }

  return {
    writeVerboseToolBlock,
    writeToolFailure,
    closeStreamingLine
  };
}
