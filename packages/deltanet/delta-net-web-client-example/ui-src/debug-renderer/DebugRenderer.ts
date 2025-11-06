import { DeltaNetClientState, DeltaNetClientWebsocket } from "@mml-io/delta-net-web";

import { BandwidthDisplay } from "./BandwidthDisplay";
import { CoordinateRenderer } from "./CoordinateRenderer";
import styles from "./DebugRenderer.module.css";
import { NetworkStateVirtualDataTable } from "./NetworkStateVirtualDataTable";

export interface DebugRendererConfig {
  halfWidth: number;
  xComponentId: number;
  yComponentId: number;
  colorStateId?: number;
}

export class DebugRenderer {
  private root: HTMLElement;

  private coordinateRenderer: CoordinateRenderer;
  private bandwidthDisplay: BandwidthDisplay;
  private networkStateVirtualDataTable: NetworkStateVirtualDataTable;

  private tableContainer: HTMLElement;
  private coordinateContainer: HTMLElement;
  private bandwidthContainer: HTMLElement;
  private disposed = false;

  constructor(
    root: HTMLElement,
    private config: DebugRendererConfig,
  ) {
    this.root = root;

    this.root.innerHTML = "";
    this.root.className = styles.container;

    // Create main grid container
    const gridContainer = document.createElement("div");
    gridContainer.className = styles.grid;
    this.root.appendChild(gridContainer);

    // Initialize network state table
    this.networkStateVirtualDataTable = new NetworkStateVirtualDataTable();

    this.tableContainer = document.createElement("div");
    this.tableContainer.className = `${styles.section} ${styles.tableContainer}`;

    this.tableContainer.appendChild(this.networkStateVirtualDataTable.getNativeElement());
    gridContainer.appendChild(this.tableContainer);

    // Initialize coordinate renderer
    this.coordinateContainer = document.createElement("div");
    this.coordinateContainer.className = `${styles.section} ${styles.coordinateContainer}`;
    gridContainer.appendChild(this.coordinateContainer);
    this.coordinateRenderer = new CoordinateRenderer(this.coordinateContainer, this.config);

    // Initialize bandwidth display
    this.bandwidthContainer = document.createElement("div");
    this.bandwidthContainer.className = `${styles.section} ${styles.bandwidthContainer}`;
    gridContainer.appendChild(this.bandwidthContainer);
    this.bandwidthDisplay = new BandwidthDisplay(this.bandwidthContainer);
  }

  public update(
    deltaNetClientState: DeltaNetClientState,
    deltaNetClientWebsocket: DeltaNetClientWebsocket | null,
  ): void {
    if (this.disposed) {
      console.warn("Attempted to update disposed DebugRenderer");
      return;
    }

    try {
      // Update coordinate renderer
      this.coordinateRenderer.render(deltaNetClientState);

      // Update network state table
      this.networkStateVirtualDataTable.update(deltaNetClientState);

      // Update bandwidth display
      this.bandwidthDisplay.update(deltaNetClientState, deltaNetClientWebsocket);
    } catch (error) {
      console.error("Failed to update DebugRenderer:", error);
    }
  }

  public getCoordinateRenderer(): CoordinateRenderer | null {
    return this.coordinateRenderer;
  }

  public dispose(): void {
    if (this.disposed) return;

    try {
      this.coordinateRenderer.dispose();
      this.bandwidthDisplay.dispose();
      this.networkStateVirtualDataTable.dispose();
      this.disposed = true;
    } catch (error) {
      console.error("Failed to dispose DebugRenderer:", error);
    }
  }

  public isDisposed(): boolean {
    return this.disposed;
  }
}
