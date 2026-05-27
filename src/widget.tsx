import { buildEndpointViewModel, extractSwaggerActions, normalizeMethod, type EndpointViewModel, type GenerateInput, type HttpMethod, type SwaggerAction } from "./openapi";
import { jsonToLines, type JsonChunk } from "./widgetJson";
import widgetIcon from "../assets/upkeepday-widget-icon.png";
import copyIcon from "../assets/copy-alt.png";
import refreshIcon from "../assets/refresh-icon.png";
import settingsIcon from "../assets/settings-icon.png";
import textBlackIcon from "../assets/text-black.png";
import textWhiteIcon from "../assets/text-white.png";
import typescriptIcon from "../assets/typescript-icon.png";
import widthChevronIcon from "../assets/width-chevron-icon.png";

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
type SampleTheme = "dark" | "light";
type TypescriptModelTab = "Payload" | "Response";

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
  const [sampleTheme, setSampleTheme] = useSyncedState<SampleTheme>("sampleTheme", "dark");

  const config: WidgetConfig = { swaggerUrl, method, path, responseCodes };
  const displayedResponses = model?.responses ?? (model?.response ? [model.response] : []);
  const cardWidth = cardWidthForMode(widthMode);
  const codeMaxWidth = cardWidth - 12;
  const responseCodeMaxWidth = codeMaxWidth - RESPONSE_CODE_LABEL_WIDTH - RESPONSE_ROW_GAP;
  const copyablePath = (model?.path ?? path).trim();
  const activeMethod = model?.method ?? method;
  const activePath = (model?.path ?? path).trim();
  const nextSampleThemeValue = nextSampleTheme(sampleTheme);
  const themeToggleIcon = nextSampleThemeValue === "light" ? textBlackIcon : textWhiteIcon;
  const themeToggleLabel = nextSampleThemeValue === "light" ? "Light Samples" : "Dark Samples";
  const refreshStatusText = loadingMessage === "Refreshing endpoint..." && activeMethod && activePath ? `Refreshing: ${activeMethod} ${activePath}` : "";
  const payloadTypescriptModel = model?.request?.typescriptModel;
  const responseTypescriptModel = model?.responseTypescriptModel;

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
    })());
  });

  const propertyMenuItems: WidgetPropertyMenuItem[] = [
    { itemType: "action", propertyName: "configure", tooltip: "Configure" }
  ];

  if (model) {
    propertyMenuItems.push(
      { itemType: "action", propertyName: "refresh", tooltip: "Refresh" },
      {
        itemType: "dropdown",
        propertyName: "widthMode",
        tooltip: "Width",
        options: WIDTH_OPTIONS,
        selectedOption: widthMode
      }
    );
  }

  usePropertyMenu(propertyMenuItems, ({ propertyName, propertyValue }) => {
    if (propertyName === "configure") {
      openConfigure(config, Boolean(model));
    }

    if (propertyName === "refresh" && model) {
      waitForTask(refreshConfig(config));
    }

    if (propertyName === "widthMode" && model && isWidthMode(propertyValue)) {
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
      // Refreshes can run while the configuration modal is closed.
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
      onClick={!model ? () => openConfigure(config, false) : undefined}
    >
      {model?.tag ? <Title tag={model.tag} cardWidth={cardWidth} /> : null}
      <Header method={model?.method ?? method} path={model?.path ?? path} cardWidth={cardWidth} widthMode={widthMode} />
      {model?.description ? <EndpointDescription description={model.description} cardWidth={cardWidth} /> : null}
      {loadingMessage && !refreshStatusText ? <StatusMessage message={loadingMessage} tone="muted" cardWidth={cardWidth} /> : null}
      {error ? <StatusMessage message={error} tone="error" cardWidth={cardWidth} /> : null}
      {!model ? <StatusMessage message="Click to configure an OpenAPI endpoint." tone="muted" cardWidth={cardWidth} /> : null}
      {model ? (
        <>
          <SectionTitle title="Parameters" cardWidth={cardWidth} />
          <SectionBody cardWidth={cardWidth}>
            {model.request ? (
              <CodeBlock
                json={model.request.exampleJson}
                minWidth={codeMaxWidth}
                maxWidth={codeMaxWidth}
                theme={sampleTheme}
                action={payloadTypescriptModel ? <CodeIconActionButton label="Payload TypeScript" iconSrc={typescriptIcon} onClick={() => openCopyTypescriptDialog("Payload")} /> : undefined}
              />
            ) : <MutedText>No request body parameters.</MutedText>}
          </SectionBody>
          <SectionTitle title="Responses" cardWidth={cardWidth} />
          <SectionBody cardWidth={cardWidth}>
            <AutoLayout direction="vertical" spacing={8} overflow="visible">
              {displayedResponses.map((response, index) => (
                <ResponseItem
                  key={response.code}
                  response={response}
                  codeMaxWidth={responseCodeMaxWidth}
                  theme={sampleTheme}
                  action={index === 0 && responseTypescriptModel ? <CodeIconActionButton label="Response TypeScript" iconSrc={typescriptIcon} onClick={() => openCopyTypescriptDialog("Response")} /> : undefined}
                />
              ))}
            </AutoLayout>
          </SectionBody>
        </>
      ) : null}
      <AutoLayout direction="horizontal" spacing={6} padding={{ top: 6, right: 6, bottom: 6, left: 6 }} fill={COLORS.white} width={cardWidth} verticalAlignItems="center">
        <Image name="UpKeepDay Icon" src={widgetIcon} width={16} height={16} />
        <IconActionButton label="Configure" iconSrc={settingsIcon} onClick={() => openConfigure(config, Boolean(model))} />
        <IconActionButton label="Refresh" iconSrc={refreshIcon} onClick={() => waitForTask(refreshConfig(config))} />
        {copyablePath ? <IconActionButton label="Copy Path" iconSrc={copyIcon} onClick={() => openCopyPathDialog(copyablePath)} /> : null}
        <IconActionButton label={themeToggleLabel} iconSrc={themeToggleIcon} onClick={() => setSampleTheme(nextSampleThemeValue)} />
        <WidthButton mode={widthMode} onClick={() => setWidthMode(nextWidthMode(widthMode))} />
        {lastUpdatedAt ? <Text fontSize={10} fill={COLORS.text}>{formatUpdatedAt(lastUpdatedAt)}</Text> : null}
      </AutoLayout>
      {refreshStatusText ? <FooterStatusMessage message={refreshStatusText} cardWidth={cardWidth} /> : null}
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

  function openCopyPathDialog(pathToCopy: string): void {
    waitForTask(new Promise<void>((resolve) => {
      let isClosed = false;

      const closeSession = () => {
        if (isClosed) return;
        isClosed = true;
        figma.ui.hide();
        resolve();
      };

      figma.ui.onmessage = (message: unknown) => {
        if (typeof message !== "object" || message === null) return;
        const payload = message as Record<string, unknown>;

        if (payload.type === "copied") {
          figma.notify("Path copied.");
          closeSession();
          return;
        }

        if (payload.type === "copy-error") {
          figma.notify(typeof payload.message === "string" ? payload.message : "Unable to copy path.");
          closeSession();
          return;
        }

        if (payload.type === "close") {
          closeSession();
        }
      };

      figma.showUI(copyPathDialogHtml(pathToCopy), { width: 260, height: 104, themeColors: true });
    }));
  }

  function openCopyTypescriptDialog(activeTab: TypescriptModelTab): void {
    waitForTask(new Promise<void>((resolve) => {
      let isClosed = false;

      const closeSession = () => {
        if (isClosed) return;
        isClosed = true;
        figma.ui.hide();
        resolve();
      };

      figma.ui.onmessage = (message: unknown) => {
        if (typeof message !== "object" || message === null) return;
        const payload = message as Record<string, unknown>;

        if (payload.type === "copied") {
          const copiedLabel = payload.label === "Response" ? "Response" : "Payload";
          figma.notify(`${copiedLabel} TypeScript copied.`);
          closeSession();
          return;
        }

        if (payload.type === "copy-error") {
          figma.notify(typeof payload.message === "string" ? payload.message : "Unable to copy TypeScript.");
          closeSession();
          return;
        }

        if (payload.type === "close") {
          closeSession();
        }
      };

      figma.showUI(copyTypescriptDialogHtml({
        activeTab,
        payloadModel: payloadTypescriptModel,
        responseModel: responseTypescriptModel
      }), { width: 420, height: 296, themeColors: true });
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
        <Text width={cardWidth - 20} fontSize={compactPathFontSize(path)} lineHeight={28} fontWeight="bold" fill={COLORS.text}>{path}</Text>
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

function CodeBlock({ json, minWidth, maxWidth = CODE_MAX_WIDTH, theme, action }: { json: string; minWidth: number; maxWidth?: number; theme: SampleTheme; action?: FigmaDeclarativeNode }) {
  const width = codeBlockWidth(json, minWidth, maxWidth);
  const topPadding = action ? 6 : 12;
  const rightPadding = action ? 6 : 14;
  const bottomPadding = 12;
  const leftPadding = 14;
  const textWidth = width - leftPadding - rightPadding;
  const lines = wrapJsonLines(jsonToLines(json), Math.max(1, Math.floor(textWidth / CODE_CHAR_WIDTH)));
  const firstLineHeight = CODE_LINE_HEIGHT;
  const remainingLines = action ? lines.slice(1) : lines;
  const height = action
    ? topPadding + bottomPadding + firstLineHeight + remainingLines.length * CODE_LINE_HEIGHT
    : codeBlockHeight(lines.length);
  const palette = codeTheme(theme);
  const firstLine = lines[0] ?? [];
  const firstLineTextWidth = action ? Math.max(1, textWidth - 24) : textWidth;

  return (
    <AutoLayout width={width} height={height} direction="vertical" padding={{ top: topPadding, right: rightPadding, bottom: bottomPadding, left: leftPadding }} fill={palette.background} stroke={palette.stroke} strokeWidth={palette.strokeWidth} cornerRadius={4} spacing={0}>
      {action ? (
        <AutoLayout width={textWidth} height={firstLineHeight} direction="horizontal" verticalAlignItems="start" spacing={4} overflow="visible">
          <Text width={firstLineTextWidth} height={CODE_LINE_HEIGHT} fontFamily="Roboto Mono" fontSize={CODE_FONT_SIZE} lineHeight={CODE_LINE_HEIGHT} fill={palette.baseText}>
            {firstLine.length > 0 ? firstLine.map((chunk, chunkIndex) => <Span key={chunkIndex} fill={chunkColor(chunk, theme)}>{chunk.text}</Span>) : " "}
          </Text>
          {action}
        </AutoLayout>
      ) : null}
      {remainingLines.map((line, index) => (
        <Text key={index} width={textWidth} height={CODE_LINE_HEIGHT} fontFamily="Roboto Mono" fontSize={CODE_FONT_SIZE} lineHeight={CODE_LINE_HEIGHT} fill={palette.baseText}>
          {line.length > 0 ? line.map((chunk, chunkIndex) => <Span key={chunkIndex} fill={chunkColor(chunk, theme)}>{chunk.text}</Span>) : " "}
        </Text>
      ))}
    </AutoLayout>
  );
}

function ResponseItem({ response, codeMaxWidth, theme, action }: { response: EndpointViewModel["responses"][number]; codeMaxWidth: number; theme: SampleTheme; action?: FigmaDeclarativeNode }) {
  return (
    <AutoLayout direction="horizontal" spacing={RESPONSE_ROW_GAP} overflow="visible" verticalAlignItems="start">
      <AutoLayout width={RESPONSE_CODE_LABEL_WIDTH} height={32} horizontalAlignItems="center" verticalAlignItems="center" fill={COLORS.white} stroke={COLORS.divider} strokeWidth={1} cornerRadius={4}>
        <Text fontSize={16} fontWeight="bold" fill={COLORS.text}>{response.code}</Text>
      </AutoLayout>
      <CodeBlock json={response.exampleJson} minWidth={codeMaxWidth} maxWidth={codeMaxWidth} theme={theme} action={action} />
    </AutoLayout>
  );
}

function IconActionButton({ label, iconSrc, onClick }: { label: string; iconSrc: string; onClick: () => void }) {
  return (
    <AutoLayout
      name={label}
      width={28}
      height={28}
      cornerRadius={4}
      fill={COLORS.paleGreen}
      stroke={COLORS.borderGreen}
      strokeWidth={1}
      verticalAlignItems="center"
      horizontalAlignItems="center"
      onClick={onClick}
    >
      <Image name={label} src={iconSrc} width={14} height={14} />
    </AutoLayout>
  );
}

function CodeIconActionButton({ label, iconSrc, onClick }: { label: string; iconSrc: string; onClick: () => void }) {
  return (
    <AutoLayout
      name={label}
      width={20}
      height={20}
      cornerRadius={4}
      stroke={COLORS.borderGreen}
      strokeWidth={1}
      verticalAlignItems="center"
      horizontalAlignItems="center"
      onClick={onClick}
    >
      <Image name={label} src={iconSrc} width={20} height={20} />
    </AutoLayout>
  );
}

function WidthButton({ mode, onClick }: { mode: WidthMode; onClick: () => void }) {
  return (
    <AutoLayout height={28} padding={{ left: 8, right: 8 }} spacing={6} cornerRadius={4} fill={COLORS.white} stroke={COLORS.divider} strokeWidth={1} verticalAlignItems="center" horizontalAlignItems="center" onClick={onClick}>
      <Text fontSize={11} fontWeight="bold" fill={COLORS.text}>{widthModeLabel(mode)}</Text>
      <Image name="Width Menu" src={widthChevronIcon} width={12} height={12} />
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

function FooterStatusMessage({ message, cardWidth }: { message: string; cardWidth: number }) {
  return (
    <AutoLayout width={cardWidth} padding={{ top: 4, right: 6, bottom: 6, left: 6 }} fill={COLORS.white}>
      <Text fontSize={10} fill={COLORS.text}>{message}</Text>
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
  if (mode === "compact") {
    return "Compact";
  }
  if (mode === "wide") {
    return "Wide";
  }
  return "Standard";
}

function compactPathFontSize(path: string): number {
  const length = path.length;
  if (length >= 40) return 17;
  if (length >= 37) return 18;
  if (length >= 33) return 19;
  if (length >= 29) return 20;
  if (length >= 25) return 21;
  return 22;
}

function copyPathDialogHtml(pathToCopy: string): string {
  const pathJson = JSON.stringify(pathToCopy);
  const iconJson = JSON.stringify(copyIcon);
  const closeIconJson = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAOdEVYdFNvZnR3YXJlAEZpZ21hnrGWYwAAAMxJREFUeAHFlcsNwjAMhu1MkjE4wo0RuHayXhmBWzkyRjYJNglSBUlr17VqqVJru9+fp42n6y1mzCNmHF6Pe4IdbM4MQC/kO5Nj4gAYrcKnyhwDkAp9JHqiVWQGj8zkGWAncNEuV4+BawkWOMdQmrgF/iegFZHk4tYfpQNpCqwBNLPsCvRA7Nfs06JAS6S6RXCRQEMEQHGMAzjbsUvkusmux9T1ormWCtdi51quXRvOHvAlkW/TN8PZPiMudyVB6fGl6SPg0wr/FanM4Q2232Ehuj7+RgAAAABJRU5ErkJggg==";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 14px;
        color: #2f3442;
        background: #ffffff;
      }
      .layout {
        display: grid;
        gap: 10px;
      }
      .path {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        font-weight: 600;
      }
      .actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        font-size: 14px;
        font-weight: 700;
      }
      .copy-button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .copy-button img {
        width: 14px;
        height: 14px;
      }
      .close-button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .close-button img {
        width: 14px;
        height: 14px;
      }
      button {
        height: 34px;
        border: 1px solid #18a058;
        border-radius: 6px;
        padding: 0 12px;
        color: #2f3442;
        background: #e8f7ef;
        font: inherit;
        font-weight: 700;
      }
      .cancel {
        border-color: #c8cbd2;
        background: #ffffff;
      }
    </style>
  </head>
  <body>
    <div class="layout">
      <div class="path">${escapeHtml(pathToCopy)}</div>
      <div class="actions">
        <span class="path-label">Path:</span>
        <button class="copy-button" type="button" id="copy">Copy <img src=${iconJson} alt="" /></button>
        <button class="cancel close-button" type="button" id="cancel">Close <img src=${closeIconJson} alt="" /></button>
      </div>
    </div>
    <script>
      const value = ${pathJson};
      async function copyText(text) {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          await navigator.clipboard.writeText(text);
          return;
        }

        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        textarea.style.pointerEvents = "none";
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);

        try {
          if (!document.execCommand("copy")) {
            throw new Error("Unable to copy path.");
          }
        } finally {
          document.body.removeChild(textarea);
        }
      }
      document.getElementById("copy").addEventListener("click", async () => {
        try {
          await copyText(value);
          parent.postMessage({ pluginMessage: { type: "copied" } }, "*");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to copy path.";
          parent.postMessage({ pluginMessage: { type: "copy-error", message } }, "*");
        }
      });
      document.getElementById("cancel").addEventListener("click", () => {
        parent.postMessage({ pluginMessage: { type: "close" } }, "*");
      });
    </script>
  </body>
</html>`;
}

function copyTypescriptDialogHtml({ activeTab, payloadModel, responseModel }: { activeTab: TypescriptModelTab; payloadModel?: string; responseModel?: string }): string {
  const modelsJson = JSON.stringify({
    Payload: payloadModel ?? "",
    Response: responseModel ?? ""
  });
  const activeTabJson = JSON.stringify(activeTab);
  const iconJson = JSON.stringify(typescriptIcon);
  const closeIconJson = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAOdEVYdFNvZnR3YXJlAEZpZ21hnrGWYwAAAMxJREFUeAHFlcsNwjAMhu1MkjE4wo0RuHayXhmBWzkyRjYJNglSBUlr17VqqVJru9+fp42n6y1mzCNmHF6Pe4IdbM4MQC/kO5Nj4gAYrcKnyhwDkAp9JHqiVWQGj8zkGWAncNEuV4+BawkWOMdQmrgF/iegFZHk4tYfpQNpCqwBNLPsCvRA7Nfs06JAS6S6RXCRQEMEQHGMAzjbsUvkusmux9T1ormWCtdi51quXRvOHvAlkW/TN8PZPiMudyVB6fGl6SPg0wr/FanM4Q2232Ehuj7+RgAAAABJRU5ErkJggg==";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 14px;
        color: #2f3442;
        background: #ffffff;
      }
      .layout {
        display: grid;
        gap: 10px;
      }
      .tabs {
        display: flex;
        gap: 6px;
      }
      .tab {
        height: 30px;
        border-color: #c8cbd2;
        background: #ffffff;
        font-size: 12px;
      }
      .tab.active {
        border-color: #18a058;
        background: #e8f7ef;
      }
      .tab:disabled {
        opacity: 0.45;
      }
      pre {
        height: 161px;
        margin: 0;
        overflow: auto;
        border: 1px solid #c8cbd2;
        border-radius: 6px;
        padding: 10px;
        background: #f8faf9;
        color: #2f3442;
        font: 11px/16px "Roboto Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        white-space: pre;
      }
      .actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        font-size: 14px;
        font-weight: 700;
      }
      button {
        height: 34px;
        border: 1px solid #18a058;
        border-radius: 6px;
        padding: 0 12px;
        color: #2f3442;
        background: #e8f7ef;
        font: inherit;
        font-weight: 700;
      }
      .copy-button,
      .close-button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .copy-button img,
      .close-button img {
        width: 14px;
        height: 14px;
      }
      .cancel {
        border-color: #c8cbd2;
        background: #ffffff;
      }
    </style>
  </head>
  <body>
    <div class="layout">
      <div class="tabs">
        <button class="tab" type="button" id="payloadTab">Payload Model</button>
        <button class="tab" type="button" id="responseTab">Response Model</button>
      </div>
      <pre id="preview"></pre>
      <div class="actions">
        <button class="copy-button" type="button" id="copy">Copy <img src=${iconJson} alt="" /></button>
        <button class="cancel close-button" type="button" id="cancel">Close <img src=${closeIconJson} alt="" /></button>
      </div>
    </div>
    <script>
      const models = ${modelsJson};
      let activeTab = ${activeTabJson};
      const preview = document.getElementById("preview");
      const payloadTab = document.getElementById("payloadTab");
      const responseTab = document.getElementById("responseTab");
      const copyButton = document.getElementById("copy");

      function modelFor(tab) {
        return models[tab] || "";
      }

      function renderTab() {
        if (!modelFor(activeTab)) {
          activeTab = modelFor("Payload") ? "Payload" : "Response";
        }

        const activeModel = modelFor(activeTab);
        preview.textContent = activeModel || "No TypeScript model available.";
        payloadTab.classList.toggle("active", activeTab === "Payload");
        responseTab.classList.toggle("active", activeTab === "Response");
        payloadTab.disabled = !modelFor("Payload");
        responseTab.disabled = !modelFor("Response");
        copyButton.disabled = !activeModel;
      }

      async function copyText(text) {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          await navigator.clipboard.writeText(text);
          return;
        }

        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        textarea.style.pointerEvents = "none";
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);

        try {
          if (!document.execCommand("copy")) {
            throw new Error("Unable to copy TypeScript model.");
          }
        } finally {
          document.body.removeChild(textarea);
        }
      }
      payloadTab.addEventListener("click", () => {
        activeTab = "Payload";
        renderTab();
      });
      responseTab.addEventListener("click", () => {
        activeTab = "Response";
        renderTab();
      });
      copyButton.addEventListener("click", async () => {
        try {
          await copyText(modelFor(activeTab));
          parent.postMessage({ pluginMessage: { type: "copied", label: activeTab } }, "*");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to copy TypeScript model.";
          parent.postMessage({ pluginMessage: { type: "copy-error", message } }, "*");
        }
      });
      document.getElementById("cancel").addEventListener("click", () => {
        parent.postMessage({ pluginMessage: { type: "close" } }, "*");
      });
      renderTab();
    </script>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function errorMessage(rawError: unknown): string {
  return rawError instanceof Error ? rawError.message : "Something went wrong.";
}

function nextWidthMode(mode: WidthMode): WidthMode {
  if (mode === "compact") return "standard";
  if (mode === "standard") return "wide";
  return "compact";
}

function nextSampleTheme(theme: SampleTheme): SampleTheme {
  return theme === "dark" ? "light" : "dark";
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

function chunkColor(chunk: JsonChunk, theme: SampleTheme): string {
  const palette = codeTheme(theme);
  if (chunk.kind === "number") return palette.number;
  if (chunk.kind === "boolean") return palette.boolean;
  if (chunk.kind === "string") return palette.string;
  return palette.baseText;
}

function codeTheme(theme: SampleTheme): {
  background: string;
  baseText: string;
  number: string;
  string: string;
  boolean: string;
  stroke: string;
  strokeWidth: number;
} {
  if (theme === "light") {
    return {
      background: "#ffffff",
      baseText: COLORS.text,
      number: "#d94841",
      string: "#2f9e44",
      boolean: "#d97706",
      stroke: "#c8cbd2",
      strokeWidth: 1
    };
  }

  return {
    background: COLORS.codeBackground,
    baseText: COLORS.white,
    number: COLORS.codeNumber,
    string: COLORS.codeString,
    boolean: COLORS.codeBoolean,
    stroke: COLORS.codeBackground,
    strokeWidth: 0
  };
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
