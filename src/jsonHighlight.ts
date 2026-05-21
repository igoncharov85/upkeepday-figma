export type JsonTokenKind = "number" | "string" | "boolean";

export type JsonTokenRange = {
  start: number;
  end: number;
  kind: JsonTokenKind;
};

export function highlightJson(json: string): JsonTokenRange[] {
  const ranges: JsonTokenRange[] = [];
  let index = 0;

  while (index < json.length) {
    const char = json[index];

    if (char === "\"") {
      const end = readStringEnd(json, index);
      if (!isObjectKey(json, end)) {
        ranges.push({ start: index, end, kind: "string" });
      }
      index = end;
      continue;
    }

    if (isNumberStart(json, index)) {
      const end = readNumberEnd(json, index);
      if (end > index) {
        ranges.push({ start: index, end, kind: "number" });
        index = end;
        continue;
      }
    }

    if (isWordAt(json, index, "true")) {
      ranges.push({ start: index, end: index + 4, kind: "boolean" });
      index += 4;
      continue;
    }

    if (isWordAt(json, index, "false")) {
      ranges.push({ start: index, end: index + 5, kind: "boolean" });
      index += 5;
      continue;
    }

    index += 1;
  }

  return ranges;
}

function readStringEnd(json: string, start: number): number {
  let index = start + 1;
  let escaped = false;

  while (index < json.length) {
    const char = json[index];

    if (escaped) {
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === "\"") {
      return index + 1;
    }

    index += 1;
  }

  return json.length;
}

function isObjectKey(json: string, stringEnd: number): boolean {
  let index = stringEnd;

  while (index < json.length && /\s/.test(json[index])) {
    index += 1;
  }

  return json[index] === ":";
}

function isNumberStart(json: string, index: number): boolean {
  const char = json[index];
  const previous = json[index - 1];

  if (!(char === "-" || isDigit(char))) return false;
  if (previous && /[A-Za-z0-9_.+-]/.test(previous)) return false;

  return true;
}

function isDigit(char: string | undefined): boolean {
  return Boolean(char && char >= "0" && char <= "9");
}

function readNumberEnd(json: string, start: number): number {
  const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(json.slice(start));
  return match ? start + match[0].length : start;
}

function isWordAt(json: string, index: number, word: string): boolean {
  if (json.slice(index, index + word.length) !== word) return false;

  const previous = json[index - 1];
  const next = json[index + word.length];
  const boundary = /[A-Za-z0-9_]/;

  return !boundary.test(previous ?? "") && !boundary.test(next ?? "");
}
