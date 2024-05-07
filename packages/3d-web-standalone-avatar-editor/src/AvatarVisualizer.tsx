import { useCallback, useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { Object3D } from "three";

import { AvatarRenderer } from "./AvatarRenderer";

type AvatarVisualizerProps = {
  characterMesh: Object3D;
  hdrURL: string;
  idleAnimationURL: string;
  cameraTargetOffset: {
    x?: number;
    y?: number;
    z?: number;
  };
  cameraTargetDistance: number;
  showMirror: boolean;
};

export const AvatarVisualizer = ({
  characterMesh,
  hdrURL,
  idleAnimationURL,
  cameraTargetOffset,
  cameraTargetDistance,
  showMirror,
}: AvatarVisualizerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const visualizerRef = useRef<AvatarRenderer | null>(null);
  const currentCharacterRef = useRef<Object3D | null>(null);
  const requestRef = useRef<number | null>(null);

  useEffect(() => {
    if (!visualizerRef.current) {
      visualizerRef.current = new AvatarRenderer(hdrURL, idleAnimationURL, showMirror);
      const canvasContainer = containerRef.current;
      if (canvasContainer && visualizerRef.current.renderer) {
        canvasContainer.appendChild(visualizerRef.current.renderer.domElement);
      }
    }
  }, [hdrURL, idleAnimationURL, showMirror]);

  useEffect(() => {
    if (visualizerRef.current) {
      visualizerRef.current.setDistanceAndOffset(cameraTargetOffset, cameraTargetDistance);
    }
  }, [cameraTargetOffset, cameraTargetDistance]);

  useEffect(() => {
    const visualizer = visualizerRef.current;
    if (!characterMesh) return;
    if (visualizer) {
      const thingie = visualizer.animateCharacter(characterMesh);
      const scene = visualizer.scene;
      scene.add(characterMesh);
      if (currentCharacterRef.current) scene.remove(currentCharacterRef.current);
      currentCharacterRef.current = characterMesh;
      visualizer.update();
      thingie.then(() => {});
    }
  }, [characterMesh]);

  const animationLoop = useCallback(() => {
    if (visualizerRef.current) {
      visualizerRef.current.update();
      requestRef.current = requestAnimationFrame(animationLoop);
    }
  }, []);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animationLoop);
    return () => {
      if (requestRef.current !== null) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [animationLoop]);

  return (
    <div ref={containerRef} id="avatar-canvas-container" className="avatar-canvas-container"></div>
  );
};
