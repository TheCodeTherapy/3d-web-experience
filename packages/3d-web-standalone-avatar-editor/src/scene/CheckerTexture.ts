import {
  DataTexture,
  LinearMipmapLinearFilter,
  NearestFilter,
  RGBAFormat,
  RepeatWrapping,
} from "three";

export class CheckerTexture {
  private width = 2;
  private height = 2;
  private size = this.width * this.height * 4; // RGBA
  private data = new Uint8Array(this.size);

  public texture: DataTexture;

  constructor(
    private repeatX: number,
    private repeatY: number,
  ) {
    for (let i = 0; i <= 12; i += 4) {
      const c = i === 4 || i === 8 ? 80 : 240;
      this.fillData(i, c, c, c, 255);
    }
    this.texture = new DataTexture(this.data, this.width, this.height, RGBAFormat);
    this.texture.repeat.set(this.repeatX, this.repeatY);

    this.texture.wrapS = RepeatWrapping;
    this.texture.wrapT = RepeatWrapping;
    this.texture.magFilter = NearestFilter;
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.needsUpdate = true;
  }

  private fillData(offset: number, red: number, green: number, blue: number, alpha: number) {
    this.data[offset + 0] = red;
    this.data[offset + 1] = green;
    this.data[offset + 2] = blue;
    this.data[offset + 3] = alpha;
  }
}
