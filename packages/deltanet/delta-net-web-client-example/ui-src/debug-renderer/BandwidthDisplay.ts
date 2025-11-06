import {
  DeltaNetClientWebsocket,
  DeltaNetClientState,
  DeltaNetClientWebsocketStatus,
  DeltaNetClientWebsocketStatusToString,
} from "@mml-io/delta-net-web";

import styles from "./BandwidthDisplay.module.css";

export class BandwidthDisplay {
  private bandwidthDiv: HTMLDivElement;
  private textContainer: HTMLDivElement;
  private graphContainer: HTMLDivElement;
  private graphCanvas: HTMLCanvasElement | null = null;
  private graphContext: CanvasRenderingContext2D | null = null;
  private root: HTMLElement;
  private disposed = false;
  private history: Array<{
    timestamp: number;
    bytesPerSecond: number;
    componentBytesPerSecond: number;
    stateBytesPerSecond: number;
    messagesPerSecond: number;
  }> = [];
  private readonly HISTORY_LENGTH = 30; // Keep 30 seconds of history

  constructor(root: HTMLElement) {
    this.root = root;

    this.bandwidthDiv = document.createElement("div");
    this.bandwidthDiv.className = styles.bandwidthDisplay;
    this.root.appendChild(this.bandwidthDiv);

    // Create text container (flexible space at top)
    this.textContainer = document.createElement("div");
    this.textContainer.className = styles.textContainer;
    this.bandwidthDiv.appendChild(this.textContainer);

    // Create graph container (smaller fixed space at bottom)
    this.graphContainer = document.createElement("div");
    this.graphContainer.className = styles.graphContainer;
    this.bandwidthDiv.appendChild(this.graphContainer);

    // Create graph
    this.createGraph();
  }

  public initialize(): HTMLDivElement | null {
    if (this.disposed) return null;

    if (!this.bandwidthDiv) {
      this.bandwidthDiv = this.root.querySelector(`.${styles.display}`) as HTMLDivElement;
    }
    return this.bandwidthDiv;
  }

  public update(
    deltaNetClientState: DeltaNetClientState,
    deltaNetClientWebsocket: DeltaNetClientWebsocket | null,
  ): void {
    if (this.disposed) return;

    // Update history
    this.updateHistory(deltaNetClientWebsocket);

    // Generate display content
    const content = this.generateDisplayContent(deltaNetClientWebsocket, deltaNetClientState);
    if (this.textContainer) {
      this.textContainer.textContent = content;
    }

    this.updateGraph();
  }

  private updateHistory(deltaNetClientWebsocket: DeltaNetClientWebsocket | null): void {
    if (!deltaNetClientWebsocket) return;

    const now = Date.now();
    const lastSecondMessages = deltaNetClientWebsocket.lastSecondMessageSizes.length || 1;
    const totalBytesPerSecond = deltaNetClientWebsocket.bandwidthPerSecond;
    const componentBytesPerSecond = deltaNetClientWebsocket.componentBytesPerSecond;
    const stateBytesPerSecond = deltaNetClientWebsocket.stateBytesPerSecond;

    this.history.push({
      timestamp: now,
      bytesPerSecond: totalBytesPerSecond,
      componentBytesPerSecond: componentBytesPerSecond,
      stateBytesPerSecond: stateBytesPerSecond,
      messagesPerSecond: lastSecondMessages,
    });

    // Remove old entries (older than HISTORY_LENGTH seconds)
    const cutoff = now - this.HISTORY_LENGTH * 1000;
    this.history = this.history.filter((entry) => entry.timestamp > cutoff);
  }

  private createGraph(): void {
    // Create canvas element without setting dimensions yet
    this.graphCanvas = document.createElement("canvas");
    this.graphCanvas.className = styles.graphCanvas;
    this.graphContext = this.graphCanvas.getContext("2d");
    this.graphContainer.appendChild(this.graphCanvas);
  }

  private updateGraph(): void {
    if (!this.graphContext || !this.graphCanvas || this.history.length < 2) return;

    // Calculate dimensions to use most of the available container space on each render
    const containerRect = this.graphContainer.getBoundingClientRect();
    const padding = 20; // Account for container padding (10px * 2)
    const graphWidth = Math.max(300, containerRect.width - padding);
    const graphHeight = Math.max(80, containerRect.height - padding);

    // Update canvas dimensions if they've changed
    if (this.graphCanvas.width !== graphWidth || this.graphCanvas.height !== graphHeight) {
      this.graphCanvas.width = graphWidth;
      this.graphCanvas.height = graphHeight;
      this.graphCanvas.style.width = `${graphWidth}px`;
      this.graphCanvas.style.height = `${graphHeight}px`;
    }

    const ctx = this.graphContext;
    const canvas = this.graphCanvas;
    const width = canvas.width;
    const height = canvas.height;
    const leftPadding = 60; // Increased for Y-axis labels
    const otherPadding = 20;
    const drawingWidth = width - leftPadding - otherPadding;
    const drawingHeight = height - 2 * otherPadding;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    // Find max value for scaling
    const maxBandwidth = Math.max(
      ...this.history.map((entry) =>
        Math.max(entry.bytesPerSecond, entry.componentBytesPerSecond, entry.stateBytesPerSecond),
      ),
    );

    if (maxBandwidth === 0) return;

    // Draw grid - always 30 seconds
    this.drawGrid(ctx, leftPadding, otherPadding, drawingWidth, drawingHeight, maxBandwidth);

    // Draw legend
    this.drawLegend(ctx, width - 150, 10);

    // Draw bandwidth lines
    this.drawBandwidthLine(
      ctx,
      leftPadding,
      otherPadding,
      drawingWidth,
      drawingHeight,
      maxBandwidth,
      "bytesPerSecond",
      "#00ff00",
      "Total",
    );
    this.drawBandwidthLine(
      ctx,
      leftPadding,
      otherPadding,
      drawingWidth,
      drawingHeight,
      maxBandwidth,
      "componentBytesPerSecond",
      "#ff6600",
      "Component",
    );
    this.drawBandwidthLine(
      ctx,
      leftPadding,
      otherPadding,
      drawingWidth,
      drawingHeight,
      maxBandwidth,
      "stateBytesPerSecond",
      "#0066ff",
      "State",
    );
  }

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    leftPadding: number,
    topPadding: number,
    graphWidth: number,
    graphHeight: number,
    maxBandwidth: number,
  ): void {
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;

    // Vertical grid lines (time)
    const timeSteps = 6;
    for (let i = 0; i <= timeSteps; i++) {
      const x = leftPadding + (i * graphWidth) / timeSteps;
      ctx.beginPath();
      ctx.moveTo(x, topPadding);
      ctx.lineTo(x, topPadding + graphHeight);
      ctx.stroke();
    }

    // Horizontal grid lines (bandwidth)
    const bandwidthSteps = 5;
    for (let i = 0; i <= bandwidthSteps; i++) {
      const y = topPadding + (i * graphHeight) / bandwidthSteps;
      ctx.beginPath();
      ctx.moveTo(leftPadding, y);
      ctx.lineTo(leftPadding + graphWidth, y);
      ctx.stroke();
    }

    // Y-axis labels (bandwidth values)
    ctx.fillStyle = "#ffffff";
    ctx.font = "11px monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (let i = 0; i <= bandwidthSteps; i++) {
      const y = topPadding + graphHeight - (i * graphHeight) / bandwidthSteps;
      const value = (i * maxBandwidth) / bandwidthSteps;
      const label = this.formatBytes(value);

      // Draw background for better readability
      const textMetrics = ctx.measureText(label);
      const textWidth = textMetrics.width;
      const textHeight = 12;

      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillRect(leftPadding - textWidth - 10, y - textHeight / 2, textWidth + 8, textHeight);

      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, leftPadding - 6, y);
    }

    // X-axis labels (time) - always 30 seconds
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff";

    for (let i = 0; i <= timeSteps; i++) {
      const x = leftPadding + (i * graphWidth) / timeSteps;
      const secondsAgo = this.HISTORY_LENGTH - (i * this.HISTORY_LENGTH) / timeSteps;
      const label = `-${Math.round(secondsAgo)}s`;

      // Draw background for better readability
      const textMetrics = ctx.measureText(label);
      const textWidth = textMetrics.width;
      const textHeight = 12;

      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillRect(x - textWidth / 2 - 2, topPadding + graphHeight + 2, textWidth + 4, textHeight);

      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, x, topPadding + graphHeight + 4);
    }

    // Draw axis lines for better definition
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 2;

    // Y-axis line
    ctx.beginPath();
    ctx.moveTo(leftPadding, topPadding);
    ctx.lineTo(leftPadding, topPadding + graphHeight);
    ctx.stroke();

    // X-axis line
    ctx.beginPath();
    ctx.moveTo(leftPadding, topPadding + graphHeight);
    ctx.lineTo(leftPadding + graphWidth, topPadding + graphHeight);
    ctx.stroke();
  }

  private drawLegend(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const legends = [
      { color: "#00ff00", label: "Total" },
      { color: "#ff6600", label: "Component" },
      { color: "#0066ff", label: "State" },
    ];

    ctx.font = "12px monospace";
    ctx.textAlign = "left";

    legends.forEach((legend, index) => {
      const lineY = y + index * 20;

      // Draw colored line
      ctx.strokeStyle = legend.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, lineY + 6);
      ctx.lineTo(x + 15, lineY + 6);
      ctx.stroke();

      // Draw label
      ctx.fillStyle = "#ccc";
      ctx.fillText(legend.label, x + 20, lineY + 10);
    });
  }

  private drawBandwidthLine(
    ctx: CanvasRenderingContext2D,
    leftPadding: number,
    topPadding: number,
    graphWidth: number,
    graphHeight: number,
    maxBandwidth: number,
    property: keyof (typeof this.history)[0],
    color: string,
    label: string,
  ): void {
    if (this.history.length < 2) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    // Always use 30-second range for X positioning
    const now = Date.now();
    const thirtySecondsAgo = now - this.HISTORY_LENGTH * 1000;

    let hasMovedTo = false;

    this.history.forEach((entry) => {
      // Position based on 30-second timeline
      const timeFromThirtySecondsAgo = entry.timestamp - thirtySecondsAgo;
      const timeProgress = timeFromThirtySecondsAgo / (this.HISTORY_LENGTH * 1000);
      const x = leftPadding + timeProgress * graphWidth;

      const value = entry[property] as number;
      const y = topPadding + graphHeight - (value / maxBandwidth) * graphHeight;

      // Only draw points that are within the visible range
      if (timeProgress >= 0 && timeProgress <= 1) {
        if (!hasMovedTo) {
          ctx.moveTo(x, y);
          hasMovedTo = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });

    ctx.stroke();
  }

  private generateDisplayContent(
    deltaNetClientWebsocket: DeltaNetClientWebsocket | null,
    deltaNetClientState: DeltaNetClientState,
  ): string {
    const lines: string[] = [];

    // If there is no connection then show disconnected status
    if (!deltaNetClientWebsocket) {
      return "Status: Disconnected";
    }

    const status = deltaNetClientWebsocket.getStatus();
    const statusString = DeltaNetClientWebsocketStatusToString(status);

    lines.push(`Status: ${statusString}`);

    if (status !== DeltaNetClientWebsocketStatus.Connected) {
      return lines.join("\n");
    }

    const bandwidth = deltaNetClientWebsocket.bandwidthPerSecond;
    const componentBandwidth = deltaNetClientWebsocket.componentBytesPerSecond;
    const stateBandwidth = deltaNetClientWebsocket.stateBytesPerSecond;

    lines.push(`Total Bandwidth: ${this.formatBytes(bandwidth)}/s`);
    lines.push(`Component Bandwidth: ${this.formatBytes(componentBandwidth)}/s`);
    lines.push(`State Bandwidth: ${this.formatBytes(stateBandwidth)}/s`);

    const messagesPerSecond = deltaNetClientWebsocket.lastSecondMessageSizes.length || 0;
    lines.push(`Messages: ${messagesPerSecond}/s`);

    // User and component stats
    const indicesCount = deltaNetClientState.getIndicesCount();
    lines.push(`Active Clients: ${indicesCount}`);

    const componentValues = deltaNetClientState.getComponentValues();
    const numberOfComponents = componentValues.size;

    lines.push(`Components: ${numberOfComponents}`);

    if (numberOfComponents > 0 && indicesCount > 0) {
      const lastSecondComponentMessages =
        deltaNetClientWebsocket.lastSecondComponentBufferSizes.length || 1;
      const bytesPerComponent =
        deltaNetClientWebsocket.componentBytesPerSecond /
        lastSecondComponentMessages /
        (numberOfComponents * indicesCount);
      const bitsPerComponent = bytesPerComponent * 8;

      lines.push(
        `Per component: ${this.formatNumber(bytesPerComponent)} bytes (${this.formatNumber(bitsPerComponent)} bits)`,
      );
    }

    // Average stats over history
    if (this.history.length > 1) {
      lines.push("");

      // Calculate actual time span of the data
      const oldestTimestamp = this.history[0].timestamp;
      const newestTimestamp = this.history[this.history.length - 1].timestamp;
      const timeSpanSeconds = Math.round((newestTimestamp - oldestTimestamp) / 1000);
      const displayTimeSpan = Math.min(timeSpanSeconds, this.HISTORY_LENGTH);

      lines.push(`Averages (${displayTimeSpan}s window):`);

      const avgBandwidth =
        this.history.reduce((sum, entry) => sum + entry.bytesPerSecond, 0) / this.history.length;
      const avgComponentBandwidth =
        this.history.reduce((sum, entry) => sum + entry.componentBytesPerSecond, 0) /
        this.history.length;
      const avgStateBandwidth =
        this.history.reduce((sum, entry) => sum + entry.stateBytesPerSecond, 0) /
        this.history.length;
      const avgMessages =
        this.history.reduce((sum, entry) => sum + entry.messagesPerSecond, 0) / this.history.length;

      lines.push(`Avg Total Bandwidth: ${this.formatBytes(avgBandwidth)}/s`);
      lines.push(`Avg Component Bandwidth: ${this.formatBytes(avgComponentBandwidth)}/s`);
      lines.push(`Avg State Bandwidth: ${this.formatBytes(avgStateBandwidth)}/s`);
      lines.push(`Avg Messages: ${this.formatNumber(avgMessages)}/s`);

      // Peak stats
      const maxBandwidth = Math.max(...this.history.map((entry) => entry.bytesPerSecond));
      const maxComponentBandwidth = Math.max(
        ...this.history.map((entry) => entry.componentBytesPerSecond),
      );
      const maxStateBandwidth = Math.max(...this.history.map((entry) => entry.stateBytesPerSecond));
      const maxMessages = Math.max(...this.history.map((entry) => entry.messagesPerSecond));

      lines.push("");
      lines.push("Peak values:");
      lines.push(`Peak Total Bandwidth: ${this.formatBytes(maxBandwidth)}/s`);
      lines.push(`Peak Component Bandwidth: ${this.formatBytes(maxComponentBandwidth)}/s`);
      lines.push(`Peak State Bandwidth: ${this.formatBytes(maxStateBandwidth)}/s`);
      lines.push(`Peak Messages: ${maxMessages}/s`);
    }

    return lines.join("\n");
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";

    const units = ["B", "KB", "MB", "GB"];
    const base = 1024;
    let value = bytes;
    let unitIndex = 0;

    while (value >= base && unitIndex < units.length - 1) {
      value /= base;
      unitIndex++;
    }

    return `${this.formatNumber(value)} ${units[unitIndex]}`;
  }

  private formatNumber(num: number): string {
    return num.toFixed(2);
  }

  private hideDisplay(): void {
    if (this.bandwidthDiv && this.bandwidthDiv.parentNode) {
      this.bandwidthDiv.parentNode.removeChild(this.bandwidthDiv);
    }
  }

  public clearHistory(): void {
    this.history = [];
  }

  public getAverageStats(seconds?: number): {
    bandwidth: number;
    componentBandwidth: number;
    stateBandwidth: number;
    messages: number;
  } | null {
    if (this.history.length === 0) return null;

    const entries = seconds ? this.history.slice(-seconds) : this.history;

    if (entries.length === 0) return null;

    const avgBandwidth =
      entries.reduce((sum, entry) => sum + entry.bytesPerSecond, 0) / entries.length;
    const avgComponentBandwidth =
      entries.reduce((sum, entry) => sum + entry.componentBytesPerSecond, 0) / entries.length;
    const avgStateBandwidth =
      entries.reduce((sum, entry) => sum + entry.stateBytesPerSecond, 0) / entries.length;
    const avgMessages =
      entries.reduce((sum, entry) => sum + entry.messagesPerSecond, 0) / entries.length;

    return {
      bandwidth: avgBandwidth,
      componentBandwidth: avgComponentBandwidth,
      stateBandwidth: avgStateBandwidth,
      messages: avgMessages,
    };
  }

  public dispose(): void {
    if (this.disposed) return;

    try {
      this.hideDisplay();
      this.history = [];
      this.disposed = true;
    } catch (error) {
      console.error("Error disposing BandwidthDisplay:", error);
    }
  }

  public isDisposed(): boolean {
    return this.disposed;
  }
}
