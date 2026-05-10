function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`Invalid runtime manifest field: ${field}`);
  return value;
}

function asStringOrUndefined(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return asString(value, field);
}

function asBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Invalid runtime manifest field: ${field}`);
  return value;
}

function asEnum<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`Invalid runtime manifest field: ${field}`);
  return value as T;
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`Invalid runtime manifest field: ${field}`);
  }
  return value;
}

export function parseAgentPacks(
  value: unknown,
  field: string
): Record<
  string,
  {
    defaultAgent?: { excludedTools: string[] };
    customAgents: Array<{
      name: string;
      displayName?: string;
      description?: string;
      tools?: string[] | null;
      promptTemplatePath: string;
      infer?: boolean;
    }>;
    execution?: { mode: "inferred" | "explicit-sequence"; explicitSequence?: string[] };
  }
> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid runtime manifest field: ${field}`);

  const parsed: Record<string, {
    defaultAgent?: { excludedTools: string[] };
    customAgents: Array<{
      name: string;
      displayName?: string;
      description?: string;
      tools?: string[] | null;
      promptTemplatePath: string;
      infer?: boolean;
    }>;
    execution?: { mode: "inferred" | "explicit-sequence"; explicitSequence?: string[] };
  }> = {};

  for (const [stageId, rawPack] of Object.entries(value as Record<string, unknown>)) {
    const packField = `${field}.${stageId}`;
    if (!rawPack || typeof rawPack !== "object" || Array.isArray(rawPack)) {
      throw new Error(`Invalid runtime manifest field: ${packField}`);
    }
    const pack = rawPack as Record<string, unknown>;
    if (!Array.isArray(pack.customAgents)) throw new Error(`Invalid runtime manifest field: ${packField}.customAgents`);

    const customAgents = pack.customAgents.map((rawAgent, index) => {
      const agentField = `${packField}.customAgents.${index}`;
      if (!rawAgent || typeof rawAgent !== "object" || Array.isArray(rawAgent)) {
        throw new Error(`Invalid runtime manifest field: ${agentField}`);
      }
      const agent = rawAgent as Record<string, unknown>;
      return {
        name: asString(agent.name, `${agentField}.name`),
        displayName: asStringOrUndefined(agent.displayName, `${agentField}.displayName`),
        description: asStringOrUndefined(agent.description, `${agentField}.description`),
        tools: agent.tools === undefined ? undefined : agent.tools === null ? null : asStringArray(agent.tools, `${agentField}.tools`),
        promptTemplatePath: asString(agent.promptTemplatePath, `${agentField}.promptTemplatePath`),
        infer: agent.infer === undefined ? undefined : asBoolean(agent.infer, `${agentField}.infer`)
      };
    });

    const defaultAgent =
      pack.defaultAgent === undefined
        ? undefined
        : !pack.defaultAgent || typeof pack.defaultAgent !== "object" || Array.isArray(pack.defaultAgent)
          ? (() => {
              throw new Error(`Invalid runtime manifest field: ${packField}.defaultAgent`);
            })()
          : {
              excludedTools: asStringArray((pack.defaultAgent as Record<string, unknown>).excludedTools, `${packField}.defaultAgent.excludedTools`)
            };

    const execution =
      pack.execution === undefined
        ? undefined
        : !pack.execution || typeof pack.execution !== "object" || Array.isArray(pack.execution)
          ? (() => {
              throw new Error(`Invalid runtime manifest field: ${packField}.execution`);
            })()
          : {
              mode: asEnum((pack.execution as Record<string, unknown>).mode, ["inferred", "explicit-sequence"] as const, `${packField}.execution.mode`),
              explicitSequence:
                (pack.execution as Record<string, unknown>).explicitSequence === undefined
                  ? undefined
                  : asStringArray((pack.execution as Record<string, unknown>).explicitSequence, `${packField}.execution.explicitSequence`)
            };

    parsed[stageId] = { defaultAgent, customAgents, execution };
  }
  return parsed;
}