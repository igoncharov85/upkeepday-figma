import { describe, expect, it } from "vitest";
import { buildEndpointViewModel, exampleFromSchema, extractSwaggerActions, normalizeMethod } from "../src/openapi";

const swaggerFixture = {
  swagger: "2.0",
  consumes: ["application/json"],
  produces: ["application/json"],
  paths: {
    "/student/todos/action": {
      post: {
        summary: "Action on student todo",
        description: "Runs an action on a student todo item.",
        responses: {
          "200": {
            description: "Success",
            schema: { $ref: "#/definitions/StudentToDos.MessageStatusOut" }
          },
          "400": {
            description: "Invalid request",
            schema: { $ref: "#/definitions/ErrorOut" }
          }
        },
        operationId: "post_action_on_to_do_route",
        parameters: [
          {
            name: "payload",
            required: true,
            in: "body",
            schema: { $ref: "#/definitions/StudentToDos.CustomerToDoActionIn" }
          }
        ],
        tags: ["Student ToDos"]
      },
      patch: {
        operationId: "patch_ignored",
        responses: {
          "200": {
            description: "Ignored"
          }
        }
      }
    }
  },
  definitions: {
    "StudentToDos.CustomerToDoActionIn": {
      required: ["Id", "Type"],
      properties: {
        Id: { type: "integer", description: "Id" },
        Type: {
          type: "string",
          description: "CustomerToDoActionEnum",
          example: "Dismiss",
          enum: ["Dismiss"]
        }
      },
      type: "object"
    },
    "StudentToDos.MessageStatusOut": {
      properties: {
        Message: {
          type: ["string", "null"],
          description: "Message",
          example: "string"
        },
        Status: {
          type: "string",
          description: "MessageStatus",
          default: "Success",
          example: "Success",
          enum: ["Success", "Warning", "Error"]
        }
      },
      type: "object"
    },
    ErrorOut: {
      properties: {
        Error: { type: "string" }
      },
      type: "object"
    }
  }
};

describe("extractSwaggerActions", () => {
  it("extracts searchable supported Swagger operations", () => {
    const actions = extractSwaggerActions(swaggerFixture);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      method: "POST",
      path: "/student/todos/action",
      label: "POST /student/todos/action",
      operationId: "post_action_on_to_do_route",
      tag: "Student ToDos",
      summary: "Action on student todo",
      responseCodes: ["200", "400"]
    });
    expect(actions[0].searchIndex).toContain("/student/todos/action");
    expect(actions[0].searchIndex).toContain("post_action_on_to_do_route");
    expect(actions[0].searchIndex).toContain("student todos");
  });

  it("extracts supported OpenAPI 3 methods and ignores unsupported methods", () => {
    const actions = extractSwaggerActions({
      openapi: "3.0.0",
      paths: {
        "/items": {
          get: {
            operationId: "list_items",
            tags: ["Items"],
            description: "List items",
            responses: { "200": { description: "OK" } }
          },
          delete: {
            operationId: "delete_items",
            responses: { "200": { description: "OK" } }
          },
          patch: {
            operationId: "patch_items",
            responses: { "200": { description: "OK" } }
          }
        }
      }
    });

    expect(actions.map((action) => action.method)).toEqual(["GET", "DELETE"]);
    expect(actions.map((action) => action.operationId)).toEqual(["list_items", "delete_items"]);
  });
});

describe("normalizeMethod", () => {
  it("normalizes supported methods", () => {
    expect(normalizeMethod("post")).toBe("POST");
  });

  it("rejects unsupported methods", () => {
    expect(() => normalizeMethod("trace")).toThrow("Unsupported HTTP method");
  });
});

describe("buildEndpointViewModel", () => {
  it("builds the UpKeepDay student todo action examples from Swagger 2.0", () => {
    const model = buildEndpointViewModel(swaggerFixture, {
      swaggerUrl: "https://api.upkeepday.com/swagger.json",
      path: "/student/todos/action",
      method: "POST"
    });

    expect(model.request?.example).toEqual({
      Id: 0,
      Type: "Dismiss"
    });
    expect(model.request?.exampleJson).toBe('{\n  "Id": 0,\n  "Type": "Dismiss"\n}');
    expect(model.response.example).toEqual({
      Message: "string",
      Status: "Success"
    });
    expect(model.response.exampleJson).toBe('{\n  "Message": "string",\n  "Status": "Success"\n}');
    expect(model.response.code).toBe("200");
    expect(model.responses.map((response) => response.code)).toEqual(["200"]);
    expect(model.description).toBe("Runs an action on a student todo item.");
  });

  it("builds examples for selected response codes", () => {
    const model = buildEndpointViewModel(swaggerFixture, {
      swaggerUrl: "https://api.upkeepday.com/swagger.json",
      path: "/student/todos/action",
      method: "POST",
      responseCodes: ["200", "400"]
    });

    expect(model.responses.map((response) => response.code)).toEqual(["200", "400"]);
    expect(model.responses[0].example).toEqual({
      Message: "string",
      Status: "Success"
    });
    expect(model.responses[1].example).toEqual({
      Error: "string"
    });
  });

  it("builds OpenAPI 3 request and response examples", () => {
    const model = buildEndpointViewModel({
      openapi: "3.0.0",
      paths: {
        "/items": {
          post: {
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      active: { type: "boolean" }
                    }
                  }
                }
              }
            },
            responses: {
              "200": {
                description: "OK",
                content: {
                  "application/json": {
                    schema: {
                      type: "array",
                      items: { type: "integer" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }, {
      swaggerUrl: "https://example.com/openapi.json",
      path: "/items",
      method: "POST"
    });

    expect(model.request?.example).toEqual({ name: "string", active: true });
    expect(model.response.example).toEqual([0]);
    expect(model.description).toBeUndefined();
  });

  it("throws a useful error for missing operations", () => {
    expect(() => buildEndpointViewModel(swaggerFixture, {
      swaggerUrl: "https://api.upkeepday.com/swagger.json",
      path: "/student/todos/action",
      method: "GET"
    })).toThrow('GET is not defined for "/student/todos/action"');
  });
});

describe("exampleFromSchema", () => {
  it("handles primitive, enum, nullable, array, object, and refs", () => {
    const spec = {
      definitions: {
        Child: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["Ready", "Done"] },
            score: { type: "number" },
            tags: { type: "array", items: { type: ["string", "null"] } }
          }
        }
      }
    };

    expect(exampleFromSchema(spec, { $ref: "#/definitions/Child" })).toEqual({
      status: "Ready",
      score: 0,
      tags: ["string"]
    });
  });
});
