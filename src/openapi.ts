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
  responseTypescriptModel?: string;
};

export type BodyExample = {
  name: string;
  required: boolean;
  typeLabel: string;
  contentType: string;
  example: unknown;
  exampleJson: string;
  typescriptModel?: string;
};

export type ResponseExample = {
  code: string;
  description: string;
  contentType: string;
  example: unknown;
  exampleJson: string;
  typescriptModel?: string;
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

  const baseTypeName = endpointTypeName(operation, input);
  const request = extractRequestExample(root, pathItem, operation, baseTypeName);
  const responses = extractResponseExamples(root, operation, input.responseCodes, baseTypeName);

  return {
    swaggerUrl: input.swaggerUrl,
    method: input.method,
    path: input.path,
    operationId: asString(operation.operationId),
    tag: firstString(operation.tags),
    description: asString(operation.description),
    request,
    responses,
    response: responses[0],
    responseTypescriptModel: responseTypescriptModel(baseTypeName, responses)
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

function extractRequestExample(root: JsonObject, pathItem: JsonObject, operation: JsonObject, baseTypeName: string): BodyExample | undefined {
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
      exampleJson: stringifyExample(example),
      typescriptModel: schema ? typescriptDeclarationFromSchema(root, schema, `${baseTypeName}Payload`) : undefined
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
    exampleJson: stringifyExample(example),
    typescriptModel: schema ? typescriptDeclarationFromSchema(root, schema, `${baseTypeName}Payload`) : undefined
  };
}

function extractResponseCodes(operation: JsonObject): string[] {
  const responses = asOptionalObject(operation.responses);
  return responses ? sortedResponseCodes(Object.keys(responses)) : [];
}

function extractResponseExamples(root: JsonObject, operation: JsonObject, selectedCodes: string[] | undefined, baseTypeName: string): ResponseExample[] {
  const responses = asObject(operation.responses, "responses");
  const codes = chooseResponseCodes(responses, selectedCodes);
  return codes.map((code) => extractResponseExample(root, operation, responses, code, baseTypeName));
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

function extractResponseExample(root: JsonObject, operation: JsonObject, responses: JsonObject, code: string, baseTypeName: string): ResponseExample {
  const responseObject = asObject(responses[code], `response ${code}`);
  const response = asObject(resolveMaybeRef(root, responseObject), `response ${code}`);
  const content = asOptionalObject(response.content);
  const chosen = chooseContent(content);
  const typeName = `${baseTypeName}${responseCodeTypePart(code)}Response`;

  if (chosen) {
    const schema = asOptionalObject(chosen.media.schema);
    const example = chooseExplicitExample(chosen.media) ?? (schema ? exampleFromSchema(root, schema) : {});

    return {
      code,
      description: asString(response.description) ?? "Success",
      contentType: chosen.contentType,
      example,
      exampleJson: stringifyExample(example),
      typescriptModel: schema ? typescriptDeclarationFromSchema(root, schema, typeName) : undefined
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
    exampleJson: stringifyExample(example),
    typescriptModel: schema ? typescriptDeclarationFromSchema(root, schema, typeName) : undefined
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

function endpointTypeName(operation: JsonObject, input: GenerateInput): string {
  const operationId = asString(operation.operationId);
  if (operationId) return toPascalCase(operationId) || "Endpoint";

  return toPascalCase(`${input.method} ${input.path.replace(/[{}]/g, " ")}`) || "Endpoint";
}

function responseTypescriptModel(baseTypeName: string, responses: ResponseExample[]): string | undefined {
  const models = responses.map((response) => response.typescriptModel).filter((model): model is string => Boolean(model));
  if (models.length === 0) return undefined;

  const responseTypeNames = responses
    .filter((response) => response.typescriptModel)
    .map((response) => `${baseTypeName}${responseCodeTypePart(response.code)}Response`);

  if (responseTypeNames.length <= 1) return models.join("\n\n");

  return [
    ...models,
    `type ${baseTypeName}Response = ${responseTypeNames.join(" | ")};`
  ].join("\n\n");
}

function typescriptDeclarationFromSchema(root: JsonObject, schema: JsonObject, typeName: string): string {
  const resolved = mergeRef(root, schema);
  const context: TypeScriptContext = { declarations: [], declaredNames: new Set<string>() };
  const type = typescriptType(root, resolved, 0, new Set<string>(), context, typeName, typeName);
  const mainDeclaration = type.kind === "object"
    ? `interface ${typeName} ${type.value}`
    : `type ${typeName} = ${type.value};`;

  return [...context.declarations, mainDeclaration].join("\n\n");
}

type TypeScriptType = {
  kind: "object" | "type";
  value: string;
};

type TypeScriptContext = {
  declarations: string[];
  declaredNames: Set<string>;
};

function typescriptType(root: JsonObject, schema: unknown, depth: number, seen: Set<string>, context: TypeScriptContext, parentTypeName: string, propertyName?: string): TypeScriptType {
  if (depth > 12) return { kind: "type", value: "unknown" };

  const current = asOptionalObject(schema);
  if (!current) return { kind: "type", value: "unknown" };

  const ref = asString(current.$ref);
  if (ref) {
    if (seen.has(ref)) return { kind: "type", value: "unknown" };
    const nextSeen = new Set(seen);
    nextSeen.add(ref);
    return typescriptType(root, mergeRef(root, current), depth + 1, nextSeen, context, parentTypeName, propertyName);
  }

  const enumType = typescriptEnumType(current);
  if (enumType) return withNullable(current, { kind: "type", value: enumType });

  const allOf = asArray(current.allOf).map(asOptionalObject).filter(Boolean) as JsonObject[];
  if (allOf.length > 0) {
    const merged = mergeObjectSchemas(allOf.map((item) => mergeRef(root, item)));
    if (merged) return withNullable(current, typescriptType(root, merged, depth + 1, seen, context, parentTypeName, propertyName));

    const parts = allOf.map((item) => parenthesizedType(typescriptType(root, item, depth + 1, seen, context, parentTypeName, propertyName).value));
    return withNullable(current, { kind: "type", value: parts.join(" & ") || "unknown" });
  }

  const variants = asArray(current.oneOf).length > 0 ? asArray(current.oneOf) : asArray(current.anyOf);
  if (variants.length > 0) {
    const parts = variants.map((item) => typescriptType(root, item, depth + 1, seen, context, parentTypeName, propertyName).value);
    return withNullable(current, { kind: "type", value: unique(parts).join(" | ") || "unknown" });
  }

  const type = normalizedType(current);

  if (type === "array") {
    const itemSchema = asOptionalObject(current.items);
    const itemObject = itemSchema ? resolvedObjectArrayItem(root, itemSchema) : undefined;
    if (itemObject) {
      const itemTypeName = propertyName && propertyName !== parentTypeName
        ? arrayItemTypeName(parentTypeName, propertyName)
        : `${parentTypeName}Item`;
      declareInterface(root, itemObject, itemTypeName, depth + 1, seen, context);
      return withNullable(current, { kind: "type", value: `${itemTypeName}[]` });
    }

    const itemType = typescriptType(root, current.items, depth + 1, seen, context, parentTypeName, propertyName).value;
    return withNullable(current, { kind: "type", value: `${parenthesizedArrayType(itemType)}[]` });
  }

  if (type === "object" || current.properties || current.additionalProperties) {
    return withNullable(current, typescriptObjectType(root, current, depth, seen, context, parentTypeName));
  }

  if (type === "integer" || type === "number") return withNullable(current, { kind: "type", value: "number" });
  if (type === "boolean") return withNullable(current, { kind: "type", value: "boolean" });
  if (type === "string") return withNullable(current, { kind: "type", value: "string" });

  return withNullable(current, { kind: "type", value: "unknown" });
}

function typescriptObjectType(root: JsonObject, schema: JsonObject, depth: number, seen: Set<string>, context: TypeScriptContext, parentTypeName: string): TypeScriptType {
  const properties = asOptionalObject(schema.properties);
  const required = new Set(asArray(schema.required).filter((item): item is string => typeof item === "string"));
  const lines: string[] = [];

  if (properties) {
    for (const [propertyName, propertySchema] of Object.entries(properties)) {
      const optional = required.has(propertyName) ? "" : "?";
      const propertyType = typescriptType(root, propertySchema, depth + 1, new Set(seen), context, parentTypeName, propertyName).value;
      lines.push(`${indent(1)}${typescriptPropertyName(propertyName)}${optional}: ${propertyType};`);
    }
  }

  const additionalProperties = schema.additionalProperties;
  if (isPlainObject(additionalProperties)) {
    const additionalType = typescriptType(root, additionalProperties, depth + 1, seen, context, parentTypeName, "additionalProperty").value;
    lines.push(`${indent(1)}[key: string]: ${additionalType};`);
  } else if (additionalProperties === true && lines.length === 0) {
    lines.push(`${indent(1)}[key: string]: unknown;`);
  }

  if (lines.length === 0) return { kind: "object", value: "{\n  [key: string]: unknown;\n}" };

  return { kind: "object", value: `{\n${lines.join("\n")}\n}` };
}

function declareInterface(root: JsonObject, schema: JsonObject, typeName: string, depth: number, seen: Set<string>, context: TypeScriptContext): void {
  if (context.declaredNames.has(typeName)) return;
  context.declaredNames.add(typeName);

  const objectType = typescriptObjectType(root, schema, depth, seen, context, typeName);
  context.declarations.push(`interface ${typeName} ${objectType.value}`);
}

function resolvedObjectArrayItem(root: JsonObject, schema: JsonObject): JsonObject | undefined {
  const resolved = mergeRef(root, schema);
  const allOf = asArray(resolved.allOf).map(asOptionalObject).filter(Boolean) as JsonObject[];

  if (allOf.length > 0) {
    return mergeObjectSchemas(allOf.map((item) => mergeRef(root, item)));
  }

  const type = normalizedType(resolved);
  if (type === "object" || resolved.properties || resolved.additionalProperties) return resolved;
  return undefined;
}

function typescriptEnumType(schema: JsonObject): string | undefined {
  if (!Array.isArray(schema.enum) || schema.enum.length === 0) return undefined;

  return unique(schema.enum.map((item) => {
    if (typeof item === "string") return JSON.stringify(item);
    if (typeof item === "number" || typeof item === "boolean") return String(item);
    if (item === null) return "null";
    return "unknown";
  })).join(" | ");
}

function withNullable(schema: JsonObject, type: TypeScriptType): TypeScriptType {
  if (!isNullableSchema(schema) || type.value.includes("null")) return type;

  return {
    kind: "type",
    value: `${type.value} | null`
  };
}

function isNullableSchema(schema: JsonObject): boolean {
  return schema.nullable === true || (Array.isArray(schema.type) && schema.type.includes("null"));
}

function mergeRef(root: JsonObject, schema: JsonObject): JsonObject {
  const ref = asString(schema.$ref);
  if (!ref) return schema;

  return {
    ...asOptionalObject(resolveRef(root, ref)),
    ...withoutRef(schema)
  };
}

function mergeObjectSchemas(schemas: JsonObject[]): JsonObject | undefined {
  const merged: JsonObject = { type: "object", properties: {}, required: [] };
  const mergedProperties = asObject(merged.properties, "merged properties");
  const mergedRequired: string[] = [];

  for (const schema of schemas) {
    const current = asOptionalObject(schema);
    if (!current || (!current.properties && normalizedType(current) !== "object")) return undefined;

    Object.assign(mergedProperties, asOptionalObject(current.properties) ?? {});
    mergedRequired.push(...asArray(current.required).filter((item): item is string => typeof item === "string"));

    if (current.additionalProperties !== undefined) {
      merged.additionalProperties = current.additionalProperties;
    }
  }

  merged.required = unique(mergedRequired);
  return merged;
}

function toPascalCase(value: string): string {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);

  const result = words.map((word) => {
    const normalized = word.toLowerCase();
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }).join("");

  return /^[0-9]/.test(result) ? `Model${result}` : result;
}

function responseCodeTypePart(code: string): string {
  const words = code.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const result = words.map((word) => {
    const normalized = word.toLowerCase();
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }).join("");

  return result || "Default";
}

function arrayItemTypeName(parentTypeName: string, propertyName: string | undefined): string {
  if (!propertyName) return `${parentTypeName}Item`;

  const propertyTypePart = toPascalCase(propertyName);
  if (!propertyTypePart) return `${parentTypeName}Item`;

  return `${parentTypeName}${singularTypePart(propertyTypePart)}`;
}

function singularTypePart(value: string): string {
  if (value.length > 3 && value.endsWith("ies")) return `${value.slice(0, -3)}y`;
  if (value.length > 1 && value.endsWith("s") && !value.endsWith("ss")) return value.slice(0, -1);
  return `${value}Item`;
}

function typescriptPropertyName(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function parenthesizedArrayType(value: string): string {
  return value.includes(" | ") || value.includes(" & ") ? `(${value})` : value;
}

function parenthesizedType(value: string): string {
  return value.startsWith("{") && value.endsWith("}") ? `(${value})` : value;
}

function indent(level: number): string {
  return "  ".repeat(level);
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
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
