import { describe, expect, it } from "vitest";
import { buildProviderSessionConfig } from "../../src/providers/copilot-sdk-provider-session-config.js";
import type { CopilotSdkProviderOptions } from "../../src/providers/copilot-sdk-provider.js";

function createOptions(): CopilotSdkProviderOptions {
  return {
    model: "gpt-5",
    requestTimeoutMs: 1000,
    clientOptions: {
      useLoggedInUser: false
    },
    sessionConfig: {
      provider: {
        type: "openai",
        wireApi: "completions",
        baseUrl: "https://example.test/v1"
      },
      infiniteSessions: { enabled: true },
      workingDirectory: "/tmp/workspace"
    }
  };
}

describe("buildProviderSessionConfig", () => {
  it("omits undefined optional fields", () => {
    const options = createOptions();
    const sessionConfig = buildProviderSessionConfig(options);

    expect(sessionConfig).toEqual({
      model: "gpt-5",
      provider: {
        type: "openai",
        wireApi: "completions",
        baseUrl: "https://example.test/v1"
      },
      infiniteSessions: { enabled: true },
      workingDirectory: "/tmp/workspace"
    });
    expect("enableConfigDiscovery" in sessionConfig).toBe(false);
    expect("skillDirectories" in sessionConfig).toBe(false);
    expect("disabledSkills" in sessionConfig).toBe(false);
  });

  it("includes explicit boolean and list fields when configured", () => {
    const options = createOptions();
    options.sessionConfig.enableConfigDiscovery = false;
    options.sessionConfig.streaming = true;
    options.sessionConfig.includeSubAgentStreamingEvents = false;
    options.sessionConfig.skillDirectories = ["/skills"];
    options.sessionConfig.disabledSkills = ["unsafe-skill"];

    const sessionConfig = buildProviderSessionConfig(options);

    expect(sessionConfig.enableConfigDiscovery).toBe(false);
    expect(sessionConfig.streaming).toBe(true);
    expect(sessionConfig.includeSubAgentStreamingEvents).toBe(false);
    expect(sessionConfig.skillDirectories).toEqual(["/skills"]);
    expect(sessionConfig.disabledSkills).toEqual(["unsafe-skill"]);
  });

  it("uses explicit working directory override", () => {
    const options = createOptions();
    const sessionConfig = buildProviderSessionConfig(options, "/tmp/override");
    expect(sessionConfig.workingDirectory).toBe("/tmp/override");
  });
});
