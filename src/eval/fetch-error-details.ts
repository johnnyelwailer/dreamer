type MaybeError = Error & {
  cause?: unknown;
  code?: string;
  errno?: number;
  syscall?: string;
  address?: string;
  hostname?: string;
  port?: number;
};

function detailFrom(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const e = value as MaybeError;
  const parts = [
    typeof e.name === "string" ? e.name : undefined,
    typeof e.message === "string" ? e.message : undefined,
    typeof e.code === "string" ? `code=${e.code}` : undefined,
    typeof e.errno === "number" ? `errno=${e.errno}` : undefined,
    typeof e.syscall === "string" ? `syscall=${e.syscall}` : undefined,
    typeof e.address === "string" ? `address=${e.address}` : undefined,
    typeof e.hostname === "string" ? `host=${e.hostname}` : undefined,
    typeof e.port === "number" ? `port=${e.port}` : undefined
  ].filter((v): v is string => Boolean(v));
  return parts.length ? parts.join(" | ") : undefined;
}

export function describeFetchError(error: unknown): string {
  const top = detailFrom(error);
  const cause = detailFrom((error as MaybeError | undefined)?.cause);
  if (top && cause) return `${top} :: cause=${cause}`;
  return top || String(error);
}