import { NextResponse } from "next/server";
import { lmFetch } from "../../../../lib/lmAuth";
import { buildLMUrl } from "../../../../lib/lmApi";
import type { LMCreds, LMGroup } from "../../../../lib/types";

type LMResponse = {
  items: LMGroup[];
};

export async function POST(request: Request) {
  const creds = (await request.json()) as LMCreds;
  if (!creds?.accessId || !creds?.accessKey || !creds?.portal) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  try {
    const items = await fetchAllGroups(creds);

    return NextResponse.json(
      items.map((group) => ({
        ...group,
        isDynamic: Boolean(group.appliesTo && group.appliesTo.trim())
      }))
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

async function fetchAllGroups(creds: LMCreds) {
  const resourcePath = "/device/groups";
  const size = 1000;
  let offset = 0;
  const all: LMGroup[] = [];

  while (true) {
    const url = buildLMUrl(creds.portal, resourcePath, {
      fields: "id,fullPath,name,appliesTo,numOfHosts,parentId",
      filter: "groupType:\"Normal\"",
      size: String(size),
      offset: String(offset)
    });
    const response = await lmFetch<LMResponse>(url, {
      method: "GET",
      accessId: creds.accessId,
      accessKey: creds.accessKey,
      resourcePath
    });
    all.push(...response.items);
    if (response.items.length < size) {
      break;
    }
    offset += response.items.length;
  }

  return all;
}
