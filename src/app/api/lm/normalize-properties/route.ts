import { NextResponse } from "next/server";
import { lmFetchWithMeta } from "../../../../lib/lmAuth";
import { buildLMUrl } from "../../../../lib/lmApi";
import type { LMCreds } from "../../../../lib/types";

type Change = {
  deviceId: number;
  deviceName?: string;
  fromName: string;
  toName: string;
  value: string;
};

type RequestBody = {
  creds: LMCreds;
  dryRun?: boolean;
  debug?: boolean;
  changes: Change[];
};

export async function POST(request: Request) {
  const body = (await request.json()) as RequestBody;
  const { creds, dryRun = true, debug = false, changes = [] } = body || {};

  if (!creds?.accessId || !creds?.accessKey || !creds?.portal) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }
  if (!Array.isArray(changes) || changes.length === 0) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  const logs: string[] = [];
  const results: Array<{ deviceId: number; status: string }> = [];

  for (const change of changes) {
    const { deviceId, deviceName, fromName, toName, value } = change;
    if (!deviceId || !fromName || !toName) {
      continue;
    }
    const label = deviceName ? `${deviceName}` : "unknown";
    const onRateLimit = (info: { delay: number; retriesLeft: number; resourcePath: string }) => {
      logs.push(`[RATE LIMIT] ${info.resourcePath} retry in ${Math.round(info.delay / 1000)}s (${info.retriesLeft} left)`);
    };

    if (dryRun) {
      logs.push(`[DRY RUN] Device ${deviceId} (${label}): ${fromName} -> ${toName}`);
      results.push({ deviceId, status: "dry-run" });
      continue;
    }

    try {
      const devicePath = `/device/devices/${deviceId}`;
      const deletePath = `/device/devices/${deviceId}/properties/${encodeURIComponent(fromName)}`;

      const updatePath = `/device/devices/${deviceId}`;
      const updateUrl = buildLMUrl(creds.portal, updatePath, {
        patchFields: "customProperties",
        opType: "replace"
      });
      const payload = {
        customProperties: [{ name: toName, value }]
      };
      const deleteUrl = buildLMUrl(creds.portal, deletePath);

      if (debug) logs.push(`[REQUEST] DELETE ${deletePath}`);
      try {
        const deleteResult = await lmFetchWithMeta(deleteUrl, {
          method: "DELETE",
          accessId: creds.accessId,
          accessKey: creds.accessKey,
          resourcePath: deletePath
        }, 3, onRateLimit);
        if (debug) logs.push(`[RESPONSE] DELETE ${deletePath} status=${deleteResult.status} body=${JSON.stringify(deleteResult.data)}`);
      } catch (error) {
        const msg = (error as Error).message || "";
        if (msg.includes("errorCode\":1404") || msg.includes("cannot be found")) {
          if (debug) logs.push(`[WARN] DELETE ${deletePath} not found (may be inherited). Continuing.`);
        } else {
          throw error;
        }
      }

      if (debug) logs.push(`[REQUEST] PATCH ${updatePath} payload=${JSON.stringify(payload)}`);
      const { status, data } = await lmFetchWithMeta(updateUrl, {
        method: "PATCH",
        accessId: creds.accessId,
        accessKey: creds.accessKey,
        resourcePath: updatePath,
        body: JSON.stringify(payload)
      }, 3, onRateLimit);

      if (debug) logs.push(`[RESPONSE] Device ${deviceId}: status=${status} body=${JSON.stringify(data)}`);
      if (debug) {
        const getPath = `/device/devices/${deviceId}`;
        const getUrl = buildLMUrl(creds.portal, getPath, { fields: "id,displayName,customProperties" });
        logs.push(`[REQUEST] GET ${getPath}?fields=id,displayName,customProperties`);
        const getResult = await lmFetchWithMeta(getUrl, {
          method: "GET",
          accessId: creds.accessId,
          accessKey: creds.accessKey,
          resourcePath: getPath
        }, 3, onRateLimit);
        logs.push(`[RESPONSE] GET ${getPath} status=${getResult.status} body=${JSON.stringify(getResult.data)}`);
      }
      logs.push(`[SUCCESS] Device ${deviceId} (${label}): ${fromName} -> ${toName}`);
      results.push({ deviceId, status: "updated" });
    } catch (error) {
      logs.push(`[ERROR] Device ${deviceId}: ${(error as Error).message}`);
      results.push({ deviceId, status: "error" });
    }
  }

  return NextResponse.json({ results, logs });
}
