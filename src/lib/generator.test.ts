import { describe, it, expect } from "vitest";
import { buildAppliesTo, buildGroupPath, mergeDeviceProperties } from "./generator";
import type { LMDevice, SchemaDefinition } from "./types";

it("buildGroupPath returns null if missing key", () => {
  const schema: SchemaDefinition = {
    layers: [{ id: "1", parts: [{ id: "p1", key: "env", strict: false, mode: "regex" }] }],
    layerSeparators: [],
    staticLayerLiterals: {}
  };
  const props = new Map<string, string>();
  expect(buildGroupPath(schema, props, "Root")).toBeNull();
});

it("buildAppliesTo honors layer separators and strict mode", () => {
  const schema: SchemaDefinition = {
    layers: [
      {
        id: "1",
        parts: [
          { id: "p1", key: "env", strict: true, mode: "regex", connectorToNext: "OR" },
          { id: "p2", key: "role", strict: false, mode: "regex" }
        ]
      },
      {
        id: "2",
        parts: [{ id: "p3", key: "region", strict: false, mode: "regex" }]
      }
    ],
    layerSeparators: ["AND"],
    staticLayerLiterals: {}
  };
  const device: LMDevice = {
    id: 1,
    displayName: "test",
    customProperties: [{ name: "env", value: "prod" }],
    systemProperties: [{ name: "role", value: "web" }],
    autoProperties: [{ name: "region", value: "us-east" }]
  };
  const props = mergeDeviceProperties(device);
  const appliesTo = buildAppliesTo(schema, props, {
    includeCaseVariants: false,
    normalizationKeyPrefixes: []
  });
  expect(appliesTo).toContain("env == \"prod\"");
  expect(appliesTo).toContain("role =~ \"web\"");
  expect(appliesTo).toContain("region =~ \"us-east\"");
  expect(appliesTo).toContain("&&");
});
