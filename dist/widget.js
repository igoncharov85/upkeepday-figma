"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
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
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
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
  var METHODS = ["get", "post", "put", "delete", "patch", "options", "head", "trace"];
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
    const responses = extractResponseExamples(root, operation, input.responseCodes);
    return {
      swaggerUrl: input.swaggerUrl,
      method: input.method,
      path: input.path,
      operationId: asString(operation.operationId),
      tag: firstString(operation.tags),
      description: asString(operation.description),
      request,
      responses,
      response: responses[0]
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
        const responseCodes = extractResponseCodes(operation);
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
          responseCodes,
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
  function extractResponseCodes(operation) {
    const responses = asOptionalObject(operation.responses);
    return responses ? sortedResponseCodes(Object.keys(responses)) : [];
  }
  function extractResponseExamples(root, operation, selectedCodes) {
    const responses = asObject(operation.responses, "responses");
    const codes = chooseResponseCodes(responses, selectedCodes);
    return codes.map((code) => extractResponseExample(root, operation, responses, code));
  }
  function chooseResponseCodes(responses, selectedCodes) {
    const availableCodes = sortedResponseCodes(Object.keys(responses));
    if (availableCodes.length === 0) {
      throw new Error("No responses were found for this operation.");
    }
    const requestedCodes = (selectedCodes != null ? selectedCodes : []).map((code) => code.trim()).filter(Boolean);
    if (requestedCodes.length > 0) {
      const missingCode = requestedCodes.find((code) => !Object.prototype.hasOwnProperty.call(responses, code));
      if (missingCode) {
        throw new Error(`Response code "${missingCode}" was not found for this operation.`);
      }
      return requestedCodes;
    }
    if (availableCodes.length === 1) {
      return availableCodes;
    }
    return [availableCodes.includes("200") ? "200" : availableCodes[0]];
  }
  function extractResponseExample(root, operation, responses, code) {
    var _a, _b, _c, _d, _e;
    const responseObject = asObject(responses[code], `response ${code}`);
    const response = asObject(resolveMaybeRef(root, responseObject), `response ${code}`);
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
  function sortedResponseCodes(codes) {
    return [...codes].sort((left, right) => {
      const leftIsNumeric = /^\d+$/.test(left);
      const rightIsNumeric = /^\d+$/.test(right);
      if (leftIsNumeric && rightIsNumeric) return Number(left) - Number(right);
      if (leftIsNumeric) return -1;
      if (rightIsNumeric) return 1;
      return left.localeCompare(right);
    });
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

  // assets/upkeepday-widget-icon.png
  var upkeepday_widget_icon_default = "data:image/png;base64,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";

  // src/widget.tsx
  var { widget } = figma;
  var { AutoLayout, Image, Text, Span, useEffect, usePropertyMenu, useSyncedState, useWidgetNodeId, waitForTask } = widget;
  var DEFAULT_SWAGGER_URL = "https://petstore3.swagger.io/api/v3/openapi.json";
  var LAST_CONFIG_STORAGE_KEY = "openapi-mini-viewer:last-config";
  var CODE_MAX_WIDTH = 1800;
  var RESPONSE_CODE_LABEL_WIDTH = 58;
  var RESPONSE_ROW_GAP = 8;
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
  var WIDTH_OPTIONS = [
    { option: "compact", label: "Compact" },
    { option: "standard", label: "Standard" },
    { option: "wide", label: "Wide" }
  ];
  var cachedSpecUrl = "";
  var cachedSpec;
  function OpenApiMiniViewerWidget() {
    var _a, _b, _c;
    const widgetNodeId = useWidgetNodeId();
    const [swaggerUrl, setSwaggerUrl] = useSyncedState("swaggerUrl", DEFAULT_SWAGGER_URL);
    const [method, setMethod] = useSyncedState("method", "");
    const [path, setPath] = useSyncedState("path", "");
    const [responseCodes, setResponseCodes] = useSyncedState("responseCodes", []);
    const [model, setModel] = useSyncedState("model", null);
    const [error, setError] = useSyncedState("error", "");
    const [loadingMessage, setLoadingMessage] = useSyncedState("loadingMessage", "");
    const [initialized, setInitialized] = useSyncedState("initialized", false);
    const [lastUpdatedAt, setLastUpdatedAt] = useSyncedState("lastUpdatedAt", "");
    const [widthMode, setWidthMode] = useSyncedState("widthMode", "standard");
    const config = { swaggerUrl, method, path, responseCodes };
    const displayedResponses = (_a = model == null ? void 0 : model.responses) != null ? _a : (model == null ? void 0 : model.response) ? [model.response] : [];
    const cardWidth = cardWidthForMode(widthMode);
    const codeMaxWidth = cardWidth - 12;
    const responseCodeMaxWidth = codeMaxWidth - RESPONSE_CODE_LABEL_WIDTH - RESPONSE_ROW_GAP;
    useEffect(() => {
      if (initialized) return;
      waitForTask((async () => {
        var _a2, _b2, _c2;
        const savedSwaggerUrl = await readSavedSwaggerUrl();
        const variableConfig = await readVariableConfig();
        const nextConfig = {
          swaggerUrl: (_a2 = savedSwaggerUrl != null ? savedSwaggerUrl : variableConfig.swaggerUrl) != null ? _a2 : swaggerUrl,
          method: (_b2 = variableConfig.method) != null ? _b2 : "",
          path: (_c2 = variableConfig.path) != null ? _c2 : "",
          responseCodes: []
        };
        setSwaggerUrl(nextConfig.swaggerUrl);
        setMethod(nextConfig.method);
        setPath(nextConfig.path);
        setResponseCodes(nextConfig.responseCodes);
        setInitialized(true);
        openConfigure(nextConfig, Boolean(model));
      })());
    });
    usePropertyMenu([
      { itemType: "action", propertyName: "configure", tooltip: "Configure" },
      { itemType: "action", propertyName: "refresh", tooltip: "Refresh" },
      {
        itemType: "dropdown",
        propertyName: "widthMode",
        tooltip: "Width",
        options: WIDTH_OPTIONS,
        selectedOption: widthMode
      }
    ], ({ propertyName, propertyValue }) => {
      if (propertyName === "configure") {
        openConfigure(config, Boolean(model));
      }
      if (propertyName === "refresh") {
        waitForTask(refreshConfig(config));
      }
      if (propertyName === "widthMode" && isWidthMode(propertyValue)) {
        setWidthMode(propertyValue);
      }
    });
    async function handleLoadSpec(nextSwaggerUrl) {
      try {
        const actions = await loadSpecActions(nextSwaggerUrl);
        postUiMessage({ type: "actions", swaggerUrl: nextSwaggerUrl, actions });
      } catch (loadError) {
        postUiMessage({ type: "error", message: errorMessage(loadError) });
      }
    }
    async function applyConfigAndRender(nextConfig) {
      setSwaggerUrl(nextConfig.swaggerUrl);
      setMethod(nextConfig.method);
      setPath(nextConfig.path);
      setResponseCodes(nextConfig.responseCodes);
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
      const message = errorMessage(rawError);
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
        width: cardWidth,
        padding: 0,
        spacing: 0,
        fill: COLORS.white,
        stroke: COLORS.borderGreen,
        strokeWidth: 2,
        overflow: "visible"
      },
      (model == null ? void 0 : model.tag) ? /* @__PURE__ */ figma.widget.h(Title, { tag: model.tag, cardWidth }) : null,
      /* @__PURE__ */ figma.widget.h(Header, { method: (_b = model == null ? void 0 : model.method) != null ? _b : method, path: (_c = model == null ? void 0 : model.path) != null ? _c : path, cardWidth, widthMode }),
      (model == null ? void 0 : model.description) ? /* @__PURE__ */ figma.widget.h(EndpointDescription, { description: model.description, cardWidth }) : null,
      loadingMessage ? /* @__PURE__ */ figma.widget.h(StatusMessage, { message: loadingMessage, tone: "muted", cardWidth }) : null,
      error ? /* @__PURE__ */ figma.widget.h(StatusMessage, { message: error, tone: "error", cardWidth }) : null,
      !model ? /* @__PURE__ */ figma.widget.h(StatusMessage, { message: "Configure or refresh to render an OpenAPI endpoint.", tone: "muted", cardWidth }) : null,
      model ? /* @__PURE__ */ figma.widget.h(figma.widget.Fragment, null, /* @__PURE__ */ figma.widget.h(SectionTitle, { title: "Parameters", cardWidth }), /* @__PURE__ */ figma.widget.h(SectionBody, { cardWidth }, model.request ? /* @__PURE__ */ figma.widget.h(CodeBlock, { json: model.request.exampleJson, minWidth: codeMaxWidth, maxWidth: codeMaxWidth }) : /* @__PURE__ */ figma.widget.h(MutedText, null, "No request body parameters.")), /* @__PURE__ */ figma.widget.h(SectionTitle, { title: "Responses", cardWidth }), /* @__PURE__ */ figma.widget.h(SectionBody, { cardWidth }, /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "vertical", spacing: 8, overflow: "visible" }, displayedResponses.map((response) => /* @__PURE__ */ figma.widget.h(ResponseItem, { key: response.code, response, codeMaxWidth: responseCodeMaxWidth }))))) : null,
      /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: 6, padding: { top: 6, right: 6, bottom: 6, left: 6 }, fill: COLORS.white, width: cardWidth, verticalAlignItems: "center" }, /* @__PURE__ */ figma.widget.h(Image, { name: "UpKeepDay Icon", src: upkeepday_widget_icon_default, width: 16, height: 16 }), /* @__PURE__ */ figma.widget.h(ActionButton, { label: "Configure", onClick: () => openConfigure(config, Boolean(model)) }), /* @__PURE__ */ figma.widget.h(ActionButton, { label: "Refresh", onClick: () => waitForTask(refreshConfig(config)) }), /* @__PURE__ */ figma.widget.h(WidthButton, { mode: widthMode, onClick: () => setWidthMode(nextWidthMode(widthMode)) }), lastUpdatedAt ? /* @__PURE__ */ figma.widget.h(Text, { fontSize: 10, fill: COLORS.text }, formatUpdatedAt(lastUpdatedAt)) : null)
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
          var _a2;
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
            path: payload.path,
            responseCodes: (_a2 = payload.responseCodes) != null ? _a2 : []
          };
          waitForTask(applyConfigAndRender(sessionConfig));
        };
        figma.showUI(__html__, { width: 380, height: 430, themeColors: true });
        figma.ui.postMessage({
          type: "selection",
          canRefresh,
          config: currentConfig,
          autoLoadSpec: Boolean(currentConfig.swaggerUrl.trim())
        });
      }));
    }
  }
  function Title({ tag, cardWidth }) {
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: cardWidth, height: 60, padding: { left: 10, right: 10 }, verticalAlignItems: "center", fill: COLORS.white }, /* @__PURE__ */ figma.widget.h(Text, { fontSize: 34, fontWeight: "bold", fill: COLORS.text }, tag));
  }
  function Header({ method, path, cardWidth, widthMode }) {
    if (widthMode === "compact") {
      return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: cardWidth, direction: "vertical", spacing: 8, padding: { top: 8, right: 10, bottom: 10, left: 10 }, fill: COLORS.paleGreen, overflow: "visible" }, /* @__PURE__ */ figma.widget.h(AutoLayout, { width: 118, height: 42, horizontalAlignItems: "center", verticalAlignItems: "center", cornerRadius: 4, fill: methodColor(method) }, /* @__PURE__ */ figma.widget.h(Text, { fontSize: 20, fontWeight: "bold", fill: COLORS.white }, method)), /* @__PURE__ */ figma.widget.h(Text, { width: cardWidth - 20, fontSize: compactPathFontSize(path), lineHeight: 28, fontWeight: "bold", fill: COLORS.text }, path));
    }
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: cardWidth, height: 56, direction: "horizontal", spacing: 16, padding: { top: 8, right: 10, bottom: 8, left: 4 }, verticalAlignItems: "center", fill: COLORS.paleGreen }, /* @__PURE__ */ figma.widget.h(AutoLayout, { width: 118, height: 42, horizontalAlignItems: "center", verticalAlignItems: "center", cornerRadius: 4, fill: methodColor(method) }, /* @__PURE__ */ figma.widget.h(Text, { fontSize: 20, fontWeight: "bold", fill: COLORS.white }, method)), /* @__PURE__ */ figma.widget.h(Text, { width: cardWidth - 154, fontSize: 27, fontWeight: "bold", fill: COLORS.text }, path));
  }
  function EndpointDescription({ description, cardWidth }) {
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: cardWidth, padding: { top: 22, right: 32, bottom: 22, left: 32 }, fill: COLORS.paleGreen, overflow: "visible" }, /* @__PURE__ */ figma.widget.h(Text, { width: cardWidth - 64, fontSize: 20, lineHeight: 28, fill: COLORS.text }, description));
  }
  function SectionTitle({ title, cardWidth }) {
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: cardWidth, padding: { top: 6, right: 6, bottom: 4, left: 6 }, fill: COLORS.white }, /* @__PURE__ */ figma.widget.h(Text, { fontSize: 20, fontWeight: "bold", fill: COLORS.text }, title));
  }
  function SectionBody({ children, cardWidth }) {
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: cardWidth, direction: "vertical", padding: { right: 6, bottom: 6, left: 6 }, spacing: 6, fill: COLORS.paleGreenAlt, overflow: "visible" }, children);
  }
  function CodeBlock({ json, minWidth, maxWidth = CODE_MAX_WIDTH }) {
    const width = codeBlockWidth(json, minWidth, maxWidth);
    const textWidth = width - CODE_HORIZONTAL_PADDING;
    const lines = wrapJsonLines(jsonToLines(json), Math.max(1, Math.floor(textWidth / CODE_CHAR_WIDTH)));
    const height = codeBlockHeight(lines.length);
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { width, height, direction: "vertical", padding: { top: 12, right: 14, bottom: 12, left: 14 }, fill: COLORS.codeBackground, cornerRadius: 4, spacing: 0 }, lines.map((line, index) => /* @__PURE__ */ figma.widget.h(Text, { key: index, width: textWidth, height: CODE_LINE_HEIGHT, fontFamily: "Roboto Mono", fontSize: CODE_FONT_SIZE, lineHeight: CODE_LINE_HEIGHT, fill: COLORS.white }, line.length > 0 ? line.map((chunk, chunkIndex) => /* @__PURE__ */ figma.widget.h(Span, { key: chunkIndex, fill: chunkColor(chunk) }, chunk.text)) : " ")));
  }
  function ResponseItem({ response, codeMaxWidth }) {
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { direction: "horizontal", spacing: RESPONSE_ROW_GAP, overflow: "visible", verticalAlignItems: "start" }, /* @__PURE__ */ figma.widget.h(AutoLayout, { width: RESPONSE_CODE_LABEL_WIDTH, height: 32, horizontalAlignItems: "center", verticalAlignItems: "center", fill: COLORS.white, stroke: COLORS.divider, strokeWidth: 1, cornerRadius: 4 }, /* @__PURE__ */ figma.widget.h(Text, { fontSize: 16, fontWeight: "bold", fill: COLORS.text }, response.code)), /* @__PURE__ */ figma.widget.h(CodeBlock, { json: response.exampleJson, minWidth: codeMaxWidth, maxWidth: codeMaxWidth }));
  }
  function ActionButton({ label, onClick }) {
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { height: 28, padding: { left: 10, right: 10 }, cornerRadius: 4, fill: COLORS.paleGreen, stroke: COLORS.borderGreen, strokeWidth: 1, verticalAlignItems: "center", horizontalAlignItems: "center", onClick }, /* @__PURE__ */ figma.widget.h(Text, { fontSize: 11, fontWeight: "bold", fill: COLORS.text }, label));
  }
  function WidthButton({ mode, onClick }) {
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { height: 28, padding: { left: 8, right: 8 }, cornerRadius: 4, fill: COLORS.white, stroke: COLORS.divider, strokeWidth: 1, verticalAlignItems: "center", horizontalAlignItems: "center", onClick }, /* @__PURE__ */ figma.widget.h(Text, { fontSize: 11, fontWeight: "bold", fill: COLORS.text }, widthModeLabel(mode), " v"));
  }
  function StatusMessage({ message, tone, cardWidth }) {
    return /* @__PURE__ */ figma.widget.h(AutoLayout, { width: cardWidth, padding: { top: 8, right: 8, bottom: 8, left: 8 }, fill: tone === "error" ? "#fff0ef" : COLORS.white }, /* @__PURE__ */ figma.widget.h(Text, { fontSize: 12, fill: tone === "error" ? COLORS.red : COLORS.muted }, message));
  }
  function MutedText({ children }) {
    return /* @__PURE__ */ figma.widget.h(Text, { fontSize: 15, fill: COLORS.muted }, children);
  }
  function cardWidthForMode(mode) {
    if (mode === "compact") return 400;
    if (mode === "wide") return 1100;
    return 750;
  }
  function widthModeLabel(mode) {
    var _a, _b;
    return (_b = (_a = WIDTH_OPTIONS.find((option) => option.option === mode)) == null ? void 0 : _a.label) != null ? _b : "Standard";
  }
  function compactPathFontSize(path) {
    const length = path.length;
    if (length >= 40) return 17;
    if (length >= 37) return 18;
    if (length >= 33) return 19;
    if (length >= 29) return 20;
    if (length >= 25) return 21;
    return 22;
  }
  function errorMessage(rawError) {
    return rawError instanceof Error ? rawError.message : "Something went wrong.";
  }
  function nextWidthMode(mode) {
    if (mode === "compact") return "standard";
    if (mode === "standard") return "wide";
    return "compact";
  }
  function isWidthMode(value) {
    return value === "compact" || value === "standard" || value === "wide";
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
  function codeBlockWidth(json, minWidth, maxWidth) {
    const longestLine = json.split("\n").reduce((longest, line) => Math.max(longest, line.length), 0);
    const estimatedWidth = Math.ceil(longestLine * CODE_CHAR_WIDTH + CODE_HORIZONTAL_PADDING);
    return Math.min(Math.max(minWidth, estimatedWidth), maxWidth);
  }
  function codeBlockHeight(lineCount) {
    return lineCount * CODE_LINE_HEIGHT + CODE_VERTICAL_PADDING;
  }
  function wrapJsonLines(lines, maxCharacters) {
    return lines.flatMap((line) => wrapJsonLine(line, maxCharacters));
  }
  function wrapJsonLine(line, maxCharacters) {
    if (line.length === 0) return [[]];
    const wrapped = [];
    let currentLine = [];
    let currentLength = 0;
    for (const chunk of line) {
      let remainingText = chunk.text;
      while (remainingText.length > 0) {
        const available = maxCharacters - currentLength;
        if (available <= 0) {
          wrapped.push(currentLine);
          currentLine = [];
          currentLength = 0;
          continue;
        }
        const nextText = remainingText.slice(0, available);
        currentLine.push(__spreadProps(__spreadValues({}, chunk), { text: nextText }));
        currentLength += nextText.length;
        remainingText = remainingText.slice(nextText.length);
      }
    }
    wrapped.push(currentLine);
    return wrapped;
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
    const responseCodes = Array.isArray(candidate.responseCodes) ? candidate.responseCodes.filter((code) => typeof code === "string") : void 0;
    return {
      type: "generate",
      swaggerUrl: candidate.swaggerUrl,
      path: candidate.path,
      method: normalizeMethod(candidate.method),
      responseCodes
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
      path: config.path,
      responseCodes: config.responseCodes
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
