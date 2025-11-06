import { Color, FrontSide, LinearFilter, Sprite, SpriteMaterial } from "three";

import { THREECanvasTextTexture } from "./CanvasText";

enum LabelAlignment {
  left = "left",
  center = "center",
  right = "right",
}

const fontScale = 5;
const defaultLabelColor = new Color(0x000000);
const defaultFontColor = new Color(0xffffff);
const defaultLabelAlignment = LabelAlignment.center;
const defaultLabelFontSize = 10;
const defaultLabelPadding = 10;
const defaultVisibleOpacity = 0.85;
const defaultSecondsToFadeOut = null;

export type CharacterTooltipConfig = {
  alignment: LabelAlignment;
  fontSize: number;
  padding: number;
  color: Color;
  fontColor: Color;
  visibleOpacity: number;
  maxWidth?: number;
  secondsToFadeOut: number | null;
};

export class CharacterTooltip extends Sprite {
  private targetOpacity: number = 0;
  private fadingSpeed: number = 0.02;
  private config: CharacterTooltipConfig;
  private content: string | null = null;
  private hideTimeout: NodeJS.Timeout | null = null;

  constructor(configArg?: Partial<CharacterTooltipConfig>) {
    super();
    this.config = {
      alignment: defaultLabelAlignment,
      fontSize: defaultLabelFontSize,
      padding: defaultLabelPadding,
      color: defaultLabelColor,
      fontColor: defaultFontColor,
      visibleOpacity: defaultVisibleOpacity,
      secondsToFadeOut: defaultSecondsToFadeOut,
      ...configArg,
    };

    this.material = new SpriteMaterial({
      map: null,
      transparent: true,
      opacity: this.config.visibleOpacity,
      side: FrontSide,
    });

    this.position.set(0, 1.6, 0);
    this.visible = false;
  }

  public setHeightOffset(height: number) {
    this.position.y = height + this.scale.y / 2;
  }

  private redrawText(content: string) {
    if (content === this.content) {
      // No need to redraw if the content is the same
      return;
    }
    this.content = content;
    if (this.material.map) {
      this.material.map.dispose();
    }
    const { texture, width, height } = THREECanvasTextTexture(content, {
      bold: true,
      fontSize: this.config.fontSize * fontScale,
      paddingPx: this.config.padding,
      textColorRGB255A1: {
        r: this.config.fontColor.r * 255,
        g: this.config.fontColor.g * 255,
        b: this.config.fontColor.b * 255,
        a: 1.0,
      },
      backgroundColorRGB255A1: {
        r: this.config.color.r * 255,
        g: this.config.color.g * 255,
        b: this.config.color.b * 255,
        a: 1.0,
      },
      alignment: this.config.alignment,
      dimensions:
        this.config.maxWidth !== undefined
          ? {
              maxWidth: this.config.maxWidth,
            }
          : undefined,
    });

    this.material.map = texture;
    this.material.map.magFilter = LinearFilter;
    this.material.map.minFilter = LinearFilter;
    this.material.needsUpdate = true;

    this.scale.x = width / (100 * fontScale);
    this.scale.y = height / (100 * fontScale);
  }

  setText(text: string, onRemove?: () => void) {
    const sanitizedText = text.replace(/(\r\n|\n|\r)/gm, "");
    this.visible = true;
    this.targetOpacity = this.config.visibleOpacity;
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    if (this.config.secondsToFadeOut !== null) {
      this.hideTimeout = setTimeout(() => {
        this.hideTimeout = null;
        this.hide();
        if (onRemove) {
          onRemove();
        }
      }, this.config.secondsToFadeOut * 1000);
    }
    this.redrawText(sanitizedText);
  }

  hide() {
    this.targetOpacity = 0;
  }

  show() {
    this.setText(this.content || "");
  }

  update() {
    const opacity = this.material.opacity;
    if (opacity < this.targetOpacity) {
      this.material.opacity = Math.min(
        this.material.opacity + this.fadingSpeed,
        this.targetOpacity,
      );
    } else if (opacity > this.targetOpacity) {
      this.material.opacity = Math.max(
        this.material.opacity - this.fadingSpeed,
        this.targetOpacity,
      );
      if (opacity >= 1 && this.material.transparent) {
        this.material.transparent = false;
        this.material.needsUpdate = true;
      } else if (opacity > 0 && opacity < 1 && !this.material.transparent) {
        this.material.transparent = true;
        this.material.needsUpdate = true;
      }
      if (this.material.opacity <= 0) {
        this.visible = false;
      }
    }
  }

  dispose() {
    if (this.material.map) {
      this.material.map.dispose();
    }
    this.material.dispose();
  }
}
