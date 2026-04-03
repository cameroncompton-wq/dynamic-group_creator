import crypto from "crypto";

type SignInput = {
  method: string;
  resourcePath: string;
  data: string;
  epoch: number;
  accessId: string;
  accessKey: string;
};

export function signLMv1({
  method,
  resourcePath,
  data,
  epoch,
  accessId,
  accessKey
}: SignInput) {
  const requestVars = method + epoch + data + resourcePath;
  const hmac = crypto.createHmac("sha256", accessKey);
  hmac.update(requestVars, "utf8");
  const hex = hmac.digest("hex");
  const signature = Buffer.from(hex, "utf8").toString("base64");
  return `LMv1 ${accessId}:${signature}:${epoch}`;
}

export async function lmFetch<T>(
  url: string,
  init: RequestInit & { accessId: string; accessKey: string; resourcePath: string },
  retries = 3,
  onRateLimit?: (info: { delay: number; retriesLeft: number; resourcePath: string }) => void
): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const data = init.body ? String(init.body) : "";
  const epoch = Date.now();
  const authorization = signLMv1({
    method,
    resourcePath: init.resourcePath,
    data,
    epoch,
    accessId: init.accessId,
    accessKey: init.accessKey
  });

  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization,
      ...(init.headers || {})
    }
  });

  if (response.status === 429 && retries > 0) {
    const delay = 10000 * Math.pow(2, 3 - retries);
    onRateLimit?.({ delay, retriesLeft: retries - 1, resourcePath: init.resourcePath });
    await new Promise((resolve) => setTimeout(resolve, delay));
    return lmFetch<T>(url, init, retries - 1, onRateLimit);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LogicMonitor API error ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

export async function lmFetchWithMeta<T>(
  url: string,
  init: RequestInit & { accessId: string; accessKey: string; resourcePath: string },
  retries = 3,
  onRateLimit?: (info: { delay: number; retriesLeft: number; resourcePath: string }) => void
): Promise<{ status: number; data: T }> {
  const method = (init.method || "GET").toUpperCase();
  const data = init.body ? String(init.body) : "";
  const epoch = Date.now();
  const authorization = signLMv1({
    method,
    resourcePath: init.resourcePath,
    data,
    epoch,
    accessId: init.accessId,
    accessKey: init.accessKey
  });

  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization,
      ...(init.headers || {})
    }
  });

  if (response.status === 429 && retries > 0) {
    const delay = 10000 * Math.pow(2, 3 - retries);
    onRateLimit?.({ delay, retriesLeft: retries - 1, resourcePath: init.resourcePath });
    await new Promise((resolve) => setTimeout(resolve, delay));
    return lmFetchWithMeta<T>(url, init, retries - 1, onRateLimit);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LogicMonitor API error ${response.status}: ${text}`);
  }

  return { status: response.status, data: (await response.json()) as T };
}
