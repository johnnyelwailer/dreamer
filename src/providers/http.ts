export async function postJson<T>(
  url: string,
  apiKey: string,
  body: object,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...extraHeaders
  };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  return (await response.json()) as T;
}
