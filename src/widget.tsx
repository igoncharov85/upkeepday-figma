import { buildEndpointViewModel, extractSwaggerActions, normalizeMethod, type EndpointViewModel, type GenerateInput, type HttpMethod, type SwaggerAction } from "./openapi";
import { jsonToLines, type JsonChunk } from "./widgetJson";
import widgetIcon from "../assets/upkeepday-widget-icon.png";

const { widget } = figma;
const { AutoLayout, Image, Text, Span, useEffect, usePropertyMenu, useSyncedState, useWidgetNodeId, waitForTask } = widget;

const DEFAULT_SWAGGER_URL = "https://petstore3.swagger.io/api/v3/openapi.json";
const LAST_CONFIG_STORAGE_KEY = "openapi-mini-viewer:last-config";

const CODE_MAX_WIDTH = 1800;
const RESPONSE_CODE_LABEL_WIDTH = 58;
const RESPONSE_ROW_GAP = 8;
const CODE_FONT_SIZE = 14;
const CODE_LINE_HEIGHT = 20;
const CODE_HORIZONTAL_PADDING = 28;
const CODE_VERTICAL_PADDING = 24;
const CODE_CHAR_WIDTH = 8.1;

const COLORS = {
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

type PluginMessage =
  | { type: "loadSpec"; swaggerUrl: string }
  | ({ type: "generate" } & GenerateInput)
  | { type: "refresh" }
  | { type: "cancel" };

type WidgetConfig = {
  swaggerUrl: string;
  method: HttpMethod | "";
  path: string;
  responseCodes: string[];
};

type WidthMode = "compact" | "standard" | "wide";

const WIDTH_OPTIONS: Array<{ option: WidthMode; label: string }> = [
  { option: "compact", label: "Compact" },
  { option: "standard", label: "Standard" },
  { option: "wide", label: "Wide" }
];

let cachedSpecUrl = "";
let cachedSpec: unknown;

function OpenApiMiniViewerWidget() {
  const widgetNodeId = useWidgetNodeId();
  const [swaggerUrl, setSwaggerUrl] = useSyncedState("swaggerUrl", DEFAULT_SWAGGER_URL);
  const [method, setMethod] = useSyncedState<HttpMethod | "">("method", "");
  const [path, setPath] = useSyncedState("path", "");
  const [responseCodes, setResponseCodes] = useSyncedState<string[]>("responseCodes", []);
  const [model, setModel] = useSyncedState<EndpointViewModel | null>("model", null);
  const [error, setError] = useSyncedState("error", "");
  const [loadingMessage, setLoadingMessage] = useSyncedState("loadingMessage", "");
  const [initialized, setInitialized] = useSyncedState("initialized", false);
  const [lastUpdatedAt, setLastUpdatedAt] = useSyncedState("lastUpdatedAt", "");
  const [widthMode, setWidthMode] = useSyncedState<WidthMode>("widthMode", "standard");

  const config: WidgetConfig = { swaggerUrl, method, path, responseCodes };
  const displayedResponses = model?.responses ?? (model?.response ? [model.response] : []);
  const cardWidth = cardWidthForMode(widthMode);
  const codeMaxWidth = cardWidth - 12;
  const responseCodeMaxWidth = codeMaxWidth - RESPONSE_CODE_LABEL_WIDTH - RESPONSE_ROW_GAP;

  useEffect(() => {
    if (initialized) return;

    waitForTask((async () => {
      const savedSwaggerUrl = await readSavedSwaggerUrl();
      const variableConfig = await readVariableConfig();
      const nextConfig: WidgetConfig = {
        swaggerUrl: savedSwaggerUrl ?? variableConfig.swaggerUrl ?? swaggerUrl,
        method: variableConfig.method ?? "",
        path: variableConfig.path ?? "",
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

  async function handleLoadSpec(nextSwaggerUrl: string): Promise<void> {
    try {
      const actions = await loadSpecActions(nextSwaggerUrl);
      postUiMessage({ type: "actions", swaggerUrl: nextSwaggerUrl, actions });
    } catch (loadError) {
      postUiMessage({ type: "error", message: errorMessage(loadError) });
    }
  }

  async function applyConfigAndRender(nextConfig: WidgetConfig): Promise<void> {
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

  async function refreshConfig(nextConfig: WidgetConfig): Promise<void> {
    try {
      await renderEndpoint(requireRenderableConfig(nextConfig), true);
    } catch (refreshError) {
      postError(refreshError);
    }
  }

  async function renderEndpoint(nextConfig: GenerateInput, forceFetch = false): Promise<void> {
    setLoadingMessage(forceFetch ? "Refreshing endpoint..." : "Rendering endpoint...");

    try {
      setError("");
      const nextModel = await loadEndpoint(nextConfig, forceFetch);
      setModel(nextModel);
      await renameWidget(widgetNodeId, endpointCanvasName(nextModel));
      setLastUpdatedAt(new Date().toISOString());
      await saveSwaggerUrl(nextConfig.swaggerUrl);
      postUiMessage({ type: "done", layerName: `${nextModel.method} ${nextModel.path}`, action: forceFetch ? "Refreshed" : "Rendered" });
    } catch (refreshError) {
      postError(refreshError);
    } finally {
      setLoadingMessage("");
    }
  }

  function postError(rawError: unknown): void {
    const message = errorMessage(rawError);
    setError(message);
    postUiMessage({ type: "error", message });
  }

  function postUiMessage(message: unknown): void {
    try {
      figma.ui.postMessage(message);
    } catch {
      // Property menu refreshes can run while the configuration modal is closed.
    }
  }

  return (
    <AutoLayout
      name={model ? endpointCanvasName(model) : "OpenAPI Mini Viewer Widget"}
      direction="vertical"
      width={cardWidth}
      padding={0}
      spacing={0}
      fill={COLORS.white}
      stroke={COLORS.borderGreen}
      strokeWidth={2}
      overflow="visible"
    >
      {model?.tag ? <Title tag={model.tag} cardWidth={cardWidth} /> : null}
      <Header method={model?.method ?? method} path={model?.path ?? path} cardWidth={cardWidth} widthMode={widthMode} />
      {model?.description ? <EndpointDescription description={model.description} cardWidth={cardWidth} /> : null}
      {loadingMessage ? <StatusMessage message={loadingMessage} tone="muted" cardWidth={cardWidth} /> : null}
      {error ? <StatusMessage message={error} tone="error" cardWidth={cardWidth} /> : null}
      {!model ? <StatusMessage message="Configure or refresh to render an OpenAPI endpoint." tone="muted" cardWidth={cardWidth} /> : null}
      {model ? (
        <>
          <SectionTitle title="Parameters" cardWidth={cardWidth} />
          <SectionBody cardWidth={cardWidth}>
            {model.request ? <CodeBlock json={model.request.exampleJson} minWidth={codeMaxWidth} maxWidth={codeMaxWidth} /> : <MutedText>No request body parameters.</MutedText>}
          </SectionBody>
          <SectionTitle title="Responses" cardWidth={cardWidth} />
          <SectionBody cardWidth={cardWidth}>
            <AutoLayout direction="vertical" spacing={8} overflow="visible">
              {displayedResponses.map((response) => (
                <ResponseItem key={response.code} response={response} codeMaxWidth={responseCodeMaxWidth} />
              ))}
            </AutoLayout>
          </SectionBody>
        </>
      ) : null}
      <AutoLayout direction="horizontal" spacing={6} padding={{ top: 6, right: 6, bottom: 6, left: 6 }} fill={COLORS.white} width={cardWidth} verticalAlignItems="center">
        <Image name="UpKeepDay Icon" src={widgetIcon} width={16} height={16} />
        <ActionButton label="Configure" onClick={() => openConfigure(config, Boolean(model))} />
        <ActionButton label="Refresh" onClick={() => waitForTask(refreshConfig(config))} />
        <WidthButton mode={widthMode} onClick={() => setWidthMode(nextWidthMode(widthMode))} />
        {lastUpdatedAt ? <Text fontSize={10} fill={COLORS.text}>{formatUpdatedAt(lastUpdatedAt)}</Text> : null}
      </AutoLayout>
    </AutoLayout>
  );

  function openConfigure(currentConfig: WidgetConfig, canRefresh: boolean): void {
    waitForTask(new Promise<void>((resolve) => {
      let isClosed = false;
      let sessionConfig = currentConfig;
      const closeSession = () => {
        if (isClosed) return;
        isClosed = true;
        resolve();
      };

      figma.ui.onmessage = (message: unknown) => {
        let payload: PluginMessage | undefined;

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
          responseCodes: payload.responseCodes ?? []
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

function Title({ tag, cardWidth }: { tag: string; cardWidth: number }) {
  return (
    <AutoLayout width={cardWidth} height={60} padding={{ left: 10, right: 10 }} verticalAlignItems="center" fill={COLORS.white}>
      <Text fontSize={34} fontWeight="bold" fill={COLORS.text}>{tag}</Text>
    </AutoLayout>
  );
}

function Header({ method, path, cardWidth, widthMode }: { method: HttpMethod | ""; path: string; cardWidth: number; widthMode: WidthMode }) {
  if (widthMode === "compact") {
    return (
      <AutoLayout width={cardWidth} direction="vertical" spacing={8} padding={{ top: 8, right: 10, bottom: 10, left: 10 }} fill={COLORS.paleGreen} overflow="visible">
        <AutoLayout width={118} height={42} horizontalAlignItems="center" verticalAlignItems="center" cornerRadius={4} fill={methodColor(method)}>
          <Text fontSize={20} fontWeight="bold" fill={COLORS.white}>{method}</Text>
        </AutoLayout>
        <Text width={cardWidth - 20} fontSize={17} lineHeight={28} fontWeight="bold" fill={COLORS.text}>{path}</Text>
      </AutoLayout>
    );
  }

  return (
    <AutoLayout width={cardWidth} height={56} direction="horizontal" spacing={16} padding={{ top: 8, right: 10, bottom: 8, left: 4 }} verticalAlignItems="center" fill={COLORS.paleGreen}>
      <AutoLayout width={118} height={42} horizontalAlignItems="center" verticalAlignItems="center" cornerRadius={4} fill={methodColor(method)}>
        <Text fontSize={20} fontWeight="bold" fill={COLORS.white}>{method}</Text>
      </AutoLayout>
      <Text width={cardWidth - 154} fontSize={27} fontWeight="bold" fill={COLORS.text}>{path}</Text>
    </AutoLayout>
  );
}

function EndpointDescription({ description, cardWidth }: { description: string; cardWidth: number }) {
  return (
    <AutoLayout width={cardWidth} padding={{ top: 22, right: 32, bottom: 22, left: 32 }} fill={COLORS.paleGreen} overflow="visible">
      <Text width={cardWidth - 64} fontSize={20} lineHeight={28} fill={COLORS.text}>{description}</Text>
    </AutoLayout>
  );
}

function SectionTitle({ title, cardWidth }: { title: string; cardWidth: number }) {
  return (
    <AutoLayout width={cardWidth} padding={{ top: 6, right: 6, bottom: 4, left: 6 }} fill={COLORS.white}>
      <Text fontSize={20} fontWeight="bold" fill={COLORS.text}>{title}</Text>
    </AutoLayout>
  );
}

function SectionBody({ children, cardWidth }: { children: FigmaDeclarativeNode; cardWidth: number }) {
  return (
    <AutoLayout width={cardWidth} direction="vertical" padding={{ right: 6, bottom: 6, left: 6 }} spacing={6} fill={COLORS.paleGreenAlt} overflow="visible">
      {children}
    </AutoLayout>
  );
}

function CodeBlock({ json, minWidth, maxWidth = CODE_MAX_WIDTH }: { json: string; minWidth: number; maxWidth?: number }) {
  const width = codeBlockWidth(json, minWidth, maxWidth);
  const textWidth = width - CODE_HORIZONTAL_PADDING;
  const lines = wrapJsonLines(jsonToLines(json), Math.max(1, Math.floor(textWidth / CODE_CHAR_WIDTH)));
  const height = codeBlockHeight(lines.length);

  return (
    <AutoLayout width={width} height={height} direction="vertical" padding={{ top: 12, right: 14, bottom: 12, left: 14 }} fill={COLORS.codeBackground} cornerRadius={4} spacing={0}>
      {lines.map((line, index) => (
        <Text key={index} width={textWidth} height={CODE_LINE_HEIGHT} fontFamily="Roboto Mono" fontSize={CODE_FONT_SIZE} lineHeight={CODE_LINE_HEIGHT} fill={COLORS.white}>
          {line.length > 0 ? line.map((chunk, chunkIndex) => <Span key={chunkIndex} fill={chunkColor(chunk)}>{chunk.text}</Span>) : " "}
        </Text>
      ))}
    </AutoLayout>
  );
}

function ResponseItem({ response, codeMaxWidth }: { response: EndpointViewModel["responses"][number]; codeMaxWidth: number }) {
  return (
    <AutoLayout direction="horizontal" spacing={RESPONSE_ROW_GAP} overflow="visible" verticalAlignItems="start">
      <AutoLayout width={RESPONSE_CODE_LABEL_WIDTH} height={32} horizontalAlignItems="center" verticalAlignItems="center" fill={COLORS.white} stroke={COLORS.divider} strokeWidth={1} cornerRadius={4}>
        <Text fontSize={16} fontWeight="bold" fill={COLORS.text}>{response.code}</Text>
      </AutoLayout>
      <CodeBlock json={response.exampleJson} minWidth={codeMaxWidth} maxWidth={codeMaxWidth} />
    </AutoLayout>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <AutoLayout height={28} padding={{ left: 10, right: 10 }} cornerRadius={4} fill={COLORS.paleGreen} stroke={COLORS.borderGreen} strokeWidth={1} verticalAlignItems="center" horizontalAlignItems="center" onClick={onClick}>
      <Text fontSize={11} fontWeight="bold" fill={COLORS.text}>{label}</Text>
    </AutoLayout>
  );
}

function WidthButton({ mode, onClick }: { mode: WidthMode; onClick: () => void }) {
  return (
    <AutoLayout height={28} padding={{ left: 8, right: 8 }} cornerRadius={4} fill={COLORS.white} stroke={COLORS.divider} strokeWidth={1} verticalAlignItems="center" horizontalAlignItems="center" onClick={onClick}>
      <Text fontSize={11} fontWeight="bold" fill={COLORS.text}>{widthModeLabel(mode)} v</Text>
    </AutoLayout>
  );
}

function StatusMessage({ message, tone, cardWidth }: { message: string; tone: "error" | "muted"; cardWidth: number }) {
  return (
    <AutoLayout width={cardWidth} padding={{ top: 8, right: 8, bottom: 8, left: 8 }} fill={tone === "error" ? "#fff0ef" : COLORS.white}>
      <Text fontSize={12} fill={tone === "error" ? COLORS.red : COLORS.muted}>{message}</Text>
    </AutoLayout>
  );
}

function MutedText({ children }: { children: string }) {
  return <Text fontSize={15} fill={COLORS.muted}>{children}</Text>;
}

function cardWidthForMode(mode: WidthMode): number {
  if (mode === "compact") return 400;
  if (mode === "wide") return 1100;
  return 750;
}

function widthModeLabel(mode: WidthMode): string {
  return WIDTH_OPTIONS.find((option) => option.option === mode)?.label ?? "Standard";
}

function errorMessage(rawError: unknown): string {
  return rawError instanceof Error ? rawError.message : "Something went wrong.";
}

function nextWidthMode(mode: WidthMode): WidthMode {
  if (mode === "compact") return "standard";
  if (mode === "standard") return "wide";
  return "compact";
}

function isWidthMode(value: unknown): value is WidthMode {
  return value === "compact" || value === "standard" || value === "wide";
}

function methodColor(method: HttpMethod | ""): string {
  if (method === "GET") return COLORS.blue;
  if (method === "DELETE") return COLORS.red;
  if (method === "PUT") return COLORS.orange;
  return COLORS.methodGreen;
}

function chunkColor(chunk: JsonChunk): string {
  if (chunk.kind === "number") return COLORS.codeNumber;
  if (chunk.kind === "boolean") return COLORS.codeBoolean;
  if (chunk.kind === "string") return COLORS.codeString;
  return COLORS.white;
}

function codeBlockWidth(json: string, minWidth: number, maxWidth: number): number {
  const longestLine = json.split("\n").reduce((longest, line) => Math.max(longest, line.length), 0);
  const estimatedWidth = Math.ceil(longestLine * CODE_CHAR_WIDTH + CODE_HORIZONTAL_PADDING);
  return Math.min(Math.max(minWidth, estimatedWidth), maxWidth);
}

function codeBlockHeight(lineCount: number): number {
  return lineCount * CODE_LINE_HEIGHT + CODE_VERTICAL_PADDING;
}

function wrapJsonLines(lines: JsonChunk[][], maxCharacters: number): JsonChunk[][] {
  return lines.flatMap((line) => wrapJsonLine(line, maxCharacters));
}

function wrapJsonLine(line: JsonChunk[], maxCharacters: number): JsonChunk[][] {
  if (line.length === 0) return [[]];

  const wrapped: JsonChunk[][] = [];
  let currentLine: JsonChunk[] = [];
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
      currentLine.push({ ...chunk, text: nextText });
      currentLength += nextText.length;
      remainingText = remainingText.slice(nextText.length);
    }
  }

  wrapped.push(currentLine);
  return wrapped;
}

async function loadEndpoint(input: GenerateInput, forceFetch = false): Promise<EndpointViewModel> {
  const spec = await fetchSpec(input.swaggerUrl, forceFetch);
  return buildEndpointViewModel(spec, input);
}

async function loadSpecActions(swaggerUrl: string): Promise<SwaggerAction[]> {
  const spec = await fetchSpec(swaggerUrl, true);
  return extractSwaggerActions(spec);
}

async function renameWidget(widgetNodeId: string, name: string): Promise<void> {
  const node = await figma.getNodeByIdAsync(widgetNodeId);
  if (node?.type === "WIDGET") {
    node.name = name;
  }
}

function endpointCanvasName(endpoint: Pick<EndpointViewModel, "method" | "path" | "swaggerUrl">): string {
  return `${endpoint.method} ${endpoint.path} (${swaggerUrlName(endpoint.swaggerUrl)})`;
}

function swaggerUrlName(swaggerUrl: string): string {
  return swaggerUrl.replace(/^https?:\/\//i, "");
}

async function fetchSpec(swaggerUrl: string, forceFetch = false): Promise<unknown> {
  if (!forceFetch && cachedSpecUrl === swaggerUrl && cachedSpec !== undefined) {
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

function parseMessage(message: unknown): PluginMessage | undefined {
  if (typeof message !== "object" || message === null) return undefined;
  const candidate = message as Record<string, unknown>;

  if (candidate.type === "cancel") return { type: "cancel" };
  if (candidate.type === "refresh") return { type: "refresh" };
  if (candidate.type === "loadSpec" && typeof candidate.swaggerUrl === "string") {
    return { type: "loadSpec", swaggerUrl: candidate.swaggerUrl };
  }

  if (candidate.type !== "generate") return undefined;
  if (typeof candidate.swaggerUrl !== "string") return undefined;
  if (typeof candidate.path !== "string") return undefined;
  if (typeof candidate.method !== "string") return undefined;

  const responseCodes = Array.isArray(candidate.responseCodes)
    ? candidate.responseCodes.filter((code): code is string => typeof code === "string")
    : undefined;

  return {
    type: "generate",
    swaggerUrl: candidate.swaggerUrl,
    path: candidate.path,
    method: normalizeMethod(candidate.method),
    responseCodes
  };
}

async function readVariableConfig(): Promise<Partial<GenerateInput>> {
  const variables = await figma.variables.getLocalVariablesAsync("STRING");
  const swaggerUrl = variableStringValue(variables, "SwaggerUrl");
  const methodValue = variableStringValue(variables, "ApiAction");
  const path = variableStringValue(variables, "ApiPath");
  let method: HttpMethod | undefined;

  if (methodValue) {
    try {
      method = normalizeMethod(methodValue);
    } catch {
      method = undefined;
    }
  }

  return { swaggerUrl, method, path };
}

async function readSavedSwaggerUrl(): Promise<string | undefined> {
  const savedValue = await figma.clientStorage.getAsync(LAST_CONFIG_STORAGE_KEY);
  const savedSwaggerUrl = savedSwaggerUrlFromStorage(savedValue);
  return savedSwaggerUrl?.trim() || undefined;
}

async function saveSwaggerUrl(swaggerUrl: string): Promise<void> {
  await figma.clientStorage.setAsync(LAST_CONFIG_STORAGE_KEY, swaggerUrl);
}

function savedSwaggerUrlFromStorage(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;

  const candidate = value as Record<string, unknown>;
  return typeof candidate.swaggerUrl === "string" ? candidate.swaggerUrl : undefined;
}

function requireRenderableConfig(config: WidgetConfig): GenerateInput {
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

function variableStringValue(variables: Variable[], name: string): string | undefined {
  const variable = variables.find((candidate) => candidate.name === name || candidate.name.endsWith(`/${name}`));
  if (!variable) return undefined;

  const firstValue = Object.values(variable.valuesByMode).find((value): value is string => typeof value === "string");
  return firstValue?.trim() || undefined;
}

function formatUpdatedAt(value: string): string {
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
