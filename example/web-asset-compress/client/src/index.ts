import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Pane, FolderApi, ButtonApi } from "tweakpane";

import { toastStyle, tweakPaneStyle } from "./style";

const toastStyleElement = document.createElement("style");
toastStyleElement.type = "text/css";
toastStyleElement.appendChild(document.createTextNode(toastStyle));
document.head.appendChild(toastStyleElement);

const toastContainer = document.createElement("div");
toastContainer.className = "toast-container";
document.body.appendChild(toastContainer);

const showToast = (
  message: string,
  type: "success" | "error" | "info" = "info",
  duration?: number, // If no duration, stays until manually removed
) => {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;

  toastContainer.appendChild(toast);

  if (duration) {
    setTimeout(() => toast.remove(), duration);
  }

  return {
    dismiss: () => toast.remove(), // Manual dismiss function
  };
};

// ---------------------------------------
// 📝 Style Injection for Tweakpane
// ---------------------------------------

const styleElement = document.createElement("style");
styleElement.type = "text/css";
styleElement.appendChild(document.createTextNode(tweakPaneStyle));
document.head.appendChild(styleElement);

// ---------------------------------------
// 🧮 Utility Functions
// ---------------------------------------

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0.00 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(2)} ${sizes[i]}`;
};

const calculatePercentageChange = (original: number, compressed: number): string => {
  if (original === 0) return "N/A";
  const change = ((compressed - original) / original) * 100;
  return `${change.toFixed(2)}% ${change < 0 ? "reduced" : "increase"}`;
};

const countVerticesAndTrianglesFromGLTF = (gltf: GLTF) => {
  let vertexCount = 0;
  let triangleCount = 0;

  gltf.scene.traverse((node: any) => {
    if ((node as THREE.Mesh).isMesh) {
      const mesh = node as THREE.Mesh;

      const positionAttr = mesh.geometry.attributes.position;
      vertexCount += positionAttr ? positionAttr.count : 0;

      if (mesh.geometry.index) {
        triangleCount += mesh.geometry.index.count / 3;
      } else if (positionAttr) {
        triangleCount += positionAttr.count / 3;
      }
    }
  });

  return { vertexCount, triangleCount };
};

// ---------------------------------------
// 🎛️ Tweakpane Setup
// ---------------------------------------

const compressionValues = {
  simplifyRatio: 0.7,
  simplifyError: 0.001,
  textureFormat: "webp",
  textureResize: 1024,
};

const resultValues = {
  originalSize: "N/A",
  compressedSize: "N/A",
  savedBytes: "N/A",
  savedPercentage: "N/A",
  originalVertices: "N/A",
  compressedVertices: "N/A",
  vertexPercentage: "N/A",
  originalTriangles: "N/A",
  compressedTriangles: "N/A",
  trianglePercentage: "N/A",
};

const pane = new Pane({ title: "Compression Settings" });

const optimizationFolder: FolderApi = pane.addFolder({
  title: "Optimization Options",
  expanded: true,
});

const simplifyFolder: FolderApi = optimizationFolder.addFolder({
  title: "Simplify",
  expanded: true,
});
const textureFolder: FolderApi = optimizationFolder.addFolder({ title: "Texture", expanded: true });
const resultsFolder: FolderApi = optimizationFolder.addFolder({ title: "Results", expanded: true });

// Bind optimization parameters
simplifyFolder.addBinding(compressionValues, "simplifyRatio", { min: 0.1, max: 1, step: 0.05 });
simplifyFolder.addBinding(compressionValues, "simplifyError", {
  min: 0.0001,
  max: 0.01,
  step: 0.0001,
});
textureFolder.addBinding(compressionValues, "textureFormat", {
  options: { webp: "webp", jpeg: "jpeg", png: "png" },
});
textureFolder.addBinding(compressionValues, "textureResize", { min: 128, max: 2048, step: 128 });

// Results folder with separators
resultsFolder.addBinding(resultValues, "originalSize", { readonly: true });
resultsFolder.addBinding(resultValues, "compressedSize", { readonly: true });
resultsFolder.addBinding(resultValues, "savedBytes", { readonly: true });
resultsFolder.addBinding(resultValues, "savedPercentage", { readonly: true });
resultsFolder.addBlade({ view: "separator" });

resultsFolder.addBinding(resultValues, "originalVertices", { readonly: true });
resultsFolder.addBinding(resultValues, "compressedVertices", { readonly: true });
resultsFolder.addBinding(resultValues, "vertexPercentage", { readonly: true });
resultsFolder.addBlade({ view: "separator" });

resultsFolder.addBinding(resultValues, "originalTriangles", { readonly: true });
resultsFolder.addBinding(resultValues, "compressedTriangles", { readonly: true });
resultsFolder.addBinding(resultValues, "trianglePercentage", { readonly: true });

// Compress button
const compressButton: ButtonApi = optimizationFolder.addButton({ title: "Compress" });
compressButton.on("click", async () => {
  if (!currentFile) {
    alert("Please drag and drop a file first.");
    return;
  }
  await handleCompression(currentFile);
});

// Download button
let compressedBlob: Blob | null = null;
const downloadButton: ButtonApi = optimizationFolder.addButton({ title: "Download" });
downloadButton.on("click", () => {
  if (!compressedBlob) {
    alert("No compressed asset available. Please compress a file first.");
    return;
  }

  const url = URL.createObjectURL(compressedBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "compressed-asset.glb";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
});

// ---------------------------------------
// 🖼️ ThreeJS Setup
// ---------------------------------------

const container = document.createElement("div");
document.body.appendChild(container);

const rendererLeft = new THREE.WebGLRenderer({ antialias: true });
const rendererRight = new THREE.WebGLRenderer({ antialias: true });
rendererLeft.setSize(window.innerWidth / 2, window.innerHeight);
rendererRight.setSize(window.innerWidth / 2, window.innerHeight);
rendererLeft.setPixelRatio(window.devicePixelRatio);
rendererRight.setPixelRatio(window.devicePixelRatio);

rendererLeft.domElement.style.float = "left";
rendererRight.domElement.style.float = "right";
container.appendChild(rendererLeft.domElement);
container.appendChild(rendererRight.domElement);

const sceneLeft = new THREE.Scene();
const sceneRight = new THREE.Scene();
sceneLeft.background = new THREE.Color(0x202020);
sceneRight.background = new THREE.Color(0x202020);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / 2 / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(0, 2, 5);

const controlsLeft = new OrbitControls(camera, rendererLeft.domElement);
const controlsRight = new OrbitControls(camera, rendererRight.domElement);

const addLights = (scene: THREE.Scene) => {
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  const directional = new THREE.DirectionalLight(0xffffff, 0.6);
  directional.position.set(1, 2, 3);
  scene.add(ambient, directional);
};

addLights(sceneLeft);
addLights(sceneRight);

const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");
gltfLoader.setDRACOLoader(dracoLoader);

const loadGLTF = (arrayBuffer: ArrayBuffer, scene: THREE.Scene, isCompressed: boolean) => {
  gltfLoader.parse(arrayBuffer, "", (gltf) => {
    scene.clear();
    addLights(scene);
    scene.add(gltf.scene);

    const { vertexCount, triangleCount } = countVerticesAndTrianglesFromGLTF(gltf);

    if (isCompressed) {
      resultValues.compressedVertices = vertexCount.toLocaleString();
      resultValues.compressedTriangles = triangleCount.toLocaleString();

      const originalVertices = parseInt(resultValues.originalVertices.replace(/,/g, "")) || 0;
      const originalTriangles = parseInt(resultValues.originalTriangles.replace(/,/g, "")) || 0;

      resultValues.vertexPercentage = calculatePercentageChange(originalVertices, vertexCount);
      resultValues.trianglePercentage = calculatePercentageChange(originalTriangles, triangleCount);
    } else {
      resultValues.originalVertices = vertexCount.toLocaleString();
      resultValues.originalTriangles = triangleCount.toLocaleString();
    }

    pane.refresh();
  });
};

// ---------------------------------------
// 📦 File Handling & Compression
// ---------------------------------------

let currentFile: File | null = null;

const handleCompression = async (file: File) => {
  const loadingToast = showToast("Compressing...", "info");

  compressedBlob = null;
  const originalSizeBytes = file.size;
  resultValues.originalSize = formatBytes(originalSizeBytes);

  const reader = new FileReader();
  reader.onload = (e) => {
    if (!e.target?.result) return;
    loadGLTF(e.target.result as ArrayBuffer, sceneLeft, false);
  };
  reader.readAsArrayBuffer(file);

  const formData = new FormData();
  formData.append("asset", file);
  formData.append("simplifyRatio", compressionValues.simplifyRatio.toString());
  formData.append("simplifyError", compressionValues.simplifyError.toString());
  formData.append("textureFormat", compressionValues.textureFormat);
  formData.append(
    "textureResize",
    JSON.stringify([compressionValues.textureResize, compressionValues.textureResize]),
  );

  try {
    const response = await fetch("/asset-compressor/optimize", { method: "POST", body: formData });

    if (!response.ok) throw new Error("Compression failed.");

    const compressedArrayBuffer = await response.arrayBuffer();
    compressedBlob = new Blob([compressedArrayBuffer], { type: "model/gltf-binary" });

    loadGLTF(compressedArrayBuffer, sceneRight, true);

    const compressedSizeBytes = compressedArrayBuffer.byteLength;
    resultValues.compressedSize = formatBytes(compressedSizeBytes);

    const savedBytes = originalSizeBytes - compressedSizeBytes;
    const savedPercentage = originalSizeBytes === 0 ? 0 : (savedBytes / originalSizeBytes) * 100;

    resultValues.savedBytes = `${formatBytes(savedBytes)} ${savedBytes >= 0 ? "saved" : "increase"}`;
    resultValues.savedPercentage = `${savedPercentage.toFixed(2)}% ${savedBytes >= 0 ? "saved" : "increase"}`;
    pane.refresh();
    loadingToast.dismiss();
    showToast("Asset optimized! ✅", "success", 3000);
  } catch (err) {
    loadingToast.dismiss();
    showToast("Compression failed ❌", "error", 3000);
    console.error("Compression error:", err);
  }
};

const handleFile = (file: File) => {
  currentFile = file;
  handleCompression(file);
};

// ---------------------------------------
// 🖱️ Drag & Drop Setup
// ---------------------------------------

["dragenter", "dragover", "drop"].forEach((eventName) => {
  window.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});

window.addEventListener("drop", (e) => {
  if (e.dataTransfer?.files?.length) {
    handleFile(e.dataTransfer.files[0]);
  }
});

// ---------------------------------------
// 🔄 Resize & Animation
// ---------------------------------------

window.addEventListener("resize", () => {
  const width = window.innerWidth / 2;
  const height = window.innerHeight;
  rendererLeft.setSize(width, height);
  rendererRight.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
});

const animate = () => {
  requestAnimationFrame(animate);
  controlsLeft.update();
  controlsRight.update();
  rendererLeft.render(sceneLeft, camera);
  rendererRight.render(sceneRight, camera);
};

animate();
