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

  // src/widgetJson.ts
  function jsonToLines(json) {
    const ranges = highlightJson(json);
    const chunks = [];
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
  function splitChunksByLine(chunks) {
    const lines = [[]];
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

  // src/widget.tsx
  var { widget } = figma;
  var { AutoLayout, Text, Span, useEffect, usePropertyMenu, useSyncedState, useWidgetNodeId, waitForTask } = widget;
  var DEFAULT_SWAGGER_URL = "https://api.upkeepday.com/swagger.json";
  var LAST_CONFIG_STORAGE_KEY = "openapi-mini-viewer:last-config";
  var CARD_WIDTH = 760;
  var CODE_MIN_WIDTH = CARD_WIDTH - 12;
  var CODE_MAX_WIDTH = 1800;
  var CODE_FONT_SIZE = 14;
  var CODE_LINE_HEIGHT = 20;
  var CODE_HORIZONTAL_PADDING = 28;
  var CODE_VERTICAL_PADDING = 24;
  var CODE_CHAR_WIDTH = 8.1;
  var COLORS = {
    borderGreen: "#1ec775",
    methodGreen: "#4ac987",
    paleGreen: "#e8f7ef",
    paleGreenAlt: "#e1f2e9",
    white: "#ffffff",
    text: "#353a4b",
    muted: "#747b87",
    divider: "#b3bbc2",
    codeBackground: "#2e2e2e",
    codeNumber: "#ed6161",
    codeString: "#8cff99",
    codeBoolean: "#ffa15c",
    blue: "#62a6fa",
    orange: "#f5a83f",
    red: "#f26057"
  };
  var cachedSpecUrl = "";
  var cachedSpec;
  function OpenApiMiniViewerWidget() {
    var _a, _b;
    const widgetNodeId = useWidgetNodeId();
    const [swaggerUrl, setSwaggerUrl] = useSyncedState("swaggerUrl", DEFAULT_SWAGGER_URL);
    const [method, setMethod] = useSyncedState("method", "");
    const [path, setPath] = useSyncedState("path", "");
    const [model, setModel] = useSyncedState("model", null);
    const [error, setError] = useSyncedState("error", "");
    const [loadingMessage, setLoadingMessage] = useSyncedState("loadingMessage", "");
    const [initialized, setInitialized] = useSyncedState("initialized", false);
    const [lastUpdatedAt, setLastUpdatedAt] = useSyncedState("lastUpdatedAt", "");
    const config = { swaggerUrl, method, path };
    useEffect(() => {
      if (initialized) return;
      waitForTask((async () => {
        var _a2, _b2, _c;
        const savedSwaggerUrl = await readSavedSwaggerUrl();
        const variableConfig = await readVariableConfig();
        const nextConfig = {
          swaggerUrl: (_a2 = savedSwaggerUrl != null ? savedSwaggerUrl : variableConfig.swaggerUrl) != null ? _a2 : swaggerUrl,
          method: (_b2 = variableConfig.method) != null ? _b2 : "",
          path: (_c = variableConfig.path) != null ? _c : ""
        };
        setSwaggerUrl(nextConfig.swaggerUrl);
        setMethod(nextConfig.method);
        setPath(nextConfig.path);
        setInitialized(true);
        openConfigure(nextConfig, Boolean(model));
      })());
    });
    usePropertyMenu([
      { itemType: "action", propertyName: "configure", tooltip: "Configure" },
      { itemType: "action", propertyName: "refresh", tooltip: "Refresh" }
    ], ({ propertyName }) => {
      if (propertyName === "configure") {
        openConfigure(config, Boolean(model));
      }
      if (propertyName === "refresh") {
        waitForTask(refreshConfig(config));
      }
    });
    async function handleLoadSpec(nextSwaggerUrl) {
      setLoadingMessage("Loading Swagger actions...");
      try {
        const actions = await loadSpecActions(nextSwaggerUrl);
        postUiMessage({ type: "actions", swaggerUrl: nextSwaggerUrl, actions });
      } catch (loadError) {
        postError(loadError);
      } finally {
        setLoadingMessage("");
      }
    }
    async function applyConfigAndRender(nextConfig) {
      setSwaggerUrl(nextConfig.swaggerUrl);
      setMethod(nextConfig.method);
      setPath(nextConfig.path);
      try {
        await renderEndpoint(requireRenderableConfig(nextConfig));
      } catch (renderError) {
        postError(renderError);
      }
    }
    async function refreshConfig(nextConfig) {
      try {
        await renderEndpoint(requireRenderableConfig(nextConfig), true);
      } catch (refreshError) {
        postError(refreshError);
      }
    }
    async function renderEndpoint(nextConfig, forceFetch = false) {
      setLoadingMessage(forceFetch ? "Refreshing endpoint..." : "Rendering endpoint...");
      try {
        setError("");
        const nextModel = await loadEndpoint(nextConfig, forceFetch);
        setModel(nextModel);
        await renameWidget(widgetNodeId, endpointCanvasName(nextModel));
        setLastUpdatedAt((/* @__PURE__ */ new Date()).toISOString());
        await saveSwaggerUrl(nextConfig.swaggerUrl);
        postUiMessage({ type: "done", layerName: `${nextModel.method} ${nextModel.path}`, action: forceFetch ? "Refreshed" : "Rendered" });
      } catch (refreshError) {
        postError(refreshError);
      } finally {
        setLoadingMessage("");
      }
    }
    function postError(rawError) {
      const message = rawError instanceof Error ? rawError.message : "Something went wrong.";
      setError(message);
      postUiMessage({ type: "error", message });
    }
    function postUiMessage(message) {
      try {
        figma.ui.postMessage(message);
      } catch (e) {
      }
    }
    return /* @__PURE__ */ figma.widget.h(
      AutoLayout,
      {
        name: model ? endpointCanvasName(model) : "OpenAPI Mini Viewer Widget",
        direction: "vertical",
        width: CARD_WIDTH,
        padding: 0,
        spacing: 0,
        fill: COLORS.white,
        stroke: COLORS.borderGreen,
        strokeWidth: 2,
        overflow: "visible"
      },
      (model == null ? void 0 : model.tag) ? /* @__PURE__ */ figma.widget.h(Title, { tag: model.tag }) : null,
      /* @__PURE__ */ figma.widget.h(Header, { method: (_a = model == null ? void 0 : model.method) != null ? _a : method, path: (_b = model == null ? void 0 : model.path) != null ? _b : path }),
      loadingMessage ? /* @__PURE__ */ figma.widget.h(StatusMessage, { message: loadingMessage, tone: "muted" }) : null,
      error ? /* @__PURE__ */ figma.widget.h(StatusMessage, { message: error, tone: "error" }) : null,
      !model ? /* @__PURE__ */ figma.widget.h(StatusMessage, { message: "Configure or refresh to render an OpenAPI endpoint.", tone: "muted" }) : null,
      model ? /* @__PURE__ */ figma.widget.h(figma.widget.Fragment, null, /* @__PURE__ */ figma.widget.h(SectionTitle, { title: "Parameters" }), /* @__PURE__ */ figma.widget.h(SectionBody, null, model.request ? /* @__PURE__ */ figma.widget.h(CodeBlock, { json: model.request.exampleJson }) : /* @__PURE__ */ figma.widget.h(MutedText, null, "No request body parameters.")), /* @__PURE__ */ figma.widget.h(SectionTitle, { title: "Responses" }), /* @__PURE__ */ figma.widget.h(SectionBody, null, /* @__PURE__ */ figma.widget.h(CodeBlock, { json: model.response.exampleJson }))) : null,
      /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 8, padding: { top: 8, right: 8, bottom: 8, left: 8 }, fill: COLORS.white, width: CARD_WIDTH, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(ActionButton, { label: "Configure", onClick: () => openConfigure(config, Boolean(model)) }), /* @__PURE__ */ figma.widget.h(ActionButton, { label: "Refresh", onClick: () => waitForTask(refreshConfig(config)) }), lastUpdatedAt ? /* @__PURE__ */ figma.widget.h(Text, { fontSize: 10, fill: COLORS.text }, "Updated ", formatUpdatedAt(lastUpdatedAt)) : null)
    );
    function openConfigure(currentConfig, canRefresh) {
      waitForTask(new Promise((resolve) => {
        let isClosed = false;
        let sessionConfig = currentConfig;
        const closeSession = () => {
          if (isClosed) return;
          isClosed = true;
          resolve();
        };
        figma.ui.onmessage = (message) => {
          let payload;
          try {
            payload = parseMessage(message);
          } catch (messageError) {
            postError(messageError);
            return;
          }
          if (!payload) return;
          if (payload.type === "cancel") {
            figma.ui.hide();
            closeSession();
            return;
          }
          if (payload.type === "loadSpec") {
            waitForTask(handleLoadSpec(payload.swaggerUrl));
            return;
          }
          if (payload.type === "refresh") {
            waitForTask(refreshConfig(sessionConfig));
            return;
          }
          sessionConfig = {
            swaggerUrl: payload.swaggerUrl,
            method: normalizeMethod(payload.method),
            path: payload.path
          };
          waitForTask(applyConfigAndRender(sessionConfig));
        };
        figma.showUI(__html__, { width: 380, height: 398, themeColors: true });
        figma.ui.postMessage({
          type: "selection",
          canRefresh,
          config: currentConfig
        });
      }));
    }
  }
  function Title({ tag }) {
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: CARD_WIDTH, height: 60, padding: { left: 10, right: 10 }, verticalAlignItems: "center", fill: COLORS.white }, /* @__PURE__ */ figma.widget.h(Text, { fontSize: 34, fontWeight: "bold", fill: COLORS.text }, tag));
  }
  function Header({ method, path }) {
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: CARD_WIDTH, height: 56, direction: "horizontal", spacing: 16, padding: { top: 8, right: 10, bottom: 8, left: 4 }, verticalAlignItems: "center", fill: COLORS.paleGreen }, /* @__PURE__ */ figma.widget.h(AutoLayout, { width: 118, height: 42, horizontalAlignItems: "center", verticalAlignItems: "center", cornerRadius: 4, fill: methodColor(method) }, /* @__PURE__ */ figma.widget.h(Text, { fontSize: 20, fontWeight: "bold", fill: COLORS.white }, method)), /* @__PURE__ */ figma.widget.h(Text, { width: CARD_WIDTH - 154, fontSize: 27, fontWeight: "bold", fill: COLORS.text }, path));
  }
  function SectionTitle({ title }) {
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: CARD_WIDTH, padding: { top: 6, right: 6, bottom: 4, left: 6 }, fill: COLORS.white }, /* @__PURE__ */ figma.widget.h(Text, { fontSize: 20, fontWeight: "bold", fill: COLORS.text }, title));
  }
  function SectionBody({ children }) {
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: CARD_WIDTH, direction: "vertical", padding: { right: 6, bottom: 6, left: 6 }, spacing: 6, fill: COLORS.paleGreenAlt, overflow: "visible" }, children);
  }
  function CodeBlock({ json }) {
    const width = codeBlockWidth(json);
    const height = codeBlockHeight(json);
    const lines = jsonToLines(json);
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { width, height, direction: "vertical", padding: { top: 12, right: 14, bottom: 12, left: 14 }, fill: COLORS.codeBackground, cornerRadius: 4, spacing: 0 }, lines.map((line, index) => /* @__PURE__ */ figma.widget.h(Text, { key: index, width: width - CODE_HORIZONTAL_PADDING, height: CODE_LINE_HEIGHT, fontFamily: "Roboto Mono", fontSize: CODE_FONT_SIZE, lineHeight: CODE_LINE_HEIGHT, fill: COLORS.white }, line.length > 0 ? line.map((chunk, chunkIndex) => /* @__PURE__ */ figma.widget.h(Span, { key: chunkIndex, fill: chunkColor(chunk) }, chunk.text)) : " ")));
  }
  function ActionButton({ label, onClick }) {
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { height: 30, padding: { left: 12, right: 12 }, cornerRadius: 4, fill: COLORS.paleGreen, stroke: COLORS.borderGreen, strokeWidth: 1, verticalAlignItems: "center", horizontalAlignItems: "center", onClick }, /* @__PURE__ */ figma.widget.h(Text, { fontSize: 12, fontWeight: "bold", fill: COLORS.text }, label));
  }
  function StatusMessage({ message, tone }) {
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: CARD_WIDTH, padding: { top: 8, right: 8, bottom: 8, left: 8 }, fill: tone === "error" ? "#fff0ef" : COLORS.white }, /* @__PURE__ */ figma.widget.h(Text, { fontSize: 12, fill: tone === "error" ? COLORS.red : COLORS.muted }, message));
  }
  function MutedText({ children }) {
    return /* @__PURE__ */ figma.widget.h(Text, { fontSize: 15, fill: COLORS.muted }, children);
  }
  function methodColor(method) {
    if (method === "GET") return COLORS.blue;
    if (method === "DELETE") return COLORS.red;
    if (method === "PUT") return COLORS.orange;
    return COLORS.methodGreen;
  }
  function chunkColor(chunk) {
    if (chunk.kind === "number") return COLORS.codeNumber;
    if (chunk.kind === "boolean") return COLORS.codeBoolean;
    if (chunk.kind === "string") return COLORS.codeString;
    return COLORS.white;
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
  async function loadEndpoint(input, forceFetch = false) {
    const spec = await fetchSpec(input.swaggerUrl, forceFetch);
    return buildEndpointViewModel(spec, input);
  }
  async function loadSpecActions(swaggerUrl) {
    const spec = await fetchSpec(swaggerUrl, true);
    return extractSwaggerActions(spec);
  }
  async function renameWidget(widgetNodeId, name) {
    const node = await figma.getNodeByIdAsync(widgetNodeId);
    if ((node == null ? void 0 : node.type) === "WIDGET") {
      node.name = name;
    }
  }
  function endpointCanvasName(endpoint) {
    return `${endpoint.method} ${endpoint.path} (${swaggerUrlName(endpoint.swaggerUrl)})`;
  }
  function swaggerUrlName(swaggerUrl) {
    return swaggerUrl.replace(/^https?:\/\//i, "");
  }
  async function fetchSpec(swaggerUrl, forceFetch = false) {
    if (!forceFetch && cachedSpecUrl === swaggerUrl && cachedSpec !== void 0) {
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
  function parseMessage(message) {
    if (typeof message !== "object" || message === null) return void 0;
    const candidate = message;
    if (candidate.type === "cancel") return { type: "cancel" };
    if (candidate.type === "refresh") return { type: "refresh" };
    if (candidate.type === "loadSpec" && typeof candidate.swaggerUrl === "string") {
      return { type: "loadSpec", swaggerUrl: candidate.swaggerUrl };
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
    return { swaggerUrl, method, path };
  }
  async function readSavedSwaggerUrl() {
    const savedValue = await figma.clientStorage.getAsync(LAST_CONFIG_STORAGE_KEY);
    const savedSwaggerUrl = savedSwaggerUrlFromStorage(savedValue);
    return (savedSwaggerUrl == null ? void 0 : savedSwaggerUrl.trim()) || void 0;
  }
  async function saveSwaggerUrl(swaggerUrl) {
    await figma.clientStorage.setAsync(LAST_CONFIG_STORAGE_KEY, swaggerUrl);
  }
  function savedSwaggerUrlFromStorage(value) {
    if (typeof value === "string") return value;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
    const candidate = value;
    return typeof candidate.swaggerUrl === "string" ? candidate.swaggerUrl : void 0;
  }
  function requireRenderableConfig(config) {
    if (!config.method) {
      throw new Error("Select a method before generating.");
    }
    if (!config.path.trim()) {
      throw new Error("Enter a path before generating.");
    }
    return {
      swaggerUrl: config.swaggerUrl,
      method: config.method,
      path: config.path
    };
  }
  function variableStringValue(variables, name) {
    const variable = variables.find((candidate) => candidate.name === name || candidate.name.endsWith(`/${name}`));
    if (!variable) return void 0;
    const firstValue = Object.values(variable.valuesByMode).find((value) => typeof value === "string");
    return (firstValue == null ? void 0 : firstValue.trim()) || void 0;
  }
  function formatUpdatedAt(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const hours = date.getHours();
    const displayHours = hours % 12 || 12;
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const period = hours >= 12 ? "PM" : "AM";
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    return `${String(displayHours).padStart(2, "0")}:${minutes}${period} ${month}/${day}/${year}`;
  }
  widget.register(OpenApiMiniViewerWidget);
})();
