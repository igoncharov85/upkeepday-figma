import { describe, expect, it } from "vitest";
import { jsonToLines } from "../src/widgetJson";

describe("jsonToLines", () => {
  it("splits highlighted JSON into line chunks", () => {
    const lines = jsonToLines('{\n  "Id": 0,\n  "Type": "Dismiss",\n  "Active": true\n}');

    expect(lines).toHaveLength(5);
    expect(lines[1]).toContainEqual({ text: "0", kind: "number" });
    expect(lines[2]).toContainEqual({ text: "\"Dismiss\"", kind: "string" });
    expect(lines[3]).toContainEqual({ text: "true", kind: "boolean" });
    expect(lines[1].some((chunk) => chunk.text === "\"Id\"" && chunk.kind)).toBe(false);
  });
});
