import { CellFactory } from "./ColumnarVirtualDataRow";
import styles from "./GenericTextCell.module.css";
import { DataTableTheme } from "./VirtualDataTable";

type TextCell = {
  element: HTMLDivElement;
  contentWrapper: HTMLSpanElement;
  textNode: Text;
};

export function GenericTextCell<V>(
  render: (v: V) => string,
): CellFactory<{ element: HTMLElement }, V> {
  return {
    create: (width: number, theme: DataTableTheme) => {
      const cellDiv = document.createElement("div");
      cellDiv.classList.add(styles.cell, styles.genericTextCell);
      if (theme["cell"]) {
        cellDiv.classList.add(theme["cell"]);
      }
      cellDiv.style.width = `${width}px`;

      const contentWrapper = document.createElement("span");
      contentWrapper.classList.add(styles.cell_content_wrapper);
      if (theme["cell-content-wrapper"]) {
        contentWrapper.classList.add(theme["cell-content-wrapper"]);
      }
      cellDiv.append(contentWrapper);

      const textNode = document.createTextNode("");
      contentWrapper.append(textNode);

      const cell: TextCell = {
        element: cellDiv,
        contentWrapper: contentWrapper,
        textNode: textNode,
      };

      return cell as { element: HTMLElement };
    },
    render: (cell: { element: HTMLElement }, v: V) => {
      const textCell = cell as TextCell;
      textCell.textNode.nodeValue = render(v);
    },
    resize: (cell: { element: HTMLElement }, width: number) => {
      cell.element.style.width = `${width}px`;
    },
  };
}
