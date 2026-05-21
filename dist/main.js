"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __objRest = (source, exclude) => {
    var target = {};
    for (var prop in source)
      if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
        target[prop] = source[prop];
    if (source != null && __getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(source)) {
        if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
          target[prop] = source[prop];
      }
    return target;
  };

  // src/openapi.ts
  var METHODS = ["get", "post", "put", "delete"];
  function normalizeMethod(method) {
    const normalized = method.trim().toUpperCase();
    if (!METHODS.includes(normalized.toLowerCase())) {
      throw new Error(`Unsupported HTTP method "${method}".`);
    }
    return normalized;
  }
  function buildEndpointViewModel(spec, input) {
    const root = asObject(spec, "OpenAPI document");
    const pathItem = asOptionalObject(asObject(root.paths, "paths")[input.path]);
    if (!pathItem) {
      throw new Error(`Path "${input.path}" was not found in the OpenAPI document.`);
    }
    const methodKey = input.method.toLowerCase();
    const operation = asOptionalObject(pathItem[methodKey]);
    if (!operation) {
      throw new Error(`${input.method} is not defined for "${input.path}".`);
    }
    const request = extractRequestExample(root, pathItem, operation);
    const response = extractResponseExample(root, operation);
    return {
      swaggerUrl: input.swaggerUrl,
      method: input.method,
      path: input.path,
      operationId: asString(operation.operationId),
      tag: firstString(operation.tags),
      request,
      response
    };
  }
  function extractSwaggerActions(spec) {
    const root = asObject(spec, "OpenAPI document");
    const paths = asObject(root.paths, "paths");
    return Object.entries(paths).flatMap(([path, pathItem]) => {
      const operations = asOptionalObject(pathItem);
      if (!operations) return [];
      return METHODS.flatMap((methodKey) => {
        const operation = asOptionalObject(operations[methodKey]);
        if (!operation) return [];
        const method = normalizeMethod(methodKey);
        const operationId = asString(operation.operationId);
        const tag = firstString(operation.tags);
        const summary = asString(operation.summary);
        const description = asString(operation.description);
        const label = `${method} ${path}`;
        const searchIndex = [
          method,
          path,
          operationId,
          tag,
          summary,
          description
        ].filter(Boolean).join(" ").toLowerCase();
        return [{
          method,
          path,
          label,
          operationId,
          tag,
          summary,
          description,
          searchIndex
        }];
      });
    });
  }
  function extractRequestExample(root, pathItem, operation) {
    var _a, _b, _c, _d;
    const openApiBody = asOptionalObject(operation.requestBody);
    if (openApiBody) {
      const content = asOptionalObject(openApiBody.content);
      const chosen = chooseContent(content);
      if (!chosen) return void 0;
      const schema2 = asOptionalObject(chosen.media.schema);
      const example2 = (_a = chooseExplicitExample(chosen.media)) != null ? _a : schema2 ? exampleFromSchema(root, schema2) : {};
      return {
        name: "payload",
        required: openApiBody.required === true,
        typeLabel: schemaTypeLabel(root, schema2),
        contentType: chosen.contentType,
        example: example2,
        exampleJson: stringifyExample(example2)
      };
    }
    const parameters = [
      ...asArray(pathItem.parameters),
      ...asArray(operation.parameters)
    ].map(asOptionalObject).filter(Boolean);
    const bodyParameter = parameters.find((parameter) => parameter.in === "body");
    if (!bodyParameter) return void 0;
    const schema = asOptionalObject(bodyParameter.schema);
    const example = schema ? exampleFromSchema(root, schema) : {};
    const contentType = (_c = (_b = firstString(operation.consumes)) != null ? _b : firstString(root.consumes)) != null ? _c : "application/json";
    return {
      name: (_d = asString(bodyParameter.name)) != null ? _d : "payload",
      required: bodyParameter.required === true,
      typeLabel: schemaTypeLabel(root, schema),
      contentType,
      example,
      exampleJson: stringifyExample(example)
    };
  }
  function extractResponseExample(root, operation) {
    var _a, _b, _c, _d, _e;
    const responses = asObject(operation.responses, "responses");
    const code = responses["200"] ? "200" : Object.keys(responses).find((candidate) => candidate.startsWith("2"));
    if (!code) {
      throw new Error("No 200 or other 2xx response was found for this operation.");
    }
    const response = asObject(responses[code], `response ${code}`);
    const content = asOptionalObject(response.content);
    const chosen = chooseContent(content);
    if (chosen) {
      const schema2 = asOptionalObject(chosen.media.schema);
      const example2 = (_a = chooseExplicitExample(chosen.media)) != null ? _a : schema2 ? exampleFromSchema(root, schema2) : {};
      return {
        code,
        description: (_b = asString(response.description)) != null ? _b : "Success",
        contentType: chosen.contentType,
        example: example2,
        exampleJson: stringifyExample(example2)
      };
    }
    const schema = asOptionalObject(response.schema);
    const example = schema ? exampleFromSchema(root, schema) : {};
    const contentType = (_d = (_c = firstString(operation.produces)) != null ? _c : firstString(root.produces)) != null ? _d : "application/json";
    return {
      code,
      description: (_e = asString(response.description)) != null ? _e : "Success",
      contentType,
      example,
      exampleJson: stringifyExample(example)
    };
  }
  function exampleFromSchema(root, schema, depth = 0, seen = /* @__PURE__ */ new Set()) {
    var _a, _b;
    if (depth > 10) return {};
    const current = asOptionalObject(schema);
    if (!current) return null;
    const explicitExample = (_a = current.example) != null ? _a : current.default;
    if (explicitExample !== void 0) return explicitExample;
    if (Array.isArray(current.enum) && current.enum.length > 0) {
      return current.enum[0];
    }
    const ref = asString(current.$ref);
    if (ref) {
      if (seen.has(ref)) return {};
      seen.add(ref);
      const resolved = resolveRef(root, ref);
      return exampleFromSchema(root, __spreadValues(__spreadValues({}, asOptionalObject(resolved)), withoutRef(current)), depth + 1, seen);
    }
    const allOf = asArray(current.allOf).map(asOptionalObject).filter(Boolean);
    if (allOf.length > 0) {
      return allOf.reduce((merged, item) => {
        const next = exampleFromSchema(root, item, depth + 1, seen);
        return isPlainObject(next) ? __spreadValues(__spreadValues({}, merged), next) : merged;
      }, {});
    }
    const variant = (_b = firstSchema(current.oneOf)) != null ? _b : firstSchema(current.anyOf);
    if (variant) {
      return exampleFromSchema(root, variant, depth + 1, seen);
    }
    const type = normalizedType(current);
    if (type === "array") {
      return [exampleFromSchema(root, current.items, depth + 1, seen)];
    }
    if (type === "object" || current.properties) {
      const properties = asOptionalObject(current.properties);
      if (properties) {
        return Object.entries(properties).reduce((result, [propertyName, propertySchema]) => {
          result[propertyName] = exampleFromSchema(root, propertySchema, depth + 1, new Set(seen));
          return result;
        }, {});
      }
      const additionalProperties = asOptionalObject(current.additionalProperties);
      if (additionalProperties) {
        return {
          additionalProperty: exampleFromSchema(root, additionalProperties, depth + 1, seen)
        };
      }
      return {};
    }
    if (type === "integer" || type === "number") return 0;
    if (type === "boolean") return true;
    if (type === "string") return "string";
    return {};
  }
  function chooseContent(content) {
    var _a, _b;
    if (!content) return void 0;
    const preferred = ["application/json", "application/*+json", "text/json"];
    const contentType = (_b = (_a = preferred.find((candidate) => isPlainObject(content[candidate]))) != null ? _a : Object.keys(content).find((candidate) => candidate.includes("json") && isPlainObject(content[candidate]))) != null ? _b : Object.keys(content).find((candidate) => isPlainObject(content[candidate]));
    if (!contentType) return void 0;
    return {
      contentType,
      media: asObject(content[contentType], `content ${contentType}`)
    };
  }
  function chooseExplicitExample(media) {
    if (media.example !== void 0) return media.example;
    const examples = asOptionalObject(media.examples);
    if (!examples) return void 0;
    const firstExample = asOptionalObject(Object.values(examples)[0]);
    if (!firstExample) return void 0;
    return firstExample.value;
  }
  function schemaTypeLabel(root, schema) {
    var _a;
    if (!schema) return "object";
    const resolved = (_a = asOptionalObject(resolveMaybeRef(root, schema))) != null ? _a : schema;
    const type = normalizedType(resolved);
    if (type === "array") return "array";
    if (type) return type;
    if (resolved.properties) return "object";
    return "object";
  }
  function resolveMaybeRef(root, schema) {
    const ref = asString(schema.$ref);
    return ref ? resolveRef(root, ref) : schema;
  }
  function resolveRef(root, ref) {
    if (!ref.startsWith("#/")) {
      throw new Error(`Only internal $ref values are supported. Received "${ref}".`);
    }
    return ref.slice(2).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~")).reduce((current, part) => {
      if (!isPlainObject(current) && !Array.isArray(current)) {
        throw new Error(`Unable to resolve $ref "${ref}".`);
      }
      return current[part];
    }, root);
  }
  function normalizedType(schema) {
    const type = schema.type;
    if (Array.isArray(type)) {
      return type.find((entry) => typeof entry === "string" && entry !== "null");
    }
    return asString(type);
  }
  function withoutRef(schema) {
    const _a = schema, { $ref: _ref } = _a, rest = __objRest(_a, ["$ref"]);
    return rest;
  }
  function firstSchema(value) {
    return asArray(value).map(asOptionalObject).find(Boolean);
  }
  function stringifyExample(value) {
    return JSON.stringify(value, null, 2);
  }
  function firstString(value) {
    return asArray(value).find((item) => typeof item === "string");
  }
  function asString(value) {
    return typeof value === "string" ? value : void 0;
  }
  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }
  function asObject(value, label) {
    if (!isPlainObject(value)) {
      throw new Error(`Expected ${label} to be an object.`);
    }
    return value;
  }
  function asOptionalObject(value) {
    return isPlainObject(value) ? value : void 0;
  }
  function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  // src/jsonHighlight.ts
  function highlightJson(json) {
    const ranges = [];
    let index = 0;
    while (index < json.length) {
      const char = json[index];
      if (char === '"') {
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
  function readStringEnd(json, start) {
    let index = start + 1;
    let escaped = false;
    while (index < json.length) {
      const char = json[index];
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        return index + 1;
      }
      index += 1;
    }
    return json.length;
  }
  function isObjectKey(json, stringEnd) {
    let index = stringEnd;
    while (index < json.length && /\s/.test(json[index])) {
      index += 1;
    }
    return json[index] === ":";
  }
  function isNumberStart(json, index) {
    const char = json[index];
    const previous = json[index - 1];
    if (!(char === "-" || isDigit(char))) return false;
    if (previous && /[A-Za-z0-9_.+-]/.test(previous)) return false;
    return true;
  }
  function isDigit(char) {
    return Boolean(char && char >= "0" && char <= "9");
  }
  function readNumberEnd(json, start) {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(json.slice(start));
    return match ? start + match[0].length : start;
  }
  function isWordAt(json, index, word) {
    if (json.slice(index, index + word.length) !== word) return false;
    const previous = json[index - 1];
    const next = json[index + word.length];
    const boundary = /[A-Za-z0-9_]/;
    return !boundary.test(previous != null ? previous : "") && !boundary.test(next != null ? next : "");
  }

  // src/render.ts
  var COLORS = {
    borderGreen: rgb(0.12, 0.78, 0.46),
    methodGreen: rgb(0.29, 0.79, 0.54),
    paleGreen: rgb(0.91, 0.97, 0.94),
    paleGreenAlt: rgb(0.88, 0.95, 0.91),
    white: rgb(1, 1, 1),
    text: rgb(0.21, 0.23, 0.31),
    muted: rgb(0.48, 0.51, 0.55),
    divider: rgb(0.7, 0.74, 0.76),
    codeBackground: rgb(0.18, 0.18, 0.18),
    codeNumber: rgb(0.93, 0.38, 0.38),
    codeString: rgb(0.55, 1, 0.6),
    codeBoolean: rgb(1, 0.63, 0.36)
  };
  var FONT = { family: "Inter", style: "Regular" };
  var FONT_BOLD = { family: "Inter", style: "Bold" };
  var FONT_ITALIC = { family: "Inter", style: "Italic" };
  var FONT_MONO = { family: "Roboto Mono", style: "Regular" };
  var CARD_WIDTH = 760;
  var CODE_MIN_WIDTH = CARD_WIDTH - 12;
  var CODE_MAX_WIDTH = 1800;
  var CODE_FONT_SIZE = 14;
  var CODE_LINE_HEIGHT = 20;
  var CODE_HORIZONTAL_PADDING = 28;
  var CODE_VERTICAL_PADDING = 24;
  var CODE_CHAR_WIDTH = 8.1;
  var codeFont = FONT_MONO;
  async function renderEndpointCard(model, options = {}) {
    await loadFonts();
    const card = figma.createFrame();
    card.name = `OpenAPI Mini Viewer - ${model.method} ${model.path}`;
    card.layoutMode = "VERTICAL";
    card.primaryAxisSizingMode = "AUTO";
    card.counterAxisSizingMode = "FIXED";
    card.resize(CARD_WIDTH, 100);
    card.itemSpacing = 0;
    card.paddingTop = 0;
    card.paddingRight = 0;
    card.paddingBottom = 0;
    card.paddingLeft = 0;
    card.cornerRadius = 0;
    card.fills = [{ type: "SOLID", color: COLORS.white }];
    card.strokes = [{ type: "SOLID", color: COLORS.borderGreen }];
    card.strokeWeight = 2;
    if (model.tag) {
      card.appendChild(createTitle(model.tag));
    }
    card.appendChild(createHeader(model.method, model.path));
    card.appendChild(createCompactSectionTitle("Parameters"));
    card.appendChild(createRequestSection(model.request));
    card.appendChild(createCompactSectionTitle("Responses"));
    card.appendChild(createResponseSection(model));
    insertCard(card, options.replaceNode);
    figma.currentPage.selection = [card];
    figma.viewport.scrollAndZoomIntoView([card]);
    return card;
  }
  function createTitle(tag) {
    const title = figma.createFrame();
    title.name = "API Group";
    title.layoutMode = "HORIZONTAL";
    title.primaryAxisSizingMode = "FIXED";
    title.counterAxisSizingMode = "FIXED";
    title.resize(CARD_WIDTH, 60);
    title.paddingLeft = 10;
    title.paddingRight = 10;
    title.itemSpacing = 14;
    title.counterAxisAlignItems = "CENTER";
    title.fills = [{ type: "SOLID", color: COLORS.white }];
    const heading = createText(tag, 34, FONT_BOLD, COLORS.text);
    heading.name = "Tag";
    heading.textAutoResize = "WIDTH_AND_HEIGHT";
    title.appendChild(heading);
    return title;
  }
  function createHeader(method, path) {
    const header = figma.createFrame();
    header.name = "Endpoint";
    header.layoutMode = "HORIZONTAL";
    header.primaryAxisSizingMode = "FIXED";
    header.counterAxisSizingMode = "FIXED";
    header.resize(CARD_WIDTH, 56);
    header.itemSpacing = 16;
    header.paddingTop = 8;
    header.paddingRight = 10;
    header.paddingBottom = 8;
    header.paddingLeft = 4;
    header.counterAxisAlignItems = "CENTER";
    header.fills = [{ type: "SOLID", color: COLORS.paleGreen }];
    const methodBadge = figma.createFrame();
    methodBadge.name = "Method";
    methodBadge.layoutMode = "HORIZONTAL";
    methodBadge.primaryAxisSizingMode = "FIXED";
    methodBadge.counterAxisSizingMode = "FIXED";
    methodBadge.resize(118, 42);
    methodBadge.counterAxisAlignItems = "CENTER";
    methodBadge.primaryAxisAlignItems = "CENTER";
    methodBadge.cornerRadius = 4;
    methodBadge.fills = [{ type: "SOLID", color: methodColor(method) }];
    const methodText = createText(method, 20, FONT_BOLD, COLORS.white);
    methodText.textAutoResize = "WIDTH_AND_HEIGHT";
    methodBadge.appendChild(methodText);
    const pathText = createText(path, 27, FONT_BOLD, COLORS.text);
    pathText.name = "Path";
    pathText.textAutoResize = "HEIGHT";
    pathText.resize(CARD_WIDTH - 154, pathText.height);
    header.appendChild(methodBadge);
    header.appendChild(pathText);
    return header;
  }
  function createCompactSectionTitle(title) {
    const section = figma.createFrame();
    section.name = title;
    section.layoutMode = "VERTICAL";
    section.primaryAxisSizingMode = "AUTO";
    section.counterAxisSizingMode = "FIXED";
    section.resize(CARD_WIDTH, 34);
    section.paddingTop = 6;
    section.paddingRight = 6;
    section.paddingBottom = 4;
    section.paddingLeft = 6;
    section.fills = [{ type: "SOLID", color: COLORS.white }];
    const text = createText(title, 20, FONT_BOLD, COLORS.text);
    text.textAutoResize = "WIDTH_AND_HEIGHT";
    section.appendChild(text);
    return section;
  }
  function createRequestSection(request) {
    const section = createCompactBody("Parameters Body");
    if (!request) {
      section.appendChild(createEmptyState("No request body parameters."));
      return section;
    }
    section.appendChild(createCodeBlock(request.exampleJson));
    return section;
  }
  function createResponseSection(model) {
    const section = createCompactBody("Responses Body");
    section.appendChild(createCodeBlock(model.response.exampleJson));
    return section;
  }
  function createCompactBody(name) {
    const section = figma.createFrame();
    section.name = name;
    section.layoutMode = "VERTICAL";
    section.primaryAxisSizingMode = "AUTO";
    section.counterAxisSizingMode = "FIXED";
    section.resize(CARD_WIDTH, 100);
    section.itemSpacing = 6;
    section.paddingTop = 0;
    section.paddingRight = 6;
    section.paddingBottom = 6;
    section.paddingLeft = 6;
    section.fills = [{ type: "SOLID", color: COLORS.paleGreenAlt }];
    return section;
  }
  function createCodeBlock(json) {
    const width = codeBlockWidth(json);
    const height = codeBlockHeight(json);
    const code = figma.createFrame();
    code.name = "JSON Example";
    code.layoutMode = "VERTICAL";
    code.primaryAxisSizingMode = "AUTO";
    code.counterAxisSizingMode = "FIXED";
    code.resize(width, height);
    code.paddingTop = 12;
    code.paddingRight = 14;
    code.paddingBottom = 12;
    code.paddingLeft = 14;
    code.cornerRadius = 4;
    code.fills = [{ type: "SOLID", color: COLORS.codeBackground }];
    const text = createText(json, CODE_FONT_SIZE, codeFont, COLORS.white);
    text.name = "JSON";
    text.lineHeight = { unit: "PIXELS", value: CODE_LINE_HEIGHT };
    text.textAutoResize = "HEIGHT";
    text.resize(width - CODE_HORIZONTAL_PADDING, text.height);
    applyJsonHighlighting(text, json);
    code.appendChild(text);
    return code;
  }
  function createEmptyState(message) {
    const text = createText(message, 15, FONT, COLORS.muted);
    text.textAutoResize = "WIDTH_AND_HEIGHT";
    return text;
  }
  function createText(characters, size, fontName, color) {
    const text = figma.createText();
    text.fontName = fontName;
    text.fontSize = size;
    text.characters = characters;
    text.fills = [{ type: "SOLID", color }];
    return text;
  }
  function methodColor(method) {
    if (method === "GET") return rgb(0.38, 0.65, 0.98);
    if (method === "DELETE") return rgb(0.95, 0.38, 0.34);
    if (method === "PUT") return rgb(0.96, 0.66, 0.25);
    return COLORS.methodGreen;
  }
  async function loadFonts() {
    await Promise.all([
      figma.loadFontAsync(FONT),
      figma.loadFontAsync(FONT_BOLD),
      figma.loadFontAsync(FONT_ITALIC)
    ]);
    try {
      await figma.loadFontAsync(FONT_MONO);
      codeFont = FONT_MONO;
    } catch (e) {
      codeFont = FONT;
    }
  }
  function insertCard(card, replaceNode) {
    if (replaceNode == null ? void 0 : replaceNode.parent) {
      const parent = replaceNode.parent;
      const index = parent.children.indexOf(replaceNode);
      card.x = replaceNode.x;
      card.y = replaceNode.y;
      parent.insertChild(index, card);
      replaceNode.remove();
      return;
    }
    positionCard(card);
    figma.currentPage.appendChild(card);
  }
  function positionCard(card) {
    const selection = figma.currentPage.selection[0];
    if (selection) {
      card.x = selection.x + selection.width + 40;
      card.y = selection.y;
      return;
    }
    const center = figma.viewport.center;
    card.x = center.x - 280;
    card.y = center.y - 260;
  }
  function rgb(r, g, b) {
    return { r, g, b };
  }
  function codeBlockWidth(json) {
    const longestLine = json.split("\n").reduce((longest, line) => Math.max(longest, line.length), 0);
    const estimatedWidth = Math.ceil(longestLine * CODE_CHAR_WIDTH + CODE_HORIZONTAL_PADDING);
    return Math.min(Math.max(CODE_MIN_WIDTH, estimatedWidth), CODE_MAX_WIDTH);
  }
  function codeBlockHeight(json) {
    const lineCount = Math.max(1, json.split("\n").length);
    return lineCount * CODE_LINE_HEIGHT + CODE_VERTICAL_PADDING;
  }
  function applyJsonHighlighting(text, json) {
    for (const range of highlightJson(json)) {
      text.setRangeFills(range.start, range.end, [{
        type: "SOLID",
        color: codeTokenColor(range.kind)
      }]);
    }
  }
  function codeTokenColor(kind) {
    if (kind === "number") return COLORS.codeNumber;
    if (kind === "boolean") return COLORS.codeBoolean;
    return COLORS.codeString;
  }

  // src/main.ts
  var CONFIG_KEY = "openapi-mini-viewer-config";
  var cachedSpec;
  var cachedSpecUrl = "";
  if (figma.command === "refresh") {
    refreshFromRelaunch();
  } else {
    setupUi();
  }
  function setupUi() {
    figma.showUI(__html__, { width: 380, height: 398, themeColors: true });
    postInitialStateFromVariables();
    figma.on("selectionchange", postSelectionState);
    figma.ui.onmessage = async (message) => {
      const payload = parseMessage(message);
      if (!payload) return;
      if (payload.type === "cancel") {
        figma.closePlugin();
        return;
      }
      try {
        if (payload.type === "loadSpec") {
          const actions = await loadSpecActions(payload.swaggerUrl);
          figma.ui.postMessage({ type: "actions", swaggerUrl: payload.swaggerUrl, actions });
          return;
        }
        const input = payload.type === "refresh" ? readSelectedConfig() : payload;
        if (!input) {
          throw new Error("Select an OpenAPI Mini Viewer frame before refreshing.");
        }
        const replaceNode = payload.type === "refresh" ? selectedEndpointFrame() : void 0;
        const action = payload.type === "refresh" ? "Refreshed" : "Generated";
        const card = await generateCard(input, { replaceNode });
        figma.ui.postMessage({ type: "done", layerName: card.name, action });
        figma.notify(`${action} ${input.method} ${input.path}`);
      } catch (error) {
        const message2 = error instanceof Error ? error.message : "Something went wrong.";
        figma.ui.postMessage({ type: "error", message: message2 });
        figma.notify(message2, { error: true });
      }
    };
  }
  function parseMessage(message) {
    if (typeof message !== "object" || message === null) return void 0;
    const candidate = message;
    if (candidate.type === "cancel") return { type: "cancel" };
    if (candidate.type === "refresh") return { type: "refresh" };
    if (candidate.type === "loadSpec" && typeof candidate.swaggerUrl === "string") {
      return {
        type: "loadSpec",
        swaggerUrl: candidate.swaggerUrl
      };
    }
    if (candidate.type !== "generate") return void 0;
    if (typeof candidate.swaggerUrl !== "string") return void 0;
    if (typeof candidate.path !== "string") return void 0;
    if (typeof candidate.method !== "string") return void 0;
    return {
      type: "generate",
      swaggerUrl: candidate.swaggerUrl,
      path: candidate.path,
      method: normalizeMethod(candidate.method)
    };
  }
  async function generateCard(input, options = {}) {
    const spec = await fetchSpec(input.swaggerUrl);
    const model = buildEndpointViewModel(spec, {
      swaggerUrl: input.swaggerUrl,
      path: input.path,
      method: normalizeMethod(input.method)
    });
    await figma.currentPage.loadAsync();
    const card = await renderEndpointCard(model, options);
    card.setPluginData(CONFIG_KEY, JSON.stringify(input));
    card.setRelaunchData({ refresh: "Refresh from Swagger/OpenAPI" });
    return card;
  }
  async function loadSpecActions(swaggerUrl) {
    const spec = await fetchSpec(swaggerUrl);
    return extractSwaggerActions(spec);
  }
  async function fetchSpec(swaggerUrl) {
    if (cachedSpec && cachedSpecUrl === swaggerUrl) {
      return cachedSpec;
    }
    const response = await fetch(swaggerUrl);
    if (!response.ok) {
      throw new Error(`Unable to fetch OpenAPI document: ${response.status} ${response.statusText}`);
    }
    cachedSpec = await response.json();
    cachedSpecUrl = swaggerUrl;
    return cachedSpec;
  }
  function selectedEndpointFrame() {
    const selected = figma.currentPage.selection[0];
    if ((selected == null ? void 0 : selected.type) !== "FRAME") return void 0;
    return selected.getPluginData(CONFIG_KEY) ? selected : void 0;
  }
  function readSelectedConfig() {
    const frame = selectedEndpointFrame();
    if (!frame) return void 0;
    try {
      const parsed = JSON.parse(frame.getPluginData(CONFIG_KEY));
      if (typeof parsed.swaggerUrl !== "string") return void 0;
      if (typeof parsed.path !== "string") return void 0;
      if (typeof parsed.method !== "string") return void 0;
      return {
        swaggerUrl: parsed.swaggerUrl,
        path: parsed.path,
        method: normalizeMethod(parsed.method)
      };
    } catch (e) {
      return void 0;
    }
  }
  function postSelectionState() {
    const config = readSelectedConfig();
    figma.ui.postMessage({
      type: "selection",
      canRefresh: Boolean(config),
      config
    });
  }
  async function postInitialStateFromVariables() {
    const config = await readVariableConfig();
    if (config.swaggerUrl || config.method || config.path) {
      figma.ui.postMessage({
        type: "variables",
        config
      });
    }
    postSelectionState();
  }
  async function readVariableConfig() {
    const variables = await figma.variables.getLocalVariablesAsync("STRING");
    const swaggerUrl = variableStringValue(variables, "SwaggerUrl");
    const methodValue = variableStringValue(variables, "ApiAction");
    const path = variableStringValue(variables, "ApiPath");
    let method;
    if (methodValue) {
      try {
        method = normalizeMethod(methodValue);
      } catch (e) {
        method = void 0;
      }
    }
    return {
      swaggerUrl,
      method,
      path
    };
  }
  function variableStringValue(variables, name) {
    const variable = variables.find((candidate) => candidate.name === name || candidate.name.endsWith(`/${name}`));
    if (!variable) return void 0;
    const firstValue = Object.values(variable.valuesByMode).find((value) => typeof value === "string");
    return (firstValue == null ? void 0 : firstValue.trim()) || void 0;
  }
  async function refreshFromRelaunch() {
    try {
      const input = readSelectedConfig();
      const replaceNode = selectedEndpointFrame();
      if (!input || !replaceNode) {
        throw new Error("Select an OpenAPI Mini Viewer frame before refreshing.");
      }
      await generateCard(input, { replaceNode });
      figma.closePlugin(`Refreshed ${input.method} ${input.path}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to refresh OpenAPI card.";
      figma.closePlugin(message);
    }
  }
})();
