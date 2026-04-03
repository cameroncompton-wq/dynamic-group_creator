import type { DiffRow } from "./types";

export function parseCSV(content: string) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows: DiffRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i]);
    const record: Record<string, string> = {};
    headers.forEach((header, idx) => {
      record[header] = values[idx] ?? "";
    });
    const actionValue = record.action ? String(record.action).toLowerCase() : "";
    const action =
      actionValue === "create" || actionValue === "update" || actionValue === "match" || actionValue === "static"
        ? (actionValue as "create" | "update" | "match" | "static")
        : undefined;
    rows.push({
      id: record.id ? Number(record.id) : undefined,
      existsInPortal: String(record.existsInPortal).toLowerCase() === "true",
      fullPath: record.fullPath || "",
      current_applies_to: record.current_applies_to || "",
      new_applies_to: record.new_applies_to || "",
      numOfHosts: record.numOfHosts ? Number(record.numOfHosts) : undefined,
      isDynamic: String(record.isDynamic).toLowerCase() === "true",
      selected: String(record.selected).toLowerCase() !== "false",
      action
    });
  }

  return rows;
}

export function exportCSV(rows: DiffRow[]) {
  const headers = [
    "id",
    "existsInPortal",
    "action",
    "fullPath",
    "current_applies_to",
    "new_applies_to",
    "numOfHosts",
    "isDynamic",
    "selected"
  ];

  const lines = [headers.join(",")];
  rows.forEach((row) => {
    const values = [
      row.id ?? "",
      row.existsInPortal,
      row.action ?? "",
      row.fullPath,
      row.current_applies_to,
      row.new_applies_to,
      row.numOfHosts ?? "",
      row.isDynamic ?? "",
      row.selected ?? ""
    ].map(escapeCsvValue);
    lines.push(values.join(","));
  });

  return lines.join("\n");
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

function escapeCsvValue(value: unknown) {
  const stringValue = String(value ?? "");
  if (stringValue.includes(",") || stringValue.includes("\"") || stringValue.includes("\n")) {
    return `"${stringValue.replace(/\"/g, "\"\"")}"`;
  }
  return stringValue;
}
