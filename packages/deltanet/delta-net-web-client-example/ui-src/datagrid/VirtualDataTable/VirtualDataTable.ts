import { EZDiv } from "@ez-elements/core";

import { DataGrid, DataGridOrientation, SortSettings } from "../DataGrid/DataGrid";
import { VirtualDataItem } from "../DataGrid/VirtualDataItem";

import { CellFactory } from "./ColumnarVirtualDataRow";
import { ColumnHeadings } from "./ColumnHeadings";
import styles from "./VirtualDataTable.module.css";

export enum DefaultStylingClassIdentifiers {
  "virtual-data-table",
  "grid-overlay",
  "header-row",
  "th",
  "columnar-virtual-data-row",
  "cell",
  "cell-content-wrapper",
  "column_heading",
  "resize_handle",
  "resize_content",
  "label",
  "sortable_label",
  "active_sort",
  "label_text",
  "sort_button",
  "close_button",
  "column_headings",
}
export type DefaultStylingClassIdentifiersType = Partial<
  keyof typeof DefaultStylingClassIdentifiers
>;

export type CustomClassesByIdentifier = {
  [name in DefaultStylingClassIdentifiersType]: string;
};

export type DataTableTheme = Partial<CustomClassesByIdentifier>;

export type ColumnInstance<V, U> = {
  columnKey: string;
  cellFactory: CellFactory<{ element: HTMLElement }, V>;
  sortSettingsFactory?: (ascending: boolean) => SortSettings<V, U, unknown>;
  removable: boolean;
  width: number;
};

export type ColumnOption<V, U> = {
  cellFactory: CellFactory<{ element: HTMLElement }, V>;
  removable: boolean;
  sortSettingsFactory?: (ascending: boolean) => SortSettings<V, U, unknown>;
  width?: number;
};

export type ColumnarRenderUpdate<V, U> = {
  addColumn?: ColumnInstance<V, U>;
  removeColumn?: string;
  columnWidths?: Array<number>;
};

const COLUMN_HEADINGS_HEIGHT = 38;
const DEFAULT_COLUMN_WIDTH = 150;
const ITEM_SIZE = 35;

export class VirtualDataTable<
  GIdentifier,
  GItemData,
  GRowUpdate extends Array<string>,
  GRenderUpdate,
> extends EZDiv {
  private columnHeadings: ColumnHeadings<GItemData, GRowUpdate>;
  private height = 200;
  private virtualDataGrid: DataGrid<
    GIdentifier,
    GItemData,
    GRowUpdate,
    GRenderUpdate | ColumnarRenderUpdate<GItemData, GRowUpdate>
  >;

  constructor(
    defaultSortSettings: SortSettings<GItemData, GRowUpdate, GIdentifier>,
    itemFactory: (
      identifier: GIdentifier,
      itemData: GItemData,
      columns: Array<ColumnInstance<GItemData, GRowUpdate>>,
      theme?: DataTableTheme,
    ) => VirtualDataItem<
      GIdentifier,
      GItemData,
      GRowUpdate,
      ColumnarRenderUpdate<GItemData, GRowUpdate>
    >,
    theme: DataTableTheme = {},
  ) {
    super();
    this.columnHeadings = new ColumnHeadings(
      (columnKey: string) => {
        this.removeFieldColumn(columnKey);
      },
      () => {
        this.columnsUpdated();
      },
      (column: ColumnInstance<GItemData, GRowUpdate>, ascending: boolean) => {
        if (!column.sortSettingsFactory) {
          throw new Error("Received sort callback for column without sort function");
        }
        this.virtualDataGrid.updateSortSetting(column.sortSettingsFactory(ascending));
        this.columnsUpdated();
      },
      theme,
    );

    this.virtualDataGrid = new DataGrid<
      GIdentifier,
      GItemData,
      GRowUpdate,
      GRenderUpdate | ColumnarRenderUpdate<GItemData, GRowUpdate>
    >(
      DataGridOrientation.VERTICAL,
      this.createViewSettings(this.height),
      defaultSortSettings,
      (identifier: GIdentifier, value: GItemData) => {
        return itemFactory(identifier, value, this.columnHeadings.getColumns(), theme);
      },
    );

    this.virtualDataGrid.prependHeader(this.columnHeadings.getNativeElement());
    this.append(this.virtualDataGrid);
    this.applyStyles(theme);
    this.columnsUpdated();
  }

  public setHeight(height: number): void {
    this.height = height;
    this.virtualDataGrid.updateViewSettings(this.createViewSettings(this.height));
  }

  addFieldColumn(columnKey: string, columnOption: ColumnOption<GItemData, GRowUpdate>): void {
    const column: ColumnInstance<GItemData, GRowUpdate> = {
      columnKey,
      removable: columnOption.removable,
      cellFactory: columnOption.cellFactory,
      sortSettingsFactory: columnOption.sortSettingsFactory,
      width: columnOption.width ? columnOption.width : DEFAULT_COLUMN_WIDTH,
    };

    this.columnHeadings.addColumn(column);

    this.virtualDataGrid.applyRenderUpdate({
      addColumn: column,
    });

    this.columnsUpdated();
  }

  removeFieldColumn(columnKey: string): void {
    this.columnHeadings.removeColumn(columnKey);

    this.virtualDataGrid.applyRenderUpdate({
      removeColumn: columnKey,
    });

    this.columnsUpdated();
  }

  addItem(id: GIdentifier, value: GItemData): void {
    this.virtualDataGrid.addItem(id, value);
    this.virtualDataGrid.updateView();
  }

  updateItem(id: GIdentifier, update: GRowUpdate): void {
    this.virtualDataGrid.updateItem(id, update);
  }

  removeItem(id: GIdentifier): void {
    this.virtualDataGrid.removeItem(id);
    this.virtualDataGrid.updateView();
  }

  replaceAllItems(items: Array<[GIdentifier, GItemData]>): void {
    this.virtualDataGrid.replaceAllItems(items);
  }

  private calculateTableWidth(): number {
    return this.columnHeadings.calculateTableWidth();
  }

  private createViewSettings(height: number) {
    return {
      itemSize: ITEM_SIZE,
      width: this.calculateTableWidth(),
      height,
      overScanItems: 10,
      startPadding: COLUMN_HEADINGS_HEIGHT,
      endPadding: 100,
    };
  }

  private columnsUpdated() {
    this.virtualDataGrid.updateViewSettings(this.createViewSettings(this.height));
    this.virtualDataGrid.applyRenderUpdate({
      columnWidths: this.columnHeadings.getColumnWidths(),
    });
  }

  private applyStyles(theme: DataTableTheme): void {
    this.addClass(styles["virtual-data-table"]);
    if (theme["virtual-data-table"]) {
      this.addClass(theme["virtual-data-table"]);
    }
    this.virtualDataGrid.element.classList.add(styles["grid-overlay"]);
    if (theme["grid-overlay"]) {
      this.virtualDataGrid.element.classList.add(theme["grid-overlay"]);
    }
  }
}
