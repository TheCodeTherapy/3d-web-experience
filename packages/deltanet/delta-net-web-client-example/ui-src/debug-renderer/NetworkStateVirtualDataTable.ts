import { BufferReader } from "@mml-io/delta-net-protocol";
import { DeltaNetClientState } from "@mml-io/delta-net-web";

import { SortSettings } from "../datagrid/DataGrid/DataGrid";
import { ColumnarVirtualDataRow } from "../datagrid/VirtualDataTable/ColumnarVirtualDataRow";
import { GenericTextCell } from "../datagrid/VirtualDataTable/GenericTextCell";
import {
  ColumnarRenderUpdate,
  ColumnInstance,
  DataTableTheme,
  VirtualDataTable,
} from "../datagrid/VirtualDataTable/VirtualDataTable";

import styles from "./NetworkStateVirtualDataTable.module.css";

const textDecoder = new TextDecoder();

export type NetworkUserRow = {
  userId: number;
  index: number;
  components: Map<number, { value: bigint; delta: bigint; deltaDelta: bigint }>;
  states: Map<number, Uint8Array | null>;
};

export type NetworkUserRowUpdate = Array<string>;

export type NetworkUserRenderUpdate = ColumnarRenderUpdate<NetworkUserRow, NetworkUserRowUpdate>;

function formatState(state: Uint8Array | null): string {
  if (state === null) {
    return "null";
  }

  try {
    const hex = Array.from(state)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    let asUVarint: number | null = null;
    try {
      asUVarint = new BufferReader(state).readUVarint();
    } catch {
      // If it fails, we just leave asUVarint as null
    }

    // format === 'both'
    try {
      const stateString = textDecoder.decode(state);
      return `utf8: ${stateString}\nhex: ${hex}\nuvarint: ${asUVarint}`;
    } catch {
      return `hex: ${hex}\nuvarint: ${asUVarint}`;
    }
  } catch (error) {
    console.warn("Failed to format state:", error);
    return "error";
  }
}

function generateSortSettings<K extends keyof NetworkUserRow>(
  key: K,
): (ascending: boolean) => SortSettings<NetworkUserRow, NetworkUserRowUpdate, unknown> {
  return (ascending: boolean) => ({
    toString: (row: NetworkUserRow): string => {
      const value = row[key];
      return String(value);
    },
    extractor: (row: NetworkUserRow): unknown => {
      return row[key];
    },
    compare: (a: unknown, b: unknown) => {
      // Type-safe comparison for the specific key
      if (key === "userId" || key === "index") {
        const aNum = a as number;
        const bNum = b as number;
        return aNum - bNum;
      }

      // Generic comparison for other types
      if (typeof a === "number" && typeof b === "number") {
        return a - b;
      }

      // For non-number types, convert to string and compare
      const aStr = String(a);
      const bStr = String(b);
      if (aStr > bStr) {
        return 1;
      } else if (aStr < bStr) {
        return -1;
      }
      return 0;
    },
    updateAffectsSort: () => {
      return true;
    },
    ascending,
  });
}

// Custom row class to handle the network state data
const defaultTheme: DataTableTheme = {
  "columnar-virtual-data-row": styles["row-list"] || "",
};

export class NetworkStateVirtualDataTable extends VirtualDataTable<
  number,
  NetworkUserRow,
  NetworkUserRowUpdate,
  NetworkUserRenderUpdate
> {
  private deltaNetClientState: DeltaNetClientState | null = null;
  private userRows = new Map<number, NetworkUserRow>();
  private currentComponentIds = new Set<number>();
  private currentStateIds = new Set<number>();
  private disposed = false;
  private lastUpdateTime = 0;

  constructor() {
    super(
      generateSortSettings("userId")(true) as unknown as number,
      (
        identifier: number,
        row: NetworkUserRow,
        columns: Array<ColumnInstance<NetworkUserRow, NetworkUserRowUpdate>>,
        theme: DataTableTheme = {},
      ) => {
        return new ColumnarVirtualDataRow(identifier, row, columns, theme);
      },
      defaultTheme,
    );

    this.initializeBasicColumns();
    this.setHeight(300);
  }

  private initializeBasicColumns(): void {
    // Add basic columns
    this.addFieldColumn("User ID", {
      cellFactory: GenericTextCell((row: NetworkUserRow) => row.userId.toString()),
      removable: false,
      sortSettingsFactory: generateSortSettings("userId"),
      width: 120,
    });

    this.addFieldColumn("Index", {
      cellFactory: GenericTextCell((row: NetworkUserRow) => row.index.toString()),
      removable: false,
      sortSettingsFactory: generateSortSettings("index"),
      width: 100,
    });
  }

  public update(deltaNetClientState: DeltaNetClientState): void {
    if (this.disposed) {
      console.warn("Attempted to update disposed NetworkStateVirtualDataTable");
      return;
    }

    this.deltaNetClientState = deltaNetClientState;

    try {
      this.updateData();
    } catch (error) {
      console.error("Error updating NetworkStateVirtualDataTable:", error);
    }
  }

  private updateData(): void {
    if (!this.deltaNetClientState) return;

    const userIds = this.deltaNetClientState.getStableIds();
    const componentValues = this.deltaNetClientState.getComponentValues();
    const allStates = this.deltaNetClientState.getAllStates();

    // Track which component and state IDs are currently present
    const newComponentIds = new Set(componentValues.keys());
    const newStateIds = new Set(allStates.keys());

    // Add new component columns
    this.updateComponentColumns(newComponentIds);

    // Add new state columns
    this.updateStateColumns(newStateIds);

    // Update user rows
    this.updateUserRows(userIds, componentValues, allStates);

    // Clean up removed users
    this.cleanupRemovedUsers(new Set(userIds));
  }

  private updateComponentColumns(newComponentIds: Set<number>): void {
    for (const componentId of newComponentIds) {
      if (!this.currentComponentIds.has(componentId)) {
        this.addComponentColumns(componentId);
        this.currentComponentIds.add(componentId);
      }
    }
  }

  private updateStateColumns(newStateIds: Set<number>): void {
    for (const stateId of newStateIds) {
      if (!this.currentStateIds.has(stateId)) {
        this.addStateColumn(stateId);
        this.currentStateIds.add(stateId);
      }
    }
  }

  private updateUserRows(
    userIds: number[],
    componentValues: Map<number, any>,
    allStates: Map<number, any>,
  ): void {
    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i];
      const index = i;

      if (this.userRows.has(userId)) {
        this.updateExistingUserRow(userId, index, componentValues, allStates);
      } else {
        this.createNewUserRow(userId, index, componentValues, allStates);
      }
    }
  }

  private updateExistingUserRow(
    userId: number,
    index: number,
    componentValues: Map<number, any>,
    allStates: Map<number, any>,
  ): void {
    const existingRow = this.userRows.get(userId)!;

    // Update basic fields
    existingRow.index = index;

    // Update component data
    existingRow.components.clear();
    for (const [componentId, componentData] of componentValues) {
      if (index < componentData.values.length) {
        existingRow.components.set(componentId, {
          value: componentData.values[index],
          delta: componentData.deltas[index],
          deltaDelta: componentData.deltaDeltas[index],
        });
      }
    }

    // Update state data
    existingRow.states.clear();
    for (const [stateId, stateArray] of allStates) {
      existingRow.states.set(stateId, stateArray[index] || null);
    }

    this.updateItem(userId, []); // Empty array forces all cells to update
  }

  private createNewUserRow(
    userId: number,
    index: number,
    componentValues: Map<number, any>,
    allStates: Map<number, any>,
  ): void {
    const components = new Map<number, { value: bigint; delta: bigint; deltaDelta: bigint }>();
    for (const [componentId, componentData] of componentValues) {
      if (index < componentData.values.length) {
        components.set(componentId, {
          value: componentData.values[index],
          delta: componentData.deltas[index],
          deltaDelta: componentData.deltaDeltas[index],
        });
      }
    }

    const states = new Map<number, Uint8Array | null>();
    for (const [stateId, stateArray] of allStates) {
      states.set(stateId, stateArray[index] || null);
    }

    const userRow: NetworkUserRow = {
      userId,
      index,
      components,
      states,
    };

    this.userRows.set(userId, userRow);
    this.addItem(userId, userRow);
  }

  private cleanupRemovedUsers(currentUserIds: Set<number>): void {
    for (const userId of this.userRows.keys()) {
      if (!currentUserIds.has(userId)) {
        this.removeItem(userId);
        this.userRows.delete(userId);
      }
    }
  }

  private addComponentColumns(componentId: number): void {
    const baseWidth = 120;

    // Add value column
    this.addFieldColumn(`C${componentId}`, {
      cellFactory: GenericTextCell((row: NetworkUserRow) => {
        const comp = row.components.get(componentId);
        return comp ? comp.value.toString() : "0";
      }),
      removable: false,
      sortSettingsFactory: (ascending: boolean) => ({
        extractor: (row: NetworkUserRow): bigint => {
          const comp = row.components.get(componentId);
          return comp ? comp.value : BigInt(0);
        },
        compare: (a: unknown, b: unknown) => {
          const aVal = a as bigint;
          const bVal = b as bigint;
          if (aVal > bVal) return 1;
          if (aVal < bVal) return -1;
          return 0;
        },
        updateAffectsSort: (update: NetworkUserRowUpdate) => {
          return true;
        },
        ascending,
      }),
      width: baseWidth,
    });

    this.addFieldColumn(`C${componentId}Δ`, {
      cellFactory: GenericTextCell((row: NetworkUserRow) => {
        const comp = row.components.get(componentId);
        return comp ? comp.delta.toString() : "0";
      }),
      removable: false,
      sortSettingsFactory: (ascending: boolean) => ({
        extractor: (row: NetworkUserRow): bigint => {
          const comp = row.components.get(componentId);
          return comp ? comp.delta : BigInt(0);
        },
        compare: (a: unknown, b: unknown) => {
          const aVal = a as bigint;
          const bVal = b as bigint;
          if (aVal > bVal) return 1;
          if (aVal < bVal) return -1;
          return 0;
        },
        updateAffectsSort: (update: NetworkUserRowUpdate) => {
          return true;
        },
        ascending,
      }),
      width: baseWidth,
    });

    this.addFieldColumn(`C${componentId}ΔΔ`, {
      cellFactory: GenericTextCell((row: NetworkUserRow) => {
        const comp = row.components.get(componentId);
        return comp ? comp.deltaDelta.toString() : "0";
      }),
      removable: false,
      sortSettingsFactory: (ascending: boolean) => ({
        extractor: (row: NetworkUserRow): bigint => {
          const comp = row.components.get(componentId);
          return comp ? comp.deltaDelta : BigInt(0);
        },
        compare: (a: unknown, b: unknown) => {
          const aVal = a as bigint;
          const bVal = b as bigint;
          if (aVal > bVal) return 1;
          if (aVal < bVal) return -1;
          return 0;
        },
        updateAffectsSort: (update: NetworkUserRowUpdate) => {
          return true;
        },
        ascending,
      }),
      width: baseWidth,
    });
  }

  private addStateColumn(stateId: number): void {
    this.addFieldColumn(`S${stateId}`, {
      cellFactory: GenericTextCell((row: NetworkUserRow) => {
        const state = row.states.get(stateId);
        return formatState(state || null);
      }),
      removable: false,
      width: 250,
    });
  }

  public clearData(): void {
    this.userRows.clear();
    this.currentComponentIds.clear();
    this.currentStateIds.clear();
    // Clear the virtual table
    for (const userId of this.userRows.keys()) {
      this.removeItem(userId);
    }
  }

  public dispose(): void {
    if (this.disposed) return;

    try {
      this.clearData();
      this.deltaNetClientState = null;
      this.disposed = true;
    } catch (error) {
      console.error("Error disposing NetworkStateVirtualDataTable:", error);
    }
  }

  public isDisposed(): boolean {
    return this.disposed;
  }
}
