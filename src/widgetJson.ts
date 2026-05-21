import { highlightJson, type JsonTokenKind } from "./jsonHighlight";

export type JsonChunk = {
  text: string;
  kind?: JsonTokenKind;
};

export function jsonToLines(json: string): JsonChunk[][] {
  const ranges = highlightJson(json);
  const chunks: JsonChunk[] = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.start > cursor) {
      chunks.push({ text: json.slice(cursor, range.start) });
    }

    chunks.push({
      text: json.slice(range.start, range.end),
      kind: range.kind
    });
    cursor = range.end;
  }

  if (cursor < json.length) {
    chunks.push({ text: json.slice(cursor) });
  }

  return splitChunksByLine(chunks.length > 0 ? chunks : [{ text: json }]);
}

function splitChunksByLine(chunks: JsonChunk[]): JsonChunk[][] {
  const lines: JsonChunk[][] = [[]];

  for (const chunk of chunks) {
    const parts = chunk.text.split("\n");

    parts.forEach((part, index) => {
      if (index > 0) {
        lines.push([]);
      }

      if (part.length > 0) {
        lines[lines.length - 1].push({
          text: part,
          kind: chunk.kind
        });
      }
    });
  }

  return lines;
}
