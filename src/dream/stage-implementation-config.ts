export type StageImplementationBindings = Record<string, string>;

export function normalizeStageSlotId(id: string): string {
  return id.startsWith("stage.") ? `slot.${id.slice("stage.".length)}` : id;
}

export function parseStageImplementationBindings(value: string | undefined): StageImplementationBindings {
  if (!value?.trim()) return {};
  const bindings: StageImplementationBindings = {};
  for (const entry of value.split(",")) {
    const [rawSlot, rawImplementation, ...extra] = entry.split("=");
    const slot = rawSlot?.trim();
    const implementation = rawImplementation?.trim();
    if (!slot || !implementation || extra.length > 0) {
      throw new Error(`Invalid DREAM_STAGE_IMPLEMENTATIONS entry: ${entry}`);
    }
    bindings[normalizeStageSlotId(slot)] = implementation;
  }
  return bindings;
}

export function mergeStageImplementationBindings(
  runtimeBindings: StageImplementationBindings | undefined,
  envBindings: StageImplementationBindings
): StageImplementationBindings {
  const normalizedRuntimeBindings: StageImplementationBindings = {};
  for (const [slot, implementation] of Object.entries(runtimeBindings ?? {})) {
    normalizedRuntimeBindings[normalizeStageSlotId(slot)] = implementation;
  }
  return { ...normalizedRuntimeBindings, ...envBindings };
}
