import { describe, expect, it } from "vitest";
import { highlightJson } from "../src/jsonHighlight";

function highlightedValues(json: string, kind: "number" | "string" | "boolean"): string[] {
  return highlightJson(json)
    .filter((range) => range.kind === kind)
    .map((range) => json.slice(range.start, range.end));
}

describe("highlightJson", () => {
  it("highlights numeric values", () => {
    const json = '{\n  "Id": 0,\n  "Rate": -12.5e+2\n}';

    expect(highlightedValues(json, "number")).toEqual(["0", "-12.5e+2"]);
  });

  it("highlights string values but not object keys", () => {
    const json = '{\n  "Name": "string",\n  "DueDate": "2026-05-21T15:58:41.110Z"\n}';

    expect(highlightedValues(json, "string")).toEqual([
      "\"string\"",
      "\"2026-05-21T15:58:41.110Z\""
    ]);
    expect(highlightJson(json).some((range) => json.slice(range.start, range.end) === "\"Name\"")).toBe(false);
  });

  it("highlights boolean values", () => {
    const json = '{\n  "Enabled": true,\n  "Deleted": false\n}';

    expect(highlightedValues(json, "boolean")).toEqual(["true", "false"]);
  });

  it("keeps numbers and booleans inside quoted strings as string values", () => {
    const json = '{\n  "Value": "true 123",\n  "Count": 123\n}';

    expect(highlightedValues(json, "string")).toEqual(["\"true 123\""]);
    expect(highlightedValues(json, "number")).toEqual(["123"]);
    expect(highlightedValues(json, "boolean")).toEqual([]);
  });

  it("handles nested arrays and objects", () => {
    const json = '{\n  "Items": [\n    {\n      "Id": 1,\n      "Type": "PayInFull",\n      "Active": true\n    }\n  ]\n}';

    expect(highlightedValues(json, "number")).toEqual(["1"]);
    expect(highlightedValues(json, "string")).toEqual(["\"PayInFull\""]);
    expect(highlightedValues(json, "boolean")).toEqual(["true"]);
  });
});
