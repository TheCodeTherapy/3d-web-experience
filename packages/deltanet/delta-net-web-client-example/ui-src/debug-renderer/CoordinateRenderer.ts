import { DeltaNetClientComponent, DeltaNetClientState } from "@mml-io/delta-net-web";

import { DebugRendererConfig } from "./DebugRenderer";

const trailLength = 50;
const trailSkip = 5;
const pointRadius = 6;
const myPointSize = 20;
const gridSpacing = 128;
const enableTrails = true;
const backgroundColor = "#0d1117";
const gridColor = "#21262d";
const axisColor = "#30363d";
const trailOpacity = 0.4;
const pointStrokeColor = "#21262d";
const pointStrokeWidth = 1;

export class CoordinateRenderer {
  private coordinateCanvas: HTMLCanvasElement | null = null;
  private positionHistory: Map<number, Array<{ x: number; y: number }>> = new Map();
  private animationFrameId: number | null = null;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private root: HTMLElement,
    private config: DebugRendererConfig,
  ) {}

  public initialize(): HTMLCanvasElement {
    if (this.disposed) {
      throw new Error("Cannot initialize disposed CoordinateRenderer");
    }

    if (!this.coordinateCanvas) {
      this.coordinateCanvas = document.createElement("canvas");
      this.coordinateCanvas.className = "coordinate-canvas";
      this.coordinateCanvas.style.backgroundColor = backgroundColor;
      this.root.appendChild(this.coordinateCanvas);

      // Set up resize observer to handle container size changes
      this.setupResizeObserver();
    }

    // Always update canvas size to ensure it matches current container
    this.updateCanvasSize();
    return this.coordinateCanvas;
  }

  private setupResizeObserver(): void {
    if (!this.coordinateCanvas || typeof ResizeObserver === "undefined") return;

    this.resizeObserver = new ResizeObserver((entries) => {
      if (this.disposed) return;

      // Debounce resize events
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
      }

      this.animationFrameId = requestAnimationFrame(() => {
        this.updateCanvasSize();
        this.animationFrameId = null;
      });
    });

    // Observe the root container for size changes
    this.resizeObserver.observe(this.root);
  }

  private updateCanvasSize(): void {
    if (!this.coordinateCanvas) return;

    // Check if root element has valid bounds
    const rect = this.root.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const containerWidth = rect.width;
      const containerHeight = rect.height;

      // Account for padding and info div (approx 100px)
      const availableWidth = Math.max(200, containerWidth - 48); // 24px padding each side
      const availableHeight = Math.max(200, containerHeight - 120); // padding + info div

      // Use full available space instead of forcing square canvas
      const canvasWidth = availableWidth;
      const canvasHeight = availableHeight;

      // Only update if size actually changed to avoid unnecessary re-renders
      if (
        this.coordinateCanvas.width !== canvasWidth ||
        this.coordinateCanvas.height !== canvasHeight
      ) {
        this.coordinateCanvas.width = canvasWidth;
        this.coordinateCanvas.height = canvasHeight;
      }
    }
  }

  public render(deltaNetClientState: DeltaNetClientState): void {
    if (this.disposed) return;

    try {
      this.renderFrame(deltaNetClientState);
    } catch (error) {
      console.error("Error rendering coordinate frame:", error);
    }
  }

  private renderFrame(deltaNetClientState: DeltaNetClientState): void {
    const userIds = deltaNetClientState.getStableIds();
    const localClientIndex = deltaNetClientState.getLocalClientIndex();
    const indicesCount = deltaNetClientState.getIndicesCount();
    const componentValues = deltaNetClientState.getComponentValues();

    const canvas = this.initialize();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Get color state with minimal logging
    let colorState: (Uint8Array | null)[] = [];
    if (this.config.colorStateId !== undefined) {
      const stateData = deltaNetClientState.getStateById(this.config.colorStateId);
      if (stateData) {
        colorState = stateData;
      }
    }

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = Math.min(width, height) / (2 * this.config.halfWidth);

    // Clear canvas with background color
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Draw grid and axes
    this.drawGrid(ctx, width, height, centerX, centerY, scale);
    this.drawAxes(ctx, width, height, centerX, centerY, scale);

    // Get component data
    const xComponent = componentValues.get(this.config.xComponentId);
    const yComponent = componentValues.get(this.config.yComponentId);

    if (!xComponent || !yComponent) {
      this.drawNoDataMessage(ctx, width, height);
      return;
    }

    // Update position history and draw trails
    if (enableTrails) {
      this.updateAndDrawTrails(
        ctx,
        userIds,
        indicesCount,
        xComponent,
        yComponent,
        colorState,
        centerX,
        centerY,
        scale,
      );
    }

    // Draw current positions
    this.drawCurrentPositions(
      ctx,
      indicesCount,
      localClientIndex,
      xComponent,
      yComponent,
      colorState,
      centerX,
      centerY,
      scale,
    );

    // Draw center marker
    this.drawCenterMarker(ctx, centerX, centerY);
  }

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    centerX: number,
    centerY: number,
    scale: number,
  ): void {
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;

    // Calculate the world coordinate range we need to cover for the entire canvas
    const worldLeft = -centerX / scale;
    const worldRight = (width - centerX) / scale;
    const worldTop = centerY / scale;
    const worldBottom = -(height - centerY) / scale;

    // Draw vertical grid lines (covering full canvas width)
    const startX = Math.floor(worldLeft / gridSpacing) * gridSpacing;
    const endX = Math.ceil(worldRight / gridSpacing) * gridSpacing;
    for (let worldX = startX; worldX <= endX; worldX += gridSpacing) {
      const canvasX = centerX + worldX * scale;
      if (canvasX >= 0 && canvasX <= width) {
        ctx.beginPath();
        ctx.moveTo(canvasX, 0);
        ctx.lineTo(canvasX, height);
        ctx.stroke();
      }
    }

    // Draw horizontal grid lines (covering full canvas height)
    const startY = Math.floor(worldBottom / gridSpacing) * gridSpacing;
    const endY = Math.ceil(worldTop / gridSpacing) * gridSpacing;
    for (let worldY = startY; worldY <= endY; worldY += gridSpacing) {
      const canvasY = centerY - worldY * scale;
      if (canvasY >= 0 && canvasY <= height) {
        ctx.beginPath();
        ctx.moveTo(0, canvasY);
        ctx.lineTo(width, canvasY);
        ctx.stroke();
      }
    }
  }

  private drawAxes(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    centerX: number,
    centerY: number,
    scale: number,
  ): void {
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 2;

    // X-axis
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // Y-axis (represents Z in 3D space)
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, height);
    ctx.stroke();

    // Draw axis labels
    ctx.fillStyle = "#6e7681"; // Much lighter gray color
    ctx.font = "10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";

    // Position labels at halfway points along each axis
    const halfwayLeft = centerX / 2;
    const halfwayRight = centerX + (width - centerX) / 2;
    const halfwayTop = centerY / 2;
    const halfwayBottom = centerY + (height - centerY) / 2;

    // X-axis labels at halfway points
    ctx.fillText("-X", halfwayLeft, centerY - 8);
    ctx.fillText("+X", halfwayRight, centerY - 8);

    // Z-axis labels at halfway points
    ctx.fillText("+Z", centerX, halfwayTop);
    ctx.fillText("-Z", centerX, halfwayBottom);
  }

  private drawCenterMarker(ctx: CanvasRenderingContext2D, centerX: number, centerY: number): void {
    ctx.fillStyle = axisColor;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawNoDataMessage(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.fillStyle = "#8b949e";
    ctx.font = "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Waiting for coordinate data", width / 2, height / 2);
  }

  private updateAndDrawTrails(
    ctx: CanvasRenderingContext2D,
    userIds: number[],
    indicesCount: number,
    xComponent: DeltaNetClientComponent,
    yComponent: DeltaNetClientComponent,
    colorState: (Uint8Array | null)[],
    centerX: number,
    centerY: number,
    scale: number,
  ): void {
    for (let index = 0; index < indicesCount; index++) {
      const xValue = Number(xComponent.values[index]);
      const yValue = Number(yComponent.values[index]);

      const userIdFromIndex = userIds[index];
      let positionHistory = this.positionHistory.get(userIdFromIndex);
      if (!positionHistory) {
        positionHistory = [];
        this.positionHistory.set(userIdFromIndex, positionHistory);
      }

      positionHistory.push({ x: xValue, y: yValue });
      if (positionHistory.length > trailLength) {
        positionHistory.shift();
      }

      // Draw trail - convert world coordinates to canvas coordinates
      if (positionHistory.length > 1) {
        this.drawTrail(ctx, positionHistory, colorState[index], index, centerX, centerY, scale);
      }
    }
  }

  private drawTrail(
    ctx: CanvasRenderingContext2D,
    positionHistory: Array<{ x: number; y: number }>,
    colorState: Uint8Array | null,
    index: number,
    centerX: number,
    centerY: number,
    scale: number,
  ): void {
    const baseColor = this.getColorFromState(colorState, index);

    ctx.strokeStyle = this.addAlphaToColor(baseColor, trailOpacity);
    ctx.lineWidth = 1;
    ctx.lineCap = "round";

    ctx.beginPath();
    // Start from the most recent position (current position)
    const currentPos = positionHistory[positionHistory.length - 1];
    const canvasX = centerX + currentPos.x * scale;
    const canvasY = centerY - currentPos.y * scale;
    ctx.moveTo(canvasX, canvasY);

    // Draw backwards through history to create the trail
    for (let i = positionHistory.length - 2; i >= 0; i -= trailSkip) {
      const pos = positionHistory[i];
      const canvasX = centerX + pos.x * scale;
      const canvasY = centerY - pos.y * scale;
      ctx.lineTo(canvasX, canvasY);
    }
    ctx.stroke();
  }

  private addAlphaToColor(color: string, alpha: number): string {
    if (color.startsWith("#")) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return color;
  }

  private drawCurrentPositions(
    ctx: CanvasRenderingContext2D,
    indicesCount: number,
    localClientIndex: number | null,
    xComponent: any,
    yComponent: any,
    colorState: (Uint8Array | null)[],
    centerX: number,
    centerY: number,
    scale: number,
  ): void {
    // Draw other users - minimal styling
    for (let index = 0; index < indicesCount; index++) {
      if (index === localClientIndex) continue;

      const xValue = Number(xComponent.values[index]);
      const yValue = Number(yComponent.values[index]);
      const x = centerX + xValue * scale;
      const y = centerY - yValue * scale;

      // Only draw if within canvas bounds
      if (x < 0 || x > ctx.canvas.width || y < 0 || y > ctx.canvas.height) continue;

      const color = this.getColorFromState(colorState[index], index);

      // Simple circle - no glow or effects
      ctx.fillStyle = color;
      ctx.strokeStyle = pointStrokeColor;
      ctx.lineWidth = pointStrokeWidth;

      ctx.beginPath();
      ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Draw my position - simple square
    if (localClientIndex !== null && localClientIndex < indicesCount) {
      const xValue = Number(xComponent.values[localClientIndex]);
      const yValue = Number(yComponent.values[localClientIndex]);
      const x = centerX + xValue * scale;
      const y = centerY - yValue * scale;

      this.drawMyPosition(ctx, x, y, colorState[localClientIndex]);
    }
  }

  private drawMyPosition(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    colorState: Uint8Array | null,
  ): void {
    const color = this.getColorFromState(colorState);
    const halfSize = myPointSize / 2;

    // Simple square - no effects
    ctx.fillStyle = color;
    ctx.strokeStyle = pointStrokeColor;
    ctx.lineWidth = pointStrokeWidth;

    ctx.fillRect(x - halfSize, y - halfSize, myPointSize, myPointSize);
    ctx.strokeRect(x - halfSize, y - halfSize, myPointSize, myPointSize);
  }

  private getColorFromState(state: Uint8Array | null, index?: number): string {
    if (!state) return "white";

    try {
      // Support different color formats
      if (state.length === 3) {
        // RGB format
        const [r, g, b] = state;
        return `rgb(${r}, ${g}, ${b})`;
      } else if (state.length === 4) {
        // RGBA format
        const [r, g, b, a] = state;
        return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
      } else if (state.length >= 3) {
        // Use first 3 bytes as RGB
        const [r, g, b] = state;
        return `rgb(${r}, ${g}, ${b})`;
      } else {
        // Try to interpret as hex string or fallback to generating from bytes
        if (state.length > 0) {
          const hexString = Array.from(state)
            .map((byte: number) => byte.toString(16).padStart(2, "0"))
            .join("");

          // Pad or truncate to 6 characters for valid hex color
          const paddedHex = hexString.padEnd(6, "0").substring(0, 6);
          return "#" + paddedHex;
        }
      }
    } catch (error) {
      console.warn(`Failed to parse color state for index ${index}:`, error, state);
      return "white";
    }

    return "white";
  }

  public clearHistory(): void {
    this.positionHistory.clear();
  }

  public dispose(): void {
    if (this.disposed) return;

    try {
      // Cancel any pending animation frame
      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }

      // Disconnect resize observer
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }

      // Remove canvas from DOM
      if (this.coordinateCanvas && this.coordinateCanvas.parentNode) {
        this.coordinateCanvas.parentNode.removeChild(this.coordinateCanvas);
      }

      // Clear references
      this.coordinateCanvas = null;
      this.positionHistory.clear();
      this.disposed = true;
    } catch (error) {
      console.error("Error disposing CoordinateRenderer:", error);
    }
  }

  public isDisposed(): boolean {
    return this.disposed;
  }
}
