import {
  Camera,
  Color,
  FrontSide,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from "three";

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
const defaultLabelFontSize = 8;
const defaultLabelPadding = 8;
const defaultLabelWidth = 0.25;
const defaultLabelHeight = 0.1;
const defaultLabelCastShadows = true;

const tooltipGeometry = new PlaneGeometry(1, 1, 1, 1);

export type CharacterTooltipConfig = {
  alignment: LabelAlignment;
  width: number;
  height: number;
  fontSize: number;
  padding: number;
  color: Color;
  fontColor: Color;
  castShadows: boolean;
};

export class CharacterTooltip extends Mesh {
  private tooltipMaterial: MeshBasicMaterial;
  private visibleOpacity: number = 0.85;
  private targetOpacity: number = 0;
  private fadingSpeed: number = 0.02;
  private secondsToFadeOut: number = 10;
  private config: CharacterTooltipConfig;

  constructor(configArg?: Partial<CharacterTooltipConfig>) {
    super(tooltipGeometry);
    this.config = {
      alignment: defaultLabelAlignment,
      width: defaultLabelWidth,
      height: defaultLabelHeight,
      fontSize: defaultLabelFontSize,
      padding: defaultLabelPadding,
      color: defaultLabelColor,
      fontColor: defaultFontColor,
      castShadows: defaultLabelCastShadows,
      ...configArg,
    };

    this.tooltipMaterial = new MeshBasicMaterial({
      map: null,
      transparent: true,
      opacity: 0,
      side: FrontSide,
    });
    this.material = this.tooltipMaterial;
    this.position.set(0, 1.6, 0);
    this.visible = false;
  }

  private redrawText(content: string) {
    if (!this.tooltipMaterial) {
      return;
    }
    if (this.tooltipMaterial.map) {
      this.tooltipMaterial.map.dispose();
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
    });

    this.tooltipMaterial.map = texture;
    this.tooltipMaterial.map.magFilter = LinearFilter;
    this.tooltipMaterial.map.minFilter = LinearFilter;
    this.tooltipMaterial.needsUpdate = true;

    this.scale.x = width / (100 * fontScale);
    this.scale.y = height / (100 * fontScale);
    this.position.y = 1.4;
  }

  setText(text: string, temporary: boolean = false) {
    const sanitizedText = text.replace(/(\r\n|\n|\r)/gm, "");
    this.redrawText(sanitizedText);
    this.visible = true;
    this.targetOpacity = this.visibleOpacity;
    if (temporary) {
      setTimeout(() => {
        this.hide();
      }, this.secondsToFadeOut * 1000);
    }
  }

  hide() {
    this.targetOpacity = 0;
  }

  update(camera: Camera) {
    this.lookAt(camera.position);
    const opacity = this.tooltipMaterial.opacity;
    if (opacity < this.targetOpacity) {
      this.tooltipMaterial.opacity = Math.min(
        this.tooltipMaterial.opacity + this.fadingSpeed,
        this.targetOpacity,
      );
    } else if (opacity > this.targetOpacity) {
      this.tooltipMaterial.opacity = Math.max(
        this.tooltipMaterial.opacity - this.fadingSpeed,
        this.targetOpacity,
      );
      if (opacity >= 1 && this.tooltipMaterial.transparent) {
        this.tooltipMaterial.transparent = false;
        this.tooltipMaterial.needsUpdate = true;
      } else if (opacity > 0 && opacity < 1 && !this.tooltipMaterial.transparent) {
        this.tooltipMaterial.transparent = true;
        this.tooltipMaterial.needsUpdate = true;
      }
      if (this.tooltipMaterial.opacity <= 0) {
        this.visible = false;
      }
    }
  }
}
