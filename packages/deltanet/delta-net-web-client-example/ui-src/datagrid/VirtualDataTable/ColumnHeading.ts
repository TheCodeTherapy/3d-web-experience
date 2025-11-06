import { ez, EZDiv, EZSpan } from "@ez-elements/core";

import styles from "./ColumnHeading.module.css";
import {
  ColumnInstance,
  DataTableTheme,
  DefaultStylingClassIdentifiersType,
} from "./VirtualDataTable";

export class ColumnHeading<V, CU> extends EZDiv {
  private onRemove: () => void;
  private onResize: (newWidth: number) => void;
  private onSort: (ascending: boolean) => void;
  private width: number;
  private sortLabel: EZSpan | null = null;
  private sortingAscending = false;
  private columnClasses: Record<string, string[]>;

  constructor(
    column: ColumnInstance<V, CU>,
    initialWidth: number,
    onSort: (ascending: boolean) => void,
    onResize: (newWidth: number) => void,
    onRemove: () => void,
    theme: DataTableTheme,
  ) {
    super();
    this.width = initialWidth;
    this.onSort = onSort;
    this.onResize = onResize;
    this.onRemove = onRemove;
    this.columnClasses = this.getColumnClasses(theme);

    this.addClass(...this.columnClasses.column_heading).append(
      ez("div")
        .addClass(...this.columnClasses.label)
        .append(
          (() => {
            const el = ez("div")
              .addClass(...this.columnClasses.label_text)
              .append(ez("span").setTextContent(column.columnKey));
            if (column.sortSettingsFactory !== undefined) {
              el.addClass(...this.columnClasses.sortable_label)
                .append(
                  (this.sortLabel = ez("span")
                    .addClass(...this.columnClasses.sort_button)
                    .setTextContent("▲")),
                )
                .onClick(() => {
                  this.sortingAscending = !this.sortingAscending;
                  this.onSort(this.sortingAscending);
                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                  this.sortLabel!.setTextContent(this.sortingAscending ? "▲" : "▼").addClass(
                    ...this.columnClasses.active_sort,
                  );
                });
            }
            return el;
          })(),
          column.removable
            ? ez("button")
                .addClass(...this.columnClasses.close_button)
                .setTextContent("✕")
                .onClick(() => {
                  this.onRemove();
                })
            : "",
        ),
      ez("div")
        .append(
          ez("span")
            .addClass(...this.columnClasses.resize_content)
            .setTextContent("||"),
        )
        .addClass(...this.columnClasses.resize_handle)
        .addEventListener("mousedown", (mouseDownEvent) => {
          let pageX = mouseDownEvent.pageX;
          const mouseMoveListener = (mouseMoveEvent: MouseEvent) => {
            const dX = mouseMoveEvent.pageX - pageX;
            pageX = mouseMoveEvent.pageX;
            this.onResize(this.width + dX);
          };
          const dismissEvent = () => {
            document.removeEventListener("mousemove", mouseMoveListener);
            document.removeEventListener("mouseleave", dismissEvent);
            document.removeEventListener("mouseup", dismissEvent);
          };
          document.addEventListener("mousemove", mouseMoveListener);
          document.addEventListener("mouseleave", dismissEvent);
          document.addEventListener("mouseup", dismissEvent);
        }),
    );

    this.resize(this.width);
  }

  getColumnClasses(theme: DataTableTheme): Record<string, string[]> {
    const baseClasses: Record<string, string[]> = {
      column_heading: [styles.column_heading],
      resize_content: [styles.resize_content],
      resize_handle: [styles.resize_handle],
      label: [styles.label],
      label_text: [styles.label_text],
      sortable_label: [styles.sortable_label],
      sort_button: [styles.sort_button],
      active_sort: [styles.active_sort],
      close_button: [styles.close_button],
    };

    // If we have a theme passed, use the theme classes
    for (const classIdentifier of Object.keys(baseClasses)) {
      const customClass = theme[classIdentifier as DefaultStylingClassIdentifiersType];
      const fallbackCustomClass = styles[`custom_${classIdentifier}` as keyof typeof styles];
      baseClasses[classIdentifier].push(customClass ? customClass : fallbackCustomClass);
    }

    return baseClasses;
  }

  resetSortStatus(): void {
    this.sortingAscending = false;
    if (this.sortLabel !== null) {
      this.sortLabel.setTextContent("▲").removeClass(...this.columnClasses.active_sort);
    }
  }

  resize(newWidth: number): void {
    this.width = newWidth;
    this.addStyles({
      width: `${this.width}px`,
    });
  }
}
