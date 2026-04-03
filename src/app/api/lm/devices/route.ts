import { NextResponse } from "next/server";
import { lmFetch } from "../../../../lib/lmAuth";
import { buildLMUrl } from "../../../../lib/lmApi";
import type { LMCreds, LMDevice } from "../../../../lib/types";

type RequestBody = LMCreds & { filter?: string };

type LMResponse = {
  items: LMDevice[];
};

export async function POST(request: Request) {
  const body = (await request.json()) as RequestBody;
  if (!body?.accessId || !body?.accessKey || !body?.portal) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  try {
    const items = await fetchAllDevices(body);
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

async function fetchAllDevices(creds: LMCreds & { filter?: string }) {
  const resourcePath = "/device/devices";
  const filters = creds.filter
    ? [creds.filter]
    : [
        "systemProperties.name:\"system.cloud.category\",systemProperties.value:\"AWS/EC2\"",
        "deviceType:0"
      ];

  const unique = new Map<number, LMDevice>();
  for (const filter of filters) {
    const items = await fetchDevicesByFilter(creds, filter);
    items.forEach((device) => unique.set(device.id, device));
  }

  return Array.from(unique.values());
}

async function fetchDevicesByFilter(creds: LMCreds, filter: string) {
  const resourcePath = "/device/devices";
  const size = 1000;
  let offset = 0;
  const all: LMDevice[] = [];

  while (true) {
    const url = buildLMUrl(creds.portal, resourcePath, {
      fields: "id,displayName,customProperties,systemProperties,autoProperties",
      filter,
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
