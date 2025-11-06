import { EZDiv } from "@ez-elements/core";

import { ColumnHeading } from "./ColumnHeading";
import styles from "./ColumnHeadings.module.css";
import { ColumnInstance, DataTableTheme } from "./VirtualDataTable";

const minimumColumnWidth = 100;

export type ColumnHeadingRecord<V, CU> = {
  columnInstance: ColumnInstance<V, CU>;
  element: ColumnHeading<V, CU>;
};

export class ColumnHeadings<V, CU> extends EZDiv {
  private columnRecords: Array<ColumnHeadingRecord<V, CU>> = [];
  private columns: Array<ColumnInstance<V, CU>> = [];
  private onRemoveColumn: (columnKey: string) => void;
  private onColumnsResized: () => void;
  private onSortChange: (column: ColumnInstance<V, CU>, ascending: boolean) => void;
  private currentSortKey: string | null = null;
  private theme: DataTableTheme;

  constructor(
    onRemoveColumn: (columnKey: string) => void,
    onColumnsResized: () => void,
    onSortChange: (column: ColumnInstance<V, CU>, ascending: boolean) => void,
    theme: DataTableTheme,
  ) {
    super();
    this.onRemoveColumn = onRemoveColumn;
    this.onColumnsResized = onColumnsResized;
    this.onSortChange = onSortChange;
    this.theme = theme;
    this.applyStyles();
    this.updateSize();
  }

  applyStyles(): void {
    this.addClass(
      styles.column_headings,
      this.theme.column_headings ? this.theme.column_headings : styles.custom_column_headings,
    );
  }

  addColumn(column: ColumnInstance<V, CU>): void {
    const columnResult = this.findColumn(column.columnKey);
    if (columnResult !== null) {
      throw new Error("column key already present");
    }

    this.columns.push(column);
    const element = new ColumnHeading(
      column,
      column.width,
      (ascending: boolean) => {
        if (this.currentSortKey !== null && this.currentSortKey !== column.columnKey) {
          const existingColumnResult = this.findColumn(this.currentSortKey);
          if (existingColumnResult !== null) {
            const [columnRecord] = existingColumnResult;
            columnRecord.element.resetSortStatus();
          }
        }
        this.currentSortKey = column.columnKey;
        this.onSortChange(column, ascending);
      },
      (newWidth) => {
        if (newWidth >= minimumColumnWidth) {
          column.width = newWidth;
          element.resize(newWidth);
          this.onColumnsResized();
          this.updateSize();
        }
      },
      () => {
        this.onRemoveColumn(column.columnKey);
      },
      this.theme,
    );
    this.columnRecords.push({
      element,
      columnInstance: column,
    });
    this.append(element);

    this.updateSize();
  }

  private findColumn(columnKey: string): [ColumnHeadingRecord<V, CU>, number] | null {
    const columnIndex = this.columnRecords.findIndex(
      (column) => column.columnInstance.columnKey === columnKey,
    );
    if (columnIndex === -1) {
      return null;
    }

    const columnRecord = this.columnRecords[columnIndex];
    return [columnRecord, columnIndex];
  }

  removeColumn(columnKey: string): void {
    const columnResult = this.findColumn(columnKey);
    if (columnResult === null) {
      throw new Error("missing column");
    }

    const [columnRecord, columnIndex] = columnResult;
    columnRecord.element.removeFromParent();

    this.columnRecords.splice(columnIndex, 1);
    this.columns.splice(columnIndex, 1);
    this.updateSize();
  }

  calculateTableWidth(): number {
    return this.columns.reduce((total, column) => {
      return total + column.width;
    }, 0);
  }

  getColumnWidths(): number[] {
    return this.columns.map((column) => column.width);
  }

  getColumns(): Array<ColumnInstance<V, CU>> {
    return this.columns;
  }

  private updateSize() {
    this.addStyles({
      width: `${this.calculateTableWidth()}px`,
    });
  }
}
