import {
  Camera,
  Color,
  FrontSide,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  Object3D,
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
const defaultLabelFontSize = 9;
const defaultLabelPadding = 0;
const defaultLabelWidth = 0.25;
const defaultLabelHeight = 0.125;
const defaultLabelCastShadows = true;

export class CharacterTooltip {
  private geometry: PlaneGeometry;
  private material: MeshBasicMaterial;
  private mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;

  private visibleOpacity: number = 0.85;
  private targetOpacity: number = 0;
  private fadingSpeed: number = 0.02;
  private secondsToFadeOut: number = 15;

  private props = {
    content: "",
    alignment: defaultLabelAlignment,
    width: defaultLabelWidth,
    height: defaultLabelHeight,
    fontSize: defaultLabelFontSize,
    padding: defaultLabelPadding,
    color: defaultLabelColor,
    fontColor: defaultFontColor,
    castShadows: defaultLabelCastShadows,
  };

  constructor(parentModel: Object3D) {
    this.setText = this.setText.bind(this);
    this.material = new MeshBasicMaterial({
      map: null,
      transparent: true,
      opacity: 0,
    });
    this.material.side = FrontSide;
    this.geometry = new PlaneGeometry(1, 1, 1, 1);
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.position.set(0, 1.6, 0);
    this.mesh.visible = false;
    parentModel.add(this.mesh);
  }

  private redrawText(content: string) {
    if (!this.material) {
      return;
    }
    if (this.material.map) {
      this.material.map.dispose();
    }
    const { texture, width, height } = THREECanvasTextTexture(content, {
      bold: true,
      fontSize: this.props.fontSize * fontScale,
      paddingPx: this.props.padding,
      textColorRGB255A1: {
        r: this.props.fontColor.r * 255,
        g: this.props.fontColor.g * 255,
        b: this.props.fontColor.b * 255,
        a: 1.0,
      },
      backgroundColorRGB255A1: {
        r: this.props.color.r * 255,
        g: this.props.color.g * 255,
        b: this.props.color.b * 255,
        a: 1.0,
      },
      dimensions: {
        width: this.props.width * (100 * fontScale),
        height: this.props.height * (100 * fontScale),
      },
      alignment: this.props.alignment,
    });

    this.material.map = texture;
    this.material.map.magFilter = LinearFilter;
    this.material.map.minFilter = LinearFilter;
    this.material.needsUpdate = true;

    this.mesh.scale.x = width / (100 * fontScale);
    this.mesh.scale.y = height / (100 * fontScale);
    this.mesh.position.y = 1.6;
  }

  setText(text: string, temporary: boolean = false) {
    this.redrawText(text);
    this.mesh.visible = true;
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
    this.mesh.lookAt(camera.position);
    const opacity = this.mesh.material.opacity;
    if (opacity < this.targetOpacity) {
      this.mesh.material.opacity = Math.min(
        this.mesh.material.opacity + this.fadingSpeed,
        this.targetOpacity,
      );
    } else if (opacity > this.targetOpacity) {
      this.mesh.material.opacity = Math.max(
        this.mesh.material.opacity - this.fadingSpeed,
        this.targetOpacity,
      );
      if (opacity >= 1 && this.mesh.material.transparent === true) {
        this.mesh.material.transparent = false;
        this.mesh.material.needsUpdate = true;
      } else if (opacity > 0 && opacity < 1 && this.mesh.material.transparent === false) {
        this.mesh.material.transparent = true;
        this.mesh.material.needsUpdate = true;
      }
      if (this.mesh.material.opacity <= 0) {
        this.mesh.visible = false;
      }
    }
  }
}
