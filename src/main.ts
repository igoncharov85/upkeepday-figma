import { buildEndpointViewModel, extractSwaggerActions, normalizeMethod, type GenerateInput, type SwaggerAction } from "./openapi";
import { renderEndpointCard, type RenderOptions } from "./render";

const CONFIG_KEY = "openapi-mini-viewer-config";
let cachedSpec: unknown;
let cachedSpecUrl = "";

if (figma.command === "refresh") {
  refreshFromRelaunch();
} else {
  setupUi();
}

function setupUi(): void {
  figma.showUI(__html__, { width: 380, height: 398, themeColors: true });
  postInitialStateFromVariables();
  figma.on("selectionchange", postSelectionState);

  figma.ui.onmessage = async (message: unknown) => {
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

      const replaceNode = payload.type === "refresh" ? selectedEndpointFrame() : undefined;
      const action = payload.type === "refresh" ? "Refreshed" : "Generated";
      const card = await generateCard(input, { replaceNode });

      figma.ui.postMessage({ type: "done", layerName: card.name, action });
      figma.notify(`${action} ${input.method} ${input.path}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      figma.ui.postMessage({ type: "error", message });
      figma.notify(message, { error: true });
    }
  };
}

type PluginMessage =
  | { type: "loadSpec"; swaggerUrl: string }
  | ({ type: "generate" } & GenerateInput)
  | { type: "refresh" }
  | { type: "cancel" };

function parseMessage(message: unknown): PluginMessage | undefined {
  if (typeof message !== "object" || message === null) return undefined;
  const candidate = message as Record<string, unknown>;

  if (candidate.type === "cancel") return { type: "cancel" };
  if (candidate.type === "refresh") return { type: "refresh" };
  if (candidate.type === "loadSpec" && typeof candidate.swaggerUrl === "string") {
    return {
      type: "loadSpec",
      swaggerUrl: candidate.swaggerUrl
    };
  }

  if (candidate.type !== "generate") return undefined;
  if (typeof candidate.swaggerUrl !== "string") return undefined;
  if (typeof candidate.path !== "string") return undefined;
  if (typeof candidate.method !== "string") return undefined;

  return {
    type: "generate",
    swaggerUrl: candidate.swaggerUrl,
    path: candidate.path,
    method: normalizeMethod(candidate.method)
  };
}

async function generateCard(input: GenerateInput, options: RenderOptions = {}): Promise<FrameNode> {
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

async function loadSpecActions(swaggerUrl: string): Promise<SwaggerAction[]> {
  const spec = await fetchSpec(swaggerUrl);
  return extractSwaggerActions(spec);
}

async function fetchSpec(swaggerUrl: string): Promise<unknown> {
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

function selectedEndpointFrame(): FrameNode | undefined {
  const selected = figma.currentPage.selection[0];
  if (selected?.type !== "FRAME") return undefined;
  return selected.getPluginData(CONFIG_KEY) ? selected : undefined;
}

function readSelectedConfig(): GenerateInput | undefined {
  const frame = selectedEndpointFrame();
  if (!frame) return undefined;

  try {
    const parsed = JSON.parse(frame.getPluginData(CONFIG_KEY)) as Partial<GenerateInput>;
    if (typeof parsed.swaggerUrl !== "string") return undefined;
    if (typeof parsed.path !== "string") return undefined;
    if (typeof parsed.method !== "string") return undefined;

    return {
      swaggerUrl: parsed.swaggerUrl,
      path: parsed.path,
      method: normalizeMethod(parsed.method)
    };
  } catch {
    return undefined;
  }
}

function postSelectionState(): void {
  const config = readSelectedConfig();
  figma.ui.postMessage({
    type: "selection",
    canRefresh: Boolean(config),
    config
  });
}

async function postInitialStateFromVariables(): Promise<void> {
  const config = await readVariableConfig();

  if (config.swaggerUrl || config.method || config.path) {
    figma.ui.postMessage({
      type: "variables",
      config
    });
  }

  postSelectionState();
}

async function readVariableConfig(): Promise<Partial<GenerateInput>> {
  const variables = await figma.variables.getLocalVariablesAsync("STRING");
  const swaggerUrl = variableStringValue(variables, "SwaggerUrl");
  const methodValue = variableStringValue(variables, "ApiAction");
  const path = variableStringValue(variables, "ApiPath");
  let method: GenerateInput["method"] | undefined;

  if (methodValue) {
    try {
      method = normalizeMethod(methodValue);
    } catch {
      method = undefined;
    }
  }

  return {
    swaggerUrl,
    method,
    path
  };
}

function variableStringValue(variables: Variable[], name: string): string | undefined {
  const variable = variables.find((candidate) => candidate.name === name || candidate.name.endsWith(`/${name}`));
  if (!variable) return undefined;

  const firstValue = Object.values(variable.valuesByMode).find((value): value is string => typeof value === "string");
  return firstValue?.trim() || undefined;
}

async function refreshFromRelaunch(): Promise<void> {
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
