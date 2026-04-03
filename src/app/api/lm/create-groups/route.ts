import { NextResponse } from "next/server";
import { lmFetchWithMeta } from "../../../../lib/lmAuth";
import { buildLMUrl } from "../../../../lib/lmApi";
import type { DiffRow, LMCreds, LMGroup } from "../../../../lib/types";

type RequestBody = {
  creds: LMCreds;
  dryRun: boolean;
  rows: DiffRow[];
};

type LMResponse = {
  items: LMGroup[];
};

export async function POST(request: Request) {
  const body = (await request.json()) as RequestBody;
  if (!body?.creds?.accessId || !body?.creds?.accessKey || !body?.creds?.portal) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  try {
    const groupsMap = await fetchGroups(body.creds);
    const results: Array<{ path: string; status: string; statusCode?: number | string; response?: unknown }> = [];
    const endpoints: string[] = [];
    const logs: string[] = [];

    for (const row of body.rows) {
      const fullPath = row.fullPath;
      if (!fullPath) {
        continue;
      }
      if (groupsMap.has(fullPath.toLowerCase())) {
        results.push({ path: fullPath, status: "exists" });
        logs.push(`skip: ${fullPath} (already exists)`);
        continue;
      }
      endpoints.push("/device/groups");
      if (body.dryRun) {
        results.push({ path: fullPath, status: "dry-run", statusCode: "dry-run" });
        logs.push(`dry-run create: ${fullPath}`);
        continue;
      }
      const created = await ensureGroupExists(body.creds, fullPath, row.new_applies_to, groupsMap);
      results.push({
        path: fullPath,
        status: created ? "created" : "skipped",
        statusCode: created && typeof created === "object" ? created.statusCode : undefined,
        response: created && typeof created === "object" ? created.response : created
      });
      if (created && typeof created === "object") {
        logs.push(`create: ${fullPath} status ${created.statusCode}`);
      } else {
        logs.push(`create: ${fullPath} status unknown`);
      }
    }

    return NextResponse.json({ ok: true, results, endpoints, logs });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

async function fetchGroups(creds: LMCreds) {
  const resourcePath = "/device/groups";
  const map = new Map<string, LMGroup>();
  const size = 1000;
  let offset = 0;

  while (true) {
    const url = buildLMUrl(creds.portal, resourcePath, {
      fields: "id,fullPath,parentId",
      size: String(size),
      offset: String(offset)
    });
    const response = await lmFetchWithMeta<LMResponse>(url, {
      method: "GET",
      accessId: creds.accessId,
      accessKey: creds.accessKey,
      resourcePath
    });
    response.data.items.forEach((group) => map.set(group.fullPath.toLowerCase(), group));
    if (response.data.items.length < size) {
      break;
    }
    offset += response.data.items.length;
  }
  return map;
}

async function ensureGroupExists(
  creds: LMCreds,
  fullPath: string,
  appliesTo: string,
  groupsMap: Map<string, LMGroup>
) {
  const parts = fullPath.split("/").filter(Boolean);
  let currentPath = "";
  let parentId = 1; // Root group ID
  let lastCreated: { statusCode: number; response: LMGroup } | null = null;

  for (let i = 0; i < parts.length; i += 1) {
    const segment = parts[i];
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    const existing = groupsMap.get(currentPath.toLowerCase());
    if (existing) {
      parentId = existing.id;
      continue;
    }

    const payload: { name: string; parentId: number; appliesTo: string } = {
      name: segment,
      parentId,
      appliesTo: i === parts.length - 1 ? appliesTo : ""
    };

    const resourcePath = "/device/groups";
    const url = buildLMUrl(creds.portal, resourcePath);
    const created = await lmFetchWithMeta<LMGroup>(url, {
      method: "POST",
      body: JSON.stringify(payload),
      accessId: creds.accessId,
      accessKey: creds.accessKey,
      resourcePath
    });

    groupsMap.set(currentPath.toLowerCase(), created.data);
    parentId = created.data.id;
    lastCreated = { statusCode: created.status, response: created.data };
  }
  return lastCreated ?? true;
}
