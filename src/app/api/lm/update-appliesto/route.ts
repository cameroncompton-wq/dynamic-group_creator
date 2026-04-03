import { NextResponse } from "next/server";
import { lmFetchWithMeta } from "../../../../lib/lmAuth";
import { buildLMUrl } from "../../../../lib/lmApi";
import type { DiffRow, LMCreds } from "../../../../lib/types";

type RequestBody = {
  creds: LMCreds;
  dryRun: boolean;
  rows: DiffRow[];
};

export async function POST(request: Request) {
  const body = (await request.json()) as RequestBody;
  if (!body?.creds?.accessId || !body?.creds?.accessKey || !body?.creds?.portal) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  try {
    const results: Array<{ id?: number; status: string; statusCode?: number | string; response?: unknown }> = [];
    const endpoints: string[] = [];
    const logs: string[] = [];
    for (const row of body.rows) {
      if (!row.id) {
        results.push({ id: row.id, status: "missing-id" });
        logs.push(`skip: ${row.fullPath || "unknown"} (missing id)`);
        continue;
      }
      endpoints.push(`/device/groups/${row.id}`);
      if (body.dryRun) {
        results.push({ id: row.id, status: "dry-run", statusCode: "dry-run" });
        logs.push(`dry-run update: ${row.fullPath || row.id}`);
        continue;
      }
      const resourcePath = `/device/groups/${row.id}`;
      const url = buildLMUrl(body.creds.portal, resourcePath);
      const response = await lmFetchWithMeta(url, {
        method: "PATCH",
        body: JSON.stringify({ appliesTo: row.new_applies_to }),
        accessId: body.creds.accessId,
        accessKey: body.creds.accessKey,
        resourcePath
      });
      results.push({ id: row.id, status: "updated", statusCode: response.status, response: response.data });
      logs.push(`update: ${row.fullPath || row.id} status ${response.status}`);
    }
    return NextResponse.json({ ok: true, results, endpoints, logs });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
