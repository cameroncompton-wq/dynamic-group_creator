export function normalizePortal(portal: string) {
  const trimmed = portal.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return trimmed;
}

export function buildLMUrl(portal: string, resourcePath: string, query?: Record<string, string>) {
  const base = `https://${normalizePortal(portal)}/santaba/rest`;
  const url = new URL(base + resourcePath);
  url.searchParams.set("v", "3");
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }
  return url.toString();
}
