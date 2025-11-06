import {
  AmbientLight,
  Bone,
  Box3,
  Camera,
  Color,
  OrthographicCamera,
  Scene,
  SkinnedMesh,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  Object3D,
} from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

import { ColorPartName } from "../CharacterModel";

import { mergeSkinnedMeshes, validateAndCleanSkeleton } from "./CharacterInstancingUtils";
import { InstancedMesh2, SquareDataTexture } from "./vendor/";

export type ColorSamplingOptions = {
  circularSamplingRadius?: number;
  topDownSamplingSize?: { width: number; height: number };
  debug?: boolean;
};

function listAllBoneNames(obj: SkinnedMesh): string[] {
  const boneNames: string[] = [];
  if (!obj) {
    console.log("no main mesh available");
    return boneNames;
  }
  for (const bone of obj.skeleton.bones) {
    boneNames.push(bone.name);
  }
  return boneNames;
}

export function captureCharacterColors(
  characterMesh: Object3D,
  options: ColorSamplingOptions,
): Map<ColorPartName, Color> {
  if (options.debug) {
    console.log("starting character color capture");
    console.log("characterMesh provided:", !!characterMesh);
  }

  // temporary scene for rendering the character
  const scene = new Scene();
  scene.add(characterMesh.clone());
  scene.add(new AmbientLight(0xffffff, 5));

  // camera in front of the character
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  const box = new Box3().setFromObject(characterMesh);
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());

  camera.position.set(center.x, center.y + size.y * 0.1, center.z + size.z * 2);
  camera.lookAt(center);

  // temporary renderer
  const canvas = document.createElement("canvas");
  const renderer = new WebGLRenderer({
    canvas,
    preserveDrawingBuffer: true,
    alpha: true,
  });

  const renderSize = 512;
  renderer.setSize(renderSize, renderSize);

  // render target to capture pixels
  const renderTarget = new WebGLRenderTarget(renderSize, renderSize);

  const sampledColors = new Map<ColorPartName, Color>();
  try {
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
    const pixels = new Uint8Array(renderSize * renderSize * 4);
    renderer.readRenderTargetPixels(renderTarget, 0, 0, renderSize, renderSize, pixels);

    const flippedPixels = new Uint8Array(pixels.length);

    for (let y = 0; y < renderSize; y++) {
      for (let x = 0; x < renderSize; x++) {
        const srcIndex = (y * renderSize + x) * 4;
        const dstY = renderSize - y - 1;
        const dstIndex = (dstY * renderSize + x) * 4;

        flippedPixels[dstIndex] = pixels[srcIndex];
        flippedPixels[dstIndex + 1] = pixels[srcIndex + 1];
        flippedPixels[dstIndex + 2] = pixels[srcIndex + 2];
        flippedPixels[dstIndex + 3] = pixels[srcIndex + 3];
      }
    }

    pixels.set(flippedPixels);

    const boneRegions = getBoneRegionsForColorSampling(
      characterMesh,
      camera,
      renderSize,
      options.circularSamplingRadius,
      options.topDownSamplingSize,
      options.debug,
    );
    if (options.debug) {
      createDebugCanvas(pixels, renderSize, "Character Screenshot", boneRegions);
      console.log(`found ${boneRegions.length} bone regions to sample`);
    }

    for (const region of boneRegions) {
      let avgColor: { r: number; g: number; b: number };

      // top-down sampling for hair
      if (region.name === "Hair/Head Top" && region.width && region.height) {
        avgColor = sampleTopDown({
          pixels,
          center: region.screenPos,
          width: region.width,
          height: region.height,
          imageWidth: renderSize,
          debug: options.debug,
        });
      } else {
        if (region.name === "Face/Chin") {
          avgColor = sampleCircularRegion({
            regionName: region.name,
            pixels,
            center: region.screenPos,
            radius: region.radius!,
            imageWidth: renderSize,
            getMostCommonColor: true,
            debug: options.debug,
          });
        } else {
          avgColor = sampleCircularRegion({
            regionName: region.name,
            pixels,
            center: region.screenPos,
            radius: region.radius!,
            imageWidth: renderSize,
            debug: options.debug,
          });
        }
      }

      if (options.debug) {
        console.log(
          `${region.name} at (${region.screenPos.x}, ${region.screenPos.y}): rgb(${avgColor.r}, ${avgColor.g}, ${avgColor.b}) - #${avgColor.r.toString(16).padStart(2, "0")}${avgColor.g.toString(16).padStart(2, "0")}${avgColor.b.toString(16).padStart(2, "0")}`,
        );
      }

      const materialColor = new Color().setRGB(
        avgColor.r / 255,
        avgColor.g / 255,
        avgColor.b / 255,
      );

      if (region.name === "Hair/Head Top") {
        sampledColors.set("hair", materialColor);
      } else if (region.name === "Face/Chin") {
        sampledColors.set("skin", materialColor);
        sampledColors.set("lips", materialColor.clone().multiplyScalar(0.8));
      } else if (region.name === "Chest") {
        sampledColors.set("shirt_short", materialColor);
        sampledColors.set("shirt_long", materialColor);
      } else if (region.name === "Left Thigh" || region.name === "Right Thigh") {
        if (!sampledColors.has("pants_short")) {
          sampledColors.set("pants_short", materialColor);
        }
      } else if (region.name === "Left Shin" || region.name === "Right Shin") {
        if (!sampledColors.has("pants_long")) {
          sampledColors.set("pants_long", materialColor);
        }
      } else if (region.name === "Left Foot" || region.name === "Right Foot") {
        if (!sampledColors.has("shoes")) {
          sampledColors.set("shoes", materialColor);
        }
      }
    }
  } catch (error) {
    console.error("error capturing character colors:", error);
  } finally {
    renderer.setRenderTarget(null);
    renderTarget.dispose();
    renderer.dispose();
    scene.remove(characterMesh);
  }

  if (options.debug) {
    console.log("character color capture completed!");
  }
  return sampledColors;
}

export function captureCharacterColorsFromObject3D(
  object3D: Object3D,
  options: ColorSamplingOptions,
): Map<ColorPartName, Color> {
  const clone = SkeletonUtils.clone(object3D);
  clone.position.set(0, 0, 0);
  clone.rotation.set(0, 0, 0);
  clone.scale.set(1, 1, 1);
  const skinnedMeshes: SkinnedMesh[] = [];
  clone.traverse((child) => {
    if (child instanceof SkinnedMesh || (child as SkinnedMesh).isSkinnedMesh) {
      const skinnedMesh = child as SkinnedMesh;
      skinnedMesh.skeleton.pose();
      skinnedMesh.skeleton.update();
      skinnedMesh.updateMatrixWorld(true);
    }
  });

  return captureCharacterColors(object3D, options);
}

function findBoneCenter(bone: Bone): Vector3 {
  const boneStart = new Vector3();
  bone.getWorldPosition(boneStart);

  // if bone has child bones we'll use the first child as the end point
  const childBones = bone.children.filter((child) => child instanceof Bone) as Bone[];
  if (childBones.length > 0) {
    const boneEnd = new Vector3();
    childBones[0].getWorldPosition(boneEnd);

    // midpoint between start and end
    return boneStart.clone().add(boneEnd).multiplyScalar(0.5);
  }

  // leaf bone, so all we can do is to return the start position
  return boneStart;
}

function getBoneRegionsForColorSampling(
  characterMesh: Object3D,
  camera: Camera,
  renderSize: number,
  circularSamplingRadius?: number,
  topDownSamplingSize?: { width: number; height: number },
  debug?: boolean,
): Array<{
  name: string;
  screenPos: Vector2;
  radius?: number;
  width?: number;
  height?: number;
  shape: "circle" | "rectangle";
}> {
  const regions: Array<{
    name: string;
    screenPos: Vector2;
    radius?: number;
    width?: number;
    height?: number;
    shape: "circle" | "rectangle";
  }> = [];

  let firstSkinnedMesh: SkinnedMesh | null = null;
  characterMesh.traverse((child) => {
    if (
      !firstSkinnedMesh &&
      (child instanceof SkinnedMesh || (child as SkinnedMesh).isSkinnedMesh)
    ) {
      firstSkinnedMesh = child as SkinnedMesh;
    }
  });
  if (!firstSkinnedMesh) {
    console.warn("No SkinnedMesh objects found in Object3D hierarchy");
    return regions;
  }
  const skinnedMesh = firstSkinnedMesh as SkinnedMesh;

  if (debug) {
    console.log("Available bones:");
    console.table(listAllBoneNames(skinnedMesh));
  }

  const boneTargets = [
    { name: "Face/Chin", boneName: "neck_02" },
    { name: "Chest", boneName: "spine_04" },
    { name: "Left Forearm", boneName: "lowerarm_l" },
    { name: "Right Forearm", boneName: "lowerarm_r" },
    { name: "Left Thigh", boneName: "thigh_l" },
    { name: "Right Thigh", boneName: "thigh_r" },
    { name: "Left Shin", boneName: "calf_l" },
    { name: "Right Shin", boneName: "calf_r" },
    { name: "Left Hand", boneName: "hand_l" },
    { name: "Right Hand", boneName: "hand_r" },
    { name: "Left Foot", boneName: "foot_l" },
    { name: "Right Foot", boneName: "foot_r" },
    { name: "Hair/Head Top", boneName: "head" },
  ];

  const screenPos = new Vector3();

  for (const target of boneTargets) {
    const bone: Bone | undefined = skinnedMesh.skeleton.bones.find(
      (child) => child.name === target.boneName,
    );

    if (bone) {
      const worldPos = findBoneCenter(bone);
      screenPos.copy(worldPos);
      screenPos.project(camera);

      const x = Math.round((screenPos.x * 0.5 + 0.5) * renderSize);
      const y = Math.round((screenPos.y * -0.5 + 0.5) * renderSize);

      if (x >= 0 && x < renderSize && y >= 0 && y < renderSize) {
        if (target.name === "Hair/Head Top") {
          regions.push({
            name: target.name,
            screenPos: new Vector2(x, y),
            width: topDownSamplingSize?.width ?? 10,
            height: topDownSamplingSize?.height ?? 100,
            shape: "rectangle",
          });
        } else {
          regions.push({
            name: target.name,
            screenPos: new Vector2(x, y),
            radius: circularSamplingRadius ?? 8,
            shape: "circle",
          });
        }
      }
    } else {
      console.warn(`Bone not found: ${target.boneName}`);
    }
  }

  return regions;
}

function sampleCircularRegion(params: {
  regionName: string;
  pixels: Uint8Array;
  center: Vector2;
  radius: number;
  imageWidth: number;
  getMostCommonColor?: boolean;
  debug?: boolean;
}): { r: number; g: number; b: number } {
  let totalR = 0,
    totalG = 0,
    totalB = 0;
  let sampleCount = 0;

  // Map to track color frequency for finding most common color
  const colorFrequency = new Map<string, { count: number; r: number; g: number; b: number }>();

  const radiusSquared = params.radius * params.radius;
  const minX = Math.max(0, Math.floor(params.center.x - params.radius));
  const maxX = Math.min(params.imageWidth - 1, Math.ceil(params.center.x + params.radius));
  const minY = Math.max(0, Math.floor(params.center.y - params.radius));
  const maxY = Math.min(params.imageWidth - 1, Math.ceil(params.center.y + params.radius));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - params.center.x;
      const dy = y - params.center.y;
      const distSquared = dx * dx + dy * dy;

      if (distSquared <= radiusSquared) {
        const pixelIndex = (y * params.imageWidth + x) * 4;
        const r = params.pixels[pixelIndex];
        const g = params.pixels[pixelIndex + 1];
        const b = params.pixels[pixelIndex + 2];

        totalR += r;
        totalG += g;
        totalB += b;
        sampleCount++;

        // track color frequency (round to nearest 5 to group similar colors)
        const roundedR = Math.round(r / 5) * 5;
        const roundedG = Math.round(g / 5) * 5;
        const roundedB = Math.round(b / 5) * 5;
        const colorKey = `${roundedR},${roundedG},${roundedB}`;

        if (colorFrequency.has(colorKey)) {
          colorFrequency.get(colorKey)!.count++;
        } else {
          colorFrequency.set(colorKey, { count: 1, r: roundedR, g: roundedG, b: roundedB });
        }
      }
    }
  }

  if (sampleCount === 0) {
    return { r: 0, g: 0, b: 0 };
  }

  // find most common color
  let mostCommonColor = { r: 0, g: 0, b: 0, count: 0 };
  for (const [, colorData] of colorFrequency.entries()) {
    if (colorData.count > mostCommonColor.count) {
      mostCommonColor = { ...colorData };
    }
  }

  const commonColor = {
    r: Math.round(mostCommonColor.r),
    g: Math.round(mostCommonColor.g),
    b: Math.round(mostCommonColor.b),
  };

  const avgColor = {
    r: Math.round(totalR / sampleCount),
    g: Math.round(totalG / sampleCount),
    b: Math.round(totalB / sampleCount),
  };

  if (params.debug) {
    console.log(`
    Circular region analysis for ${params.regionName}:
      - Most common color: rgb(${mostCommonColor.r}, ${mostCommonColor.g}, ${mostCommonColor.b}) (${mostCommonColor.count}/${sampleCount} pixels)
      - Average color: rgb(${avgColor.r}, ${avgColor.g}, ${avgColor.b})
      - Total unique colors: ${colorFrequency.size}`);
  }

  return params.getMostCommonColor ? commonColor : avgColor;
}

function sampleTopDown(params: {
  pixels: Uint8Array;
  center: Vector2;
  width: number;
  height: number;
  imageWidth: number;
  debug?: boolean;
}): { r: number; g: number; b: number } {
  let totalR = 0,
    totalG = 0,
    totalB = 0;
  let sampleCount = 0;

  const halfWidth = Math.floor(params.width / 2);
  const minX = Math.max(0, params.center.x - halfWidth);
  const maxX = Math.min(params.imageWidth - 1, params.center.x + halfWidth);
  const startY = Math.max(0, params.center.y - Math.floor(params.height / 2));
  const endY = Math.min(params.imageWidth - 1, params.center.y + Math.floor(params.height / 2));

  let consecutiveLines = 0;
  let foundHair = false;

  // scan from top to bottom
  for (let y = startY; y <= endY && !foundHair; y++) {
    let lineHasPixels = false;
    let lineR = 0,
      lineG = 0,
      lineB = 0,
      lineCount = 0;

    // check this horizontal line for non-transparent pixels
    for (let x = minX; x <= maxX; x++) {
      const pixelIndex = (y * params.imageWidth + x) * 4;
      const alpha = params.pixels[pixelIndex + 3];

      if (alpha > 200) {
        lineHasPixels = true;
        lineR += params.pixels[pixelIndex];
        lineG += params.pixels[pixelIndex + 1];
        lineB += params.pixels[pixelIndex + 2];
        lineCount++;
      }
    }

    if (lineHasPixels && lineCount > 0) {
      consecutiveLines++;
      totalR += lineR;
      totalG += lineG;
      totalB += lineB;
      sampleCount += lineCount;

      // If we found 3 consecutive lines with pixels, we've found the hair
      if (consecutiveLines >= 3) {
        foundHair = true;
      }
    } else {
      // reset counter if we hit a transparent line
      if (consecutiveLines > 0) {
        // we had some lines but hit transparency, decide if we have enough
        if (consecutiveLines >= 2) {
          foundHair = true;
        } else {
          // not enough, reset and continue
          consecutiveLines = 0;
          totalR = totalG = totalB = sampleCount = 0;
        }
      }
    }
  }

  if (sampleCount === 0) {
    console.warn("No hair pixels found in top-down sampling, falling back to center pixel");
    // fallback to center pixel if no hair found
    const centerPixelIndex = (params.center.y * params.imageWidth + params.center.x) * 4;
    return {
      r: params.pixels[centerPixelIndex],
      g: params.pixels[centerPixelIndex + 1],
      b: params.pixels[centerPixelIndex + 2],
    };
  }

  if (params.debug) {
    console.log(
      `hair color: rgb(${totalR / sampleCount}, ${totalG / sampleCount}, ${totalB / sampleCount})`,
    );
  }

  return {
    r: Math.round(totalR / sampleCount),
    g: Math.round(totalG / sampleCount),
    b: Math.round(totalB / sampleCount),
  };
}

function createDebugCanvas(
  pixels: Uint8Array,
  size: number,
  title: string,
  boneRegions?: Array<{
    name: string;
    screenPos: Vector2;
    radius?: number;
    width?: number;
    height?: number;
    shape: "circle" | "rectangle";
  }>,
): void {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    console.error("Could not get canvas context for debug display");
    return;
  }

  canvas.width = size;
  canvas.height = size;

  const imageData = ctx.createImageData(size, size);
  imageData.data.set(pixels);
  ctx.putImageData(imageData, 0, 0);

  if (boneRegions) {
    boneRegions.forEach((region, index) => {
      ctx.strokeStyle = index % 2 === 0 ? "#ff0000" : "#00ff00"; // Alternate red/green
      ctx.lineWidth = 2;

      if (region.shape === "circle" && region.radius !== undefined) {
        // draw circular region
        ctx.beginPath();
        ctx.arc(region.screenPos.x, region.screenPos.y, region.radius, 0, 2 * Math.PI);
        ctx.stroke();

        // center point
        ctx.beginPath();
        ctx.arc(region.screenPos.x, region.screenPos.y, 2, 0, 2 * Math.PI);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();

        // label
        ctx.fillStyle = "#ffffff";
        ctx.font = "10px monospace";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 3;
        const labelX = region.screenPos.x + region.radius + 5;
        const labelY = region.screenPos.y;
        ctx.strokeText(region.name, labelX, labelY);
        ctx.fillText(region.name, labelX, labelY);
      } else if (
        region.shape === "rectangle" &&
        region.width !== undefined &&
        region.height !== undefined
      ) {
        // draw rectangular region
        const halfWidth = region.width / 2;
        const halfHeight = region.height / 2;
        const rectX = region.screenPos.x - halfWidth;
        const rectY = region.screenPos.y - halfHeight;

        ctx.strokeRect(rectX, rectY, region.width, region.height);

        // center point
        ctx.beginPath();
        ctx.arc(region.screenPos.x, region.screenPos.y, 2, 0, 2 * Math.PI);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();

        // label
        ctx.fillStyle = "#ffffff";
        ctx.font = "10px monospace";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 3;
        const labelX = region.screenPos.x + halfWidth + 5;
        const labelY = region.screenPos.y;
        ctx.strokeText(region.name, labelX, labelY);
        ctx.fillText(region.name, labelX, labelY);
      }
    });
  }

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "10px";
  container.style.right = "10px";
  container.style.zIndex = "99999999";
  container.style.background = "rgba(0,0,0,0.8)";
  container.style.padding = "10px";
  container.style.borderRadius = "5px";

  const titleElement = document.createElement("div");
  titleElement.textContent = title;
  titleElement.style.color = "white";
  titleElement.style.fontSize = "12px";
  titleElement.style.marginBottom = "5px";
  titleElement.style.fontFamily = "monospace";

  canvas.style.imageRendering = "pixelated";
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.style.border = "1px solid #666";

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.position = "absolute";
  closeBtn.style.top = "5px";
  closeBtn.style.right = "5px";
  closeBtn.style.background = "#ff0000";
  closeBtn.style.color = "white";
  closeBtn.style.border = "none";
  closeBtn.style.borderRadius = "3px";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.fontSize = "12px";
  closeBtn.style.width = "20px";
  closeBtn.style.height = "20px";
  closeBtn.onclick = () => container.remove();

  container.appendChild(titleElement);
  container.appendChild(canvas);
  container.appendChild(closeBtn);
  document.body.appendChild(container);

  console.log(`Debug canvas created: ${title} (${size}x${size})`);
}

export function updateDebugTextureCanvas(instancedMesh: InstancedMesh2): void {
  if (!instancedMesh?.materialColorsTexture) {
    console.warn("No material colors texture to update debug canvas");
    return;
  }

  // Find existing debug texture canvas container
  const existingContainer = document.querySelector(
    '[data-debug-texture="material-colors"]',
  ) as HTMLElement;
  if (!existingContainer) {
    console.warn("No existing debug texture canvas found to update");
    return;
  }

  // Find the canvas inside the container
  const canvas = existingContainer.querySelector("canvas") as HTMLCanvasElement;
  if (!canvas) {
    console.warn("No canvas found in debug texture container");
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("Could not get canvas context for texture update");
    return;
  }

  const texture = instancedMesh.materialColorsTexture;
  const size = texture.image.width;

  // Update canvas size if needed
  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size;
    canvas.height = size;
  }

  const imageData = ctx.createImageData(size, size);
  const data = texture._data;

  // Update the image data with new texture data
  for (let i = 0; i < data.length; i += 4) {
    const pixelIndex = i;
    imageData.data[pixelIndex] = Math.floor(data[i] * 255); // R
    imageData.data[pixelIndex + 1] = Math.floor(data[i + 1] * 255); // G
    imageData.data[pixelIndex + 2] = Math.floor(data[i + 2] * 255); // B
    imageData.data[pixelIndex + 3] = Math.floor(data[i + 3] * 255); // A
  }

  ctx.putImageData(imageData, 0, 0);
  console.log("Debug texture canvas updated with new material colors");
}
