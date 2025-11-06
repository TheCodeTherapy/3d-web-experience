import { VirtualDataItem } from "../DataGrid/VirtualDataItem";

import styles from "./ColumnarVirtualDataRow.module.css";
import { ColumnarRenderUpdate, ColumnInstance, DataTableTheme } from "./VirtualDataTable";

export type CellFactory<GCell extends { element: HTMLElement }, GItemData> = {
  create: (width: number, theme: DataTableTheme) => GCell;
  resize: (c: GCell, width: number) => void;
  render: (c: GCell, v: GItemData) => void;
};

export type CellRecord<T extends { element: HTMLElement }, V> = [T, CellFactory<T, V>];

export class ColumnarVirtualDataRow<
  GIdentifier,
  GItemData,
  GRowUpdate extends Array<string>,
  GRenderUpdate extends ColumnarRenderUpdate<GItemData, GRowUpdate>,
> extends VirtualDataItem<GIdentifier, GItemData, GRowUpdate, GRenderUpdate> {
  private cellsByColumnKey: Map<string, CellRecord<{ element: HTMLElement }, GItemData>> =
    new Map();
  private cells: Array<CellRecord<{ element: HTMLElement }, GItemData>> = [];
  private theme: DataTableTheme;

  constructor(
    identifier: GIdentifier,
    value: GItemData,
    columns: Array<ColumnInstance<GItemData, GRowUpdate>>,
    theme: DataTableTheme,
  ) {
    super(identifier, value);
    this.theme = theme;
    this.element.classList.add(styles.columnar_virtual_data_row);
    if (this.theme["columnar-virtual-data-row"]) {
      this.element.classList.add(this.theme["columnar-virtual-data-row"]);
    }

    columns.forEach((column) => {
      this.addCell(column);
    });

    this.renderAll();
  }

  private addCell(column: ColumnInstance<GItemData, GRowUpdate>) {
    const { columnKey, cellFactory } = column;

    const cell = cellFactory.create(column.width, this.theme);

    const cellRecord: CellRecord<{ element: HTMLElement }, GItemData> = [cell, cellFactory];

    this.element.appendChild(cell.element);
    this.cells.push(cellRecord);
    this.cellsByColumnKey.set(columnKey, cellRecord);

    this.updateCell(cellRecord);
  }

  private removeCell(columnKey: string) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const cellRecord = this.cellsByColumnKey.get(columnKey)!;
    this.cells.splice(this.cells.indexOf(cellRecord), 1);
    this.element.removeChild(cellRecord[0].element);
  }

  renderAll(): void {
    this.cellsByColumnKey.forEach((cellRecord) => {
      this.updateCell(cellRecord);
    });
  }

  updateData(u: GRowUpdate): void {
    if (u.length === 0) {
      this.cellsByColumnKey.forEach((cellRecord, columnKey) => {
        this.updateCell(cellRecord);
      });
    } else {
      for (const columnKey of u) {
        const cellRecord = this.cellsByColumnKey.get(columnKey);
        if (cellRecord) {
          this.updateCell(cellRecord);
        }
      }
    }
  }

  updateRendering(r?: GRenderUpdate): void {
    if (r) {
      if (r.addColumn) {
        this.addCell(r.addColumn);
      }
      if (r.removeColumn) {
        this.removeCell(r.removeColumn);
      }
      if (r.columnWidths) {
        this.applyColumnWidths(r.columnWidths);
      }
    }
  }

  onRemove(): void {
    // no-op
  }

  private applyColumnWidths(columnWidths: Array<number>) {
    for (let i = 0; i < this.cells.length; i++) {
      const cellRecord = this.cells[i];
      const [cell, cellFactory] = cellRecord;
      cellFactory.resize(cell, columnWidths[i]);
    }
  }

  private updateCell(cellRecord: CellRecord<{ element: HTMLElement }, GItemData>) {
    cellRecord[1].render(cellRecord[0], this.itemData);
  }
}
