export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD" | "TRACE";

export type GenerateInput = {
  swaggerUrl: string;
  path: string;
  method: HttpMethod;
  responseCodes?: string[];
};

export type SwaggerAction = {
  method: HttpMethod;
  path: string;
  label: string;
  operationId?: string;
  tag?: string;
  summary?: string;
  description?: string;
  responseCodes: string[];
  searchIndex: string;
};

export type EndpointViewModel = {
  swaggerUrl: string;
  method: HttpMethod;
  path: string;
  operationId?: string;
  tag?: string;
  description?: string;
  request?: BodyExample;
  responses: ResponseExample[];
  response: ResponseExample;
};

export type BodyExample = {
  name: string;
  required: boolean;
  typeLabel: string;
  contentType: string;
  example: unknown;
  exampleJson: string;
};

export type ResponseExample = {
  code: string;
  description: string;
  contentType: string;
  example: unknown;
  exampleJson: string;
};

type JsonObject = Record<string, unknown>;

const METHODS = ["get", "post", "put", "delete", "patch", "options", "head", "trace"] as const;

export function normalizeMethod(method: string): HttpMethod {
  const normalized = method.trim().toUpperCase();
  if (!METHODS.includes(normalized.toLowerCase() as (typeof METHODS)[number])) {
    throw new Error(`Unsupported HTTP method "${method}".`);
  }
  return normalized as HttpMethod;
}

export function buildEndpointViewModel(spec: unknown, input: GenerateInput): EndpointViewModel {
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

export function extractSwaggerActions(spec: unknown): SwaggerAction[] {
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

function extractRequestExample(root: JsonObject, pathItem: JsonObject, operation: JsonObject): BodyExample | undefined {
  const openApiBody = asOptionalObject(operation.requestBody);

  if (openApiBody) {
    const content = asOptionalObject(openApiBody.content);
    const chosen = chooseContent(content);
    if (!chosen) return undefined;

    const schema = asOptionalObject(chosen.media.schema);
    const example = chooseExplicitExample(chosen.media) ?? (schema ? exampleFromSchema(root, schema) : {});

    return {
      name: "payload",
      required: openApiBody.required === true,
      typeLabel: schemaTypeLabel(root, schema),
      contentType: chosen.contentType,
      example,
      exampleJson: stringifyExample(example)
    };
  }

  const parameters = [
    ...asArray(pathItem.parameters),
    ...asArray(operation.parameters)
  ].map(asOptionalObject).filter(Boolean) as JsonObject[];
  const bodyParameter = parameters.find((parameter) => parameter.in === "body");

  if (!bodyParameter) return undefined;

  const schema = asOptionalObject(bodyParameter.schema);
  const example = schema ? exampleFromSchema(root, schema) : {};
  const contentType = firstString(operation.consumes) ?? firstString(root.consumes) ?? "application/json";

  return {
    name: asString(bodyParameter.name) ?? "payload",
    required: bodyParameter.required === true,
    typeLabel: schemaTypeLabel(root, schema),
    contentType,
    example,
    exampleJson: stringifyExample(example)
  };
}

function extractResponseCodes(operation: JsonObject): string[] {
  const responses = asOptionalObject(operation.responses);
  return responses ? sortedResponseCodes(Object.keys(responses)) : [];
}

function extractResponseExamples(root: JsonObject, operation: JsonObject, selectedCodes: string[] | undefined): ResponseExample[] {
  const responses = asObject(operation.responses, "responses");
  const codes = chooseResponseCodes(responses, selectedCodes);
  return codes.map((code) => extractResponseExample(root, operation, responses, code));
}

function chooseResponseCodes(responses: JsonObject, selectedCodes: string[] | undefined): string[] {
  const availableCodes = sortedResponseCodes(Object.keys(responses));

  if (availableCodes.length === 0) {
    throw new Error("No responses were found for this operation.");
  }

  const requestedCodes = (selectedCodes ?? []).map((code) => code.trim()).filter(Boolean);

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

function extractResponseExample(root: JsonObject, operation: JsonObject, responses: JsonObject, code: string): ResponseExample {
  const responseObject = asObject(responses[code], `response ${code}`);
  const response = asObject(resolveMaybeRef(root, responseObject), `response ${code}`);
  const content = asOptionalObject(response.content);
  const chosen = chooseContent(content);

  if (chosen) {
    const schema = asOptionalObject(chosen.media.schema);
    const example = chooseExplicitExample(chosen.media) ?? (schema ? exampleFromSchema(root, schema) : {});

    return {
      code,
      description: asString(response.description) ?? "Success",
      contentType: chosen.contentType,
      example,
      exampleJson: stringifyExample(example)
    };
  }

  const schema = asOptionalObject(response.schema);
  const example = schema ? exampleFromSchema(root, schema) : {};
  const contentType = firstString(operation.produces) ?? firstString(root.produces) ?? "application/json";

  return {
    code,
    description: asString(response.description) ?? "Success",
    contentType,
    example,
    exampleJson: stringifyExample(example)
  };
}

function sortedResponseCodes(codes: string[]): string[] {
  return [...codes].sort((left, right) => {
    const leftIsNumeric = /^\d+$/.test(left);
    const rightIsNumeric = /^\d+$/.test(right);

    if (leftIsNumeric && rightIsNumeric) return Number(left) - Number(right);
    if (leftIsNumeric) return -1;
    if (rightIsNumeric) return 1;
    return left.localeCompare(right);
  });
}

export function exampleFromSchema(root: unknown, schema: unknown, depth = 0, seen = new Set<string>()): unknown {
  if (depth > 10) return {};

  const current = asOptionalObject(schema);
  if (!current) return null;

  const explicitExample = current.example ?? current.default;
  if (explicitExample !== undefined) return explicitExample;

  if (Array.isArray(current.enum) && current.enum.length > 0) {
    return current.enum[0];
  }

  const ref = asString(current.$ref);
  if (ref) {
    if (seen.has(ref)) return {};
    seen.add(ref);
    const resolved = resolveRef(root, ref);
    return exampleFromSchema(root, { ...asOptionalObject(resolved), ...withoutRef(current) }, depth + 1, seen);
  }

  const allOf = asArray(current.allOf).map(asOptionalObject).filter(Boolean) as JsonObject[];
  if (allOf.length > 0) {
    return allOf.reduce<JsonObject>((merged, item) => {
      const next = exampleFromSchema(root, item, depth + 1, seen);
      return isPlainObject(next) ? { ...merged, ...next } : merged;
    }, {});
  }

  const variant = firstSchema(current.oneOf) ?? firstSchema(current.anyOf);
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
      return Object.entries(properties).reduce<JsonObject>((result, [propertyName, propertySchema]) => {
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

function chooseContent(content: JsonObject | undefined): { contentType: string; media: JsonObject } | undefined {
  if (!content) return undefined;

  const preferred = ["application/json", "application/*+json", "text/json"];
  const contentType = preferred.find((candidate) => isPlainObject(content[candidate]))
    ?? Object.keys(content).find((candidate) => candidate.includes("json") && isPlainObject(content[candidate]))
    ?? Object.keys(content).find((candidate) => isPlainObject(content[candidate]));

  if (!contentType) return undefined;

  return {
    contentType,
    media: asObject(content[contentType], `content ${contentType}`)
  };
}

function chooseExplicitExample(media: JsonObject): unknown {
  if (media.example !== undefined) return media.example;

  const examples = asOptionalObject(media.examples);
  if (!examples) return undefined;

  const firstExample = asOptionalObject(Object.values(examples)[0]);
  if (!firstExample) return undefined;

  return firstExample.value;
}

function schemaTypeLabel(root: JsonObject, schema: JsonObject | undefined): string {
  if (!schema) return "object";

  const resolved = asOptionalObject(resolveMaybeRef(root, schema)) ?? schema;
  const type = normalizedType(resolved);

  if (type === "array") return "array";
  if (type) return type;
  if (resolved.properties) return "object";
  return "object";
}

function resolveMaybeRef(root: unknown, schema: JsonObject): unknown {
  const ref = asString(schema.$ref);
  return ref ? resolveRef(root, ref) : schema;
}

function resolveRef(root: unknown, ref: string): unknown {
  if (!ref.startsWith("#/")) {
    throw new Error(`Only internal $ref values are supported. Received "${ref}".`);
  }

  return ref
    .slice(2)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<unknown>((current, part) => {
      if (!isPlainObject(current) && !Array.isArray(current)) {
        throw new Error(`Unable to resolve $ref "${ref}".`);
      }

      return (current as Record<string, unknown>)[part];
    }, root);
}

function normalizedType(schema: JsonObject): string | undefined {
  const type = schema.type;
  if (Array.isArray(type)) {
    return type.find((entry): entry is string => typeof entry === "string" && entry !== "null");
  }

  return asString(type);
}

function withoutRef(schema: JsonObject): JsonObject {
  const { $ref: _ref, ...rest } = schema;
  return rest;
}

function firstSchema(value: unknown): JsonObject | undefined {
  return asArray(value).map(asOptionalObject).find(Boolean) as JsonObject | undefined;
}

function stringifyExample(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function firstString(value: unknown): string | undefined {
  return asArray(value).find((item): item is string => typeof item === "string");
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asObject(value: unknown, label: string): JsonObject {
  if (!isPlainObject(value)) {
    throw new Error(`Expected ${label} to be an object.`);
  }

  return value;
}

function asOptionalObject(value: unknown): JsonObject | undefined {
  return isPlainObject(value) ? value : undefined;
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
