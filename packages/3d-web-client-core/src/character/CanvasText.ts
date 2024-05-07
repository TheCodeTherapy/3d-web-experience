import { Texture, LinearFilter, RGBAFormat, MeshBasicMaterial } from "three";

type RGBA = {
  r: number;
  g: number;
  b: number;
  a: number;
};

type CanvasTextOptions = {
  fontSize: number;
  textColorRGB255A1: RGBA;
  backgroundColorRGB255A1?: RGBA;
  font?: string;
  bold?: boolean;
  paddingPx?: number;
  alignment?: string;
  dimensions?: {
    width: number;
    height: number;
  };
};

function getTextAlignOffset(textAlign: CanvasTextAlign, width: number) {
  switch (textAlign) {
    case "center":
      return width / 2;
    case "right":
      return width;
    default:
      return 0;
  }
}

function printAtWordWrap(
  context: CanvasRenderingContext2D,
  fullText: string,
  x: number,
  y: number,
  lineHeight: number,
  fitWidth: number,
  padding: number,
  alignment: string,
) {
  const lines = fullText.split("\n");
  let currentLine = 0;
  for (const text of lines) {
    fitWidth = fitWidth || 0;

    if (fitWidth <= 0) {
      context.fillText(text, x, y + lineHeight * currentLine);
      currentLine++;
      continue;
    }
    let words = text.split(" ");
    let lastWordIndex = 1;
    while (words.length > 0 && lastWordIndex <= words.length) {
      const str = words.slice(0, lastWordIndex).join(" ");
      const textWidth = context.measureText(str).width;
      if (textWidth + padding * 2 > fitWidth) {
        if (lastWordIndex === 1) {
          lastWordIndex = 2;
        }
        context.fillText(
          words.slice(0, lastWordIndex - 1).join(" "),
          x + padding,
          y + lineHeight * currentLine + padding,
        );
        currentLine++;
        words = words.splice(lastWordIndex - 1);
        lastWordIndex = 1;
      } else {
        lastWordIndex++;
      }
    }
    if (lastWordIndex > 0 && words.length > 0) {
      const xOffset = alignment === "center" ? 0 : padding;
      context.fillText(words.join(" "), x + xOffset, y + lineHeight * currentLine + padding);
      currentLine++;
    }
  }
}

export function CanvasText(message: string, options: CanvasTextOptions): HTMLCanvasElement {
  const fontsize = options.fontSize;
  const textColor = options.textColorRGB255A1;
  const backgroundColor = options.backgroundColorRGB255A1 || { r: 255, g: 255, b: 255, a: 1 };
  const padding = options.paddingPx || 0;
  const font = options.font || "Arial";
  const fontString = (options.bold ? "bold " : "") + fontsize + "px " + font;

  const canvas = document.createElement("canvas");
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const ct = canvas.getContext("2d")!;

  // calculate text alignment offset
  const textAlign = (options.alignment as CanvasTextAlign) ?? "left";

  if (options.dimensions) {
    // NOTE: setting the canvas dimensions resets the context properties, so
    // we always do it first
    canvas.width = options.dimensions.width;
    canvas.height = options.dimensions.height;
    ct.clearRect(0, 0, canvas.width, canvas.height);
    ct.font = fontString;
    ct.textAlign = textAlign;
    ct.fillStyle = `rgba(${backgroundColor.r}, ${backgroundColor.g}, ${backgroundColor.b}, ${backgroundColor.a})`;
    ct.lineWidth = 0;
    ct.fillRect(0, 0, canvas.width, canvas.height);
    ct.fillStyle = `rgba(${textColor.r}, ${textColor.g}, ${textColor.b}, ${textColor.a})`;
    ct.font = fontString;
    printAtWordWrap(
      ct,
      message,
      getTextAlignOffset(textAlign, canvas.width),
      fontsize,
      fontsize,
      canvas.width,
      padding,
      textAlign,
    );
  } else {
    // NOTE: setting the canvas dimensions resets the context properties, so
    // we always do it first. However, we also need to take into account the
    // font size to measure the text in the first place.
    ct.font = fontString;
    const metrics = ct.measureText(message);
    const textWidth = metrics.width;
    const textHeight = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
    canvas.width = textWidth + padding * 2;
    canvas.height = textHeight + padding;
    ct.clearRect(0, 0, canvas.width, canvas.height);
    ct.font = fontString;
    ct.textAlign = textAlign;
    ct.fillStyle = `rgba(${backgroundColor.r}, ${backgroundColor.g}, ${backgroundColor.b}, ${backgroundColor.a})`;
    ct.lineWidth = 0;
    ct.fillRect(0, 0, canvas.width, canvas.height);
    ct.fillStyle = `rgba(${textColor.r}, ${textColor.g}, ${textColor.b}, ${textColor.a})`;
    ct.font = fontString;
    ct.fillText(message, padding + getTextAlignOffset(textAlign, textWidth), textHeight);
  }

  return canvas;
}

export function THREECanvasTextTexture(
  text: string,
  options: CanvasTextOptions,
): { texture: Texture; width: number; height: number } {
  const canvas = CanvasText(text, options);

  const texture = new Texture(canvas);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.format = RGBAFormat;
  texture.needsUpdate = true;

  return { texture, width: canvas.width, height: canvas.height };
}

export function THREECanvasTextMaterial(
  text: string,
  options: CanvasTextOptions,
): { material: MeshBasicMaterial; width: number; height: number } {
  const { texture, width, height } = THREECanvasTextTexture(text, options);

  const material = new MeshBasicMaterial();
  material.map = texture;
  material.transparent = true;
  material.depthWrite = false;
  material.needsUpdate = true;

  return { material, width, height };
}
