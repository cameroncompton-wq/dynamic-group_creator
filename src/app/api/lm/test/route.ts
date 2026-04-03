import { NextResponse } from "next/server";
import { lmFetch } from "../../../../lib/lmAuth";
import { buildLMUrl } from "../../../../lib/lmApi";
import type { LMCreds } from "../../../../lib/types";

export async function POST(request: Request) {
  const creds = (await request.json()) as LMCreds;
  if (!creds?.accessId || !creds?.accessKey || !creds?.portal) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  const resourcePath = "/device/groups";
  const url = buildLMUrl(creds.portal, resourcePath, {
    fields: "id",
    size: "1",
    offset: "0"
  });

  try {
    await lmFetch(url, {
      method: "GET",
      accessId: creds.accessId,
      accessKey: creds.accessKey,
      resourcePath
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
