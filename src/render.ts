import type { BodyExample, EndpointViewModel, HttpMethod } from "./openapi";
import { highlightJson, type JsonTokenKind } from "./jsonHighlight";

const COLORS = {
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

const FONT: FontName = { family: "Inter", style: "Regular" };
const FONT_BOLD: FontName = { family: "Inter", style: "Bold" };
const FONT_ITALIC: FontName = { family: "Inter", style: "Italic" };
const FONT_MONO: FontName = { family: "Roboto Mono", style: "Regular" };
const CARD_WIDTH = 760;
const CODE_MIN_WIDTH = CARD_WIDTH - 12;
const CODE_MAX_WIDTH = 1800;
const CODE_FONT_SIZE = 14;
const CODE_LINE_HEIGHT = 20;
const CODE_HORIZONTAL_PADDING = 28;
const CODE_VERTICAL_PADDING = 24;
const CODE_CHAR_WIDTH = 8.1;
let codeFont: FontName = FONT_MONO;

export type RenderOptions = {
  replaceNode?: FrameNode;
};

export async function renderEndpointCard(model: EndpointViewModel, options: RenderOptions = {}): Promise<FrameNode> {
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

function createTitle(tag: string): FrameNode {
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

function createHeader(method: HttpMethod, path: string): FrameNode {
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

function createCompactSectionTitle(title: string): FrameNode {
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

function createRequestSection(request: BodyExample | undefined): FrameNode {
  const section = createCompactBody("Parameters Body");

  if (!request) {
    section.appendChild(createEmptyState("No request body parameters."));
    return section;
  }

  section.appendChild(createCodeBlock(request.exampleJson));

  return section;
}

function createResponseSection(model: EndpointViewModel): FrameNode {
  const section = createCompactBody("Responses Body");
  section.appendChild(createCodeBlock(model.response.exampleJson));

  return section;
}

function createCompactBody(name: string): FrameNode {
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

function createCodeBlock(json: string): FrameNode {
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

function createEmptyState(message: string): TextNode {
  const text = createText(message, 15, FONT, COLORS.muted);
  text.textAutoResize = "WIDTH_AND_HEIGHT";
  return text;
}

function createText(characters: string, size: number, fontName: FontName, color: RGB): TextNode {
  const text = figma.createText();
  text.fontName = fontName;
  text.fontSize = size;
  text.characters = characters;
  text.fills = [{ type: "SOLID", color }];
  return text;
}

function methodColor(method: HttpMethod): RGB {
  if (method === "GET") return rgb(0.38, 0.65, 0.98);
  if (method === "DELETE") return rgb(0.95, 0.38, 0.34);
  if (method === "PUT") return rgb(0.96, 0.66, 0.25);
  return COLORS.methodGreen;
}

async function loadFonts(): Promise<void> {
  await Promise.all([
    figma.loadFontAsync(FONT),
    figma.loadFontAsync(FONT_BOLD),
    figma.loadFontAsync(FONT_ITALIC)
  ]);

  try {
    await figma.loadFontAsync(FONT_MONO);
    codeFont = FONT_MONO;
  } catch {
    codeFont = FONT;
  }
}

function insertCard(card: FrameNode, replaceNode?: FrameNode): void {
  if (replaceNode?.parent) {
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

function positionCard(card: FrameNode): void {
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

function rgb(r: number, g: number, b: number): RGB {
  return { r, g, b };
}

function codeBlockWidth(json: string): number {
  const longestLine = json.split("\n").reduce((longest, line) => Math.max(longest, line.length), 0);
  const estimatedWidth = Math.ceil(longestLine * CODE_CHAR_WIDTH + CODE_HORIZONTAL_PADDING);
  return Math.min(Math.max(CODE_MIN_WIDTH, estimatedWidth), CODE_MAX_WIDTH);
}

function codeBlockHeight(json: string): number {
  const lineCount = Math.max(1, json.split("\n").length);
  return lineCount * CODE_LINE_HEIGHT + CODE_VERTICAL_PADDING;
}

function applyJsonHighlighting(text: TextNode, json: string): void {
  for (const range of highlightJson(json)) {
    text.setRangeFills(range.start, range.end, [{
      type: "SOLID",
      color: codeTokenColor(range.kind)
    }]);
  }
}

function codeTokenColor(kind: JsonTokenKind): RGB {
  if (kind === "number") return COLORS.codeNumber;
  if (kind === "boolean") return COLORS.codeBoolean;
  return COLORS.codeString;
}
