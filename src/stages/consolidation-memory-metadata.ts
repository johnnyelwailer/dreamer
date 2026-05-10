import type { InsightRecord, MemoryEvidence, MemoryReference } from "../core/types.js";

type MetadataContext = {
  insights: InsightRecord[];
  runId: string;
};

function equalNormalized(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function inferEvidenceAndReferences(
  statement: string,
  evidence: MemoryEvidence[] | undefined,
  references: MemoryReference[] | undefined,
  context: MetadataContext
): { evidence: MemoryEvidence[]; references: MemoryReference[]; sessionIds: string[] } {
  const matchedInsight = context.insights.find((insight) => equalNormalized(insight.statement, statement));
  const inferredEvidence = evidence ?? matchedInsight?.evidence;
  const inferredReferences = references ?? matchedInsight?.capture?.references;
  const sessionIdsFromEvidence = (inferredEvidence ?? [])
    .map((item) => item.sessionId)
    .filter((value): value is string => Boolean(value));
  const sessionIdsFromReferences = (inferredReferences ?? [])
    .filter((reference) => reference.kind === "session")
    .map((reference) => reference.value);
  const sessionIds = [...new Set([...sessionIdsFromEvidence, ...sessionIdsFromReferences])];

  const mergedReferences: MemoryReference[] = [...(inferredReferences ?? [])];
  for (const sessionId of sessionIds) {
    const alreadyPresent = mergedReferences.some((reference) => reference.kind === "session" && reference.value === sessionId);
    if (!alreadyPresent) {
      mergedReferences.push({ kind: "session", value: sessionId, note: "Auto-added from evidence" });
    }
  }
  if (!mergedReferences.length) {
    mergedReferences.push({ kind: "doc", value: `dream-run:${context.runId}`, note: "Auto-added run reference" });
  }

  const mergedEvidence: MemoryEvidence[] = inferredEvidence?.length
    ? inferredEvidence
    : [{ quote: `consolidation_run:${context.runId}` }];

  return { evidence: mergedEvidence, references: mergedReferences, sessionIds };
}
