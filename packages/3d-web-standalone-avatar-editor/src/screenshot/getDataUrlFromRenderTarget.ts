import { WebGLRenderer, WebGLRenderTarget } from "three";

export function getDataUrlFromRenderTarget(
  renderTarget: WebGLRenderTarget,
  renderer: WebGLRenderer,
  width: number,
  height: number,
  ssaa: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;

  // super-sampling AA
  const ssWidth = width * ssaa;
  const ssHeight = height * ssaa;

  const pixels = new Uint8Array(ssWidth * ssHeight * 4);
  renderer.readRenderTargetPixels(renderTarget, 0, 0, ssWidth, ssHeight, pixels);

  const rowBytes = ssWidth * 4;
  const halfHeight = Math.floor(ssWidth / 2);
  for (let y = 0; y < halfHeight; ++y) {
    const topIndex = y * rowBytes;
    const bottomIndex = (ssWidth - y - 1) * rowBytes;
    for (let x = 0; x < rowBytes; ++x) {
      const topPixel = pixels[topIndex + x];
      pixels[topIndex + x] = pixels[bottomIndex + x];
      pixels[bottomIndex + x] = topPixel;
    }
  }

  if (ssaa > 1.0) {
    const ssCanvas = document.createElement("canvas");
    ssCanvas.width = ssWidth;
    ssCanvas.height = ssHeight;
    const ssContext = ssCanvas.getContext("2d")!;

    const ssImageData = ssContext.createImageData(ssWidth, ssHeight);
    ssImageData.data.set(pixels);
    ssContext.putImageData(ssImageData, 0, 0);
    context.drawImage(ssCanvas, 0, 0, ssWidth, ssHeight, 0, 0, width, height);
  } else {
    const imageData = context.createImageData(width, height);
    imageData.data.set(pixels);
    context.putImageData(imageData, 0, 0);
  }

  return canvas.toDataURL("image/png");
}
