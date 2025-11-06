import styles from "./DataGrid.module.css";
import { getScrollbarWidth } from "./getScrollbarWidth";
import { VirtualDataItem } from "./VirtualDataItem";

export enum DataGridOrientation {
  VERTICAL,
  HORIZONTAL,
}

export type SortSettings<V, U, ExtractedValue> = {
  toString: (itemData: V) => string;
  extractor: (itemData: V) => ExtractedValue;
  compare: (a: ExtractedValue, b: ExtractedValue) => number;
  updateAffectsSort: (update: U) => boolean;
  ascending: boolean;
};

export type ViewSettings = {
  // width is the visible width of the view.
  width: number;
  // height is the visible height of the view.
  height: number;
  // itemSize is the fixed size for each item in the view.
  itemSize: number;
  // overScanItems is the number of items to render outside of the visible.
  overScanItems: number;
  // startPadding is the amount of padding applied to the view on the top/left.
  startPadding: number;
  // endPadding is the amount of padding applied to the view on the bottom/right.
  endPadding: number;
};

// [identifier, value, precomputedSortValue]
type DataGridSortTuple<K, V> = [K, V, unknown];

export type ItemFactory<
  K,
  V,
  ItemUpdate extends Record<never, never>,
  RenderUpdate extends Record<never, never>,
> = (identifier: K, itemData: V) => VirtualDataItem<K, V, ItemUpdate, RenderUpdate>;

export class DataGrid<GIdentifier, GItemData, GItemUpdate extends Array<string>, GRenderUpdate> {
  // element is the top level element of the DataGrid.
  public element: HTMLDivElement;
  // scrollable is the scrollable viewport of the DataGrid.
  private scrollable: HTMLDivElement;
  // container is the holder of visible content that is positioned in the visible window of the scrollable.
  private container: HTMLDivElement;
  // spacerElement is an element that creates the necessary width/height inside scrollable.
  private spacerElement: HTMLDivElement;

  private map: Map<GIdentifier, DataGridSortTuple<GIdentifier, GItemData>> = new Map();

  // sorted is the sorted dataset of the DataGrid.
  private sorted: Array<DataGridSortTuple<GIdentifier, GItemData>> = [];

  // visibleItems represent the immediately visible items in the DataGrid.
  private visibleItems: Array<VirtualDataItem<GIdentifier, GItemData, GItemUpdate, GRenderUpdate>> =
    [];
  // visibleItemMap represents the immediately visible items of the DataGrid for fast lookup.
  private visibleItemMap: Map<
    GIdentifier,
    VirtualDataItem<GIdentifier, GItemData, GItemUpdate, GRenderUpdate>
  > = new Map();

  // visibleStartIndex represents the index of the first immediately visible item.
  private visibleStartIndex = 0;
  // visibleEndIndex represents the index of the last immediately visible item.
  private visibleEndIndex = 1;

  // Cache the scroll position when it is observed to avoid accessing scrollTop whenever data changes as it
  // causes a potentially expensive layout calculation

  constructor(
    private orientation: DataGridOrientation,
    // viewSettings represents the visible items configuration for the DataGrid.
    private viewSettings: ViewSettings,
    // sortSettings represents the sort configuration for the DataGrid.
    private sortSetting: SortSettings<GItemData, GItemUpdate, unknown>,
    // itemFactory represents the constructor used to visualise an individual item of the DataGrid.
    private itemFactory: (
      identifier: GIdentifier,
      itemData: GItemData,
    ) => VirtualDataItem<GIdentifier, GItemData, GItemUpdate, GRenderUpdate>,
  ) {
    this.element = document.createElement("div");
    this.element.className = styles.dataGrid;

    this.scrollable = document.createElement("div");
    this.scrollable.className = styles.scrollable;
    switch (this.orientation) {
      case DataGridOrientation.VERTICAL:
        this.scrollable.classList.add(styles.scrollableVertical);
        break;
      case DataGridOrientation.HORIZONTAL:
        this.scrollable.classList.add(styles.scrollableHorizontal);
        break;
    }
    this.element.appendChild(this.scrollable);

    this.spacerElement = document.createElement("div");
    this.spacerElement.className = styles.spacer;
    this.scrollable.appendChild(this.spacerElement);

    this.container = document.createElement("div");
    this.container.className = styles.container;
    this.scrollable.appendChild(this.container);

    this.scrollable.addEventListener(
      "scroll",
      () => {
        this.calculateVisibleRegion();
      },
      {
        passive: true,
      },
    );

    this.updateViewSettings(viewSettings);
  }

  public getTotalNumberOfRows(): number {
    return this.sorted.length;
  }

  public getValueAtOffset(index: number): GItemData | null {
    if (index < this.sorted.length) {
      return this.sorted[index][1];
    }
    return null;
  }

  public getIdAtOffset(index: number): GIdentifier | null {
    if (index < this.sorted.length) {
      return this.sorted[index][0];
    }
    return null;
  }

  public updateSortSetting(sortSetting: SortSettings<GItemData, GItemUpdate, unknown>): void {
    this.sortSetting = sortSetting;

    for (const item of this.sorted) {
      item[2] = this.sortSetting.extractor(item[1]);
    }

    this.reapplySort();
  }

  public bulkAddItem(items: Array<[GIdentifier, GItemData]>): void {
    items.forEach((item) => {
      const computedSortValue = this.sortSetting.extractor(item[1]);
      const sortTuple: DataGridSortTuple<GIdentifier, GItemData> = [
        item[0],
        item[1],
        computedSortValue,
      ];
      this.map.set(item[0], sortTuple);
      this.sorted.push(sortTuple);
    });

    this.reapplySort();
  }

  public replaceAllItems(items: Array<[GIdentifier, GItemData]>): void {
    this.sorted = [];
    this.map.clear();

    this.bulkAddItem(items);
  }

  public addItem(identifier: GIdentifier, itemData: GItemData): void {
    const computedSortValue = this.sortSetting.extractor(itemData);

    const sortTuple: DataGridSortTuple<GIdentifier, GItemData> = [
      identifier,
      itemData,
      computedSortValue,
    ];
    this.map.set(identifier, sortTuple);

    if (this.sorted.length === 0) {
      const sortIndex = this.sorted.push(sortTuple) - 1;
      this.addNewLastItem(sortIndex);
      return;
    }

    const insertionIndex = this.findInsertionIndex(computedSortValue);
    this.sorted.splice(insertionIndex, 0, sortTuple);

    if (insertionIndex > this.visibleEndIndex) {
      // no need to create a new item and this item isn't visible
    } else if (insertionIndex < this.visibleStartIndex) {
      // this item was inserted before the start of the visible range and therefore has pushed everything one item forwards
      this.addNewFirstItem(this.visibleStartIndex);

      if (this.visibleEndIndex < this.sorted.length - 1) {
        // the items extend beyond the visible range so the last one should be removed
        this.removeLastItem();
      }
    } else {
      // this item is going to be visible
      this.insertIntoVisibleItems(identifier, itemData, insertionIndex - this.visibleStartIndex);
    }
  }

  public updateItem(identifier: GIdentifier, update: GItemUpdate): void {
    if (this.sortSetting.updateAffectsSort(update)) {
      const currentSortTuple = this.map.get(identifier);
      if (currentSortTuple === undefined) {
        throw new Error(`unrecognised identifier updated: ${identifier}`);
      }

      const currentExtractedValue = currentSortTuple[2];
      const itemData = currentSortTuple[1];

      const currentIndexInSorted = this.indexOfIdentifierInSorted(
        identifier,
        currentExtractedValue,
      );
      this.sorted.splice(currentIndexInSorted, 1);

      // Assume that the underlying object has already been mutated and the extractor should work
      const newExtractedValue = this.sortSetting.extractor(itemData);
      const newIndexInSorted = this.findInsertionIndex(newExtractedValue);
      currentSortTuple[2] = newExtractedValue;

      this.sorted.splice(newIndexInSorted, 0, currentSortTuple);

      if (currentIndexInSorted < this.visibleStartIndex) {
        // was previously before the visible window

        if (newIndexInSorted < this.visibleStartIndex) {
          // has moved to a different place in the sort order before the window - no need to update
          return;
        } else if (newIndexInSorted > this.visibleEndIndex) {
          // has moved from before to after - move all elements backwards
          this.removeFirstItem();
          this.addNewLastItem(this.visibleEndIndex);
        } else {
          // is now visible
          this.removeFirstItem();
          this.insertIntoVisibleItems(
            identifier,
            itemData,
            newIndexInSorted - this.visibleStartIndex,
          );
        }
      } else if (currentIndexInSorted > this.visibleEndIndex) {
        // was previously after the visible window

        if (newIndexInSorted > this.visibleEndIndex) {
          // has moved to a different place in the sort order after the window - no need to update
          return;
        } else if (newIndexInSorted < this.visibleStartIndex) {
          this.removeLastItem();
          this.addNewFirstItem(this.visibleStartIndex);
        } else {
          // is now visible
          this.insertIntoVisibleItems(
            identifier,
            itemData,
            newIndexInSorted - this.visibleStartIndex,
          );
        }
      } else {
        const item = this.visibleItemMap.get(identifier);
        if (item === undefined) {
          throw new Error("Item should have been visible");
        }

        if (newIndexInSorted > this.visibleEndIndex) {
          // has moved out of the visible window and is now after the window

          item.remove();
          this.visibleItemMap.delete(identifier);
          const index = this.visibleItems.indexOf(item);
          this.visibleItems.splice(index, 1);

          this.addNewLastItem(this.visibleEndIndex);
          return;
        } else if (newIndexInSorted < this.visibleStartIndex) {
          // has moved out of the visible window and is now before the window

          item.remove();
          this.visibleItemMap.delete(identifier);
          const index = this.visibleItems.indexOf(item);
          this.visibleItems.splice(index, 1);

          this.addNewFirstItem(this.visibleStartIndex);
        } else {
          // is still visible - might have moved?
          const currentIndexIntoVisibleItems = currentIndexInSorted - this.visibleStartIndex;
          const indexIntoVisibleItems = newIndexInSorted - this.visibleStartIndex;
          if (indexIntoVisibleItems === currentIndexIntoVisibleItems) {
            item.updateData(update);
            return;
          }
          this.visibleItems.splice(currentIndexIntoVisibleItems, 1);
          this.visibleItems.splice(indexIntoVisibleItems, 0, item);
          if (indexIntoVisibleItems === this.visibleItems.length - 1) {
            item.appendBefore(this.container, null);
          } else {
            item.appendBefore(this.container, this.visibleItems[indexIntoVisibleItems + 1].element);
          }
          item.updateData(update);
        }
      }
    } else {
      const item = this.visibleItemMap.get(identifier);
      if (item) {
        item.updateData(update);
      }
    }
  }

  public removeItem(identifier: GIdentifier): void {
    const currentSortTuple = this.map.get(identifier);
    if (currentSortTuple === undefined) {
      throw new Error(`unrecognised identifier updated: ${identifier}`);
    }

    this.map.delete(identifier);

    const sortedIndex = this.indexOfIdentifierInSorted(identifier, currentSortTuple[2]);
    this.sorted.splice(sortedIndex, 1);

    if (sortedIndex > this.visibleEndIndex) {
      // was not visible and cannot affect visible items
      return;
    } else {
      if (sortedIndex < this.visibleStartIndex) {
        // Was before the visible range - this moves all items backwards
        if (this.visibleItems.length > 0) {
          this.removeFirstItem();
        }
      } else {
        const item = this.visibleItemMap.get(identifier);
        if (item === undefined) {
          throw new Error("Item should have been visible");
        }
        item.remove();
        this.visibleItemMap.delete(identifier);
        const index = this.visibleItems.indexOf(item);
        this.visibleItems.splice(index, 1);
      }

      if (this.sorted.length > this.visibleEndIndex) {
        this.addNewLastItem(this.visibleEndIndex);
      }
    }
  }

  public appendTo(parent: HTMLElement): void {
    parent.appendChild(this.element);
  }

  public applyRenderUpdate(renderUpdate?: GRenderUpdate): void {
    for (const item of this.visibleItems) {
      item.updateRendering(renderUpdate);
    }
  }

  public prependHeader(header: HTMLElement): void {
    this.scrollable.prepend(header);
  }

  public updateViewSettings(viewSettings: ViewSettings): void {
    this.viewSettings = viewSettings;
    switch (this.orientation) {
      case DataGridOrientation.VERTICAL:
        this.scrollable.style.height = `${this.viewSettings.height}px`;
        break;
      case DataGridOrientation.HORIZONTAL:
        this.scrollable.style.width = `${this.viewSettings.width}px`;
        this.scrollable.style.height = `${this.viewSettings.height + getScrollbarWidth()}px`;
        break;
    }
    this.calculateVisibleRegion();
    this.updateView();
  }

  public updateView(): void {
    switch (this.orientation) {
      case DataGridOrientation.VERTICAL: {
        this.container.style.top = `${
          this.visibleStartIndex * this.viewSettings.itemSize + this.viewSettings.startPadding
        }px`;
        this.container.style.left = "0px";

        const totalHeight =
          this.sorted.length * this.viewSettings.itemSize +
          this.viewSettings.startPadding +
          this.viewSettings.endPadding;
        this.spacerElement.style.height = `${totalHeight}px`;

        break;
      }
      case DataGridOrientation.HORIZONTAL: {
        this.container.style.top = "0px";
        this.container.style.left = `${
          this.visibleStartIndex * this.viewSettings.itemSize + this.viewSettings.startPadding
        }px`;
        const totalWidth =
          this.sorted.length * this.viewSettings.itemSize +
          this.viewSettings.startPadding +
          this.viewSettings.endPadding;
        this.spacerElement.style.width = `${totalWidth}px`;
        break;
      }
    }
  }

  private resetFromSorted() {
    // All new items - just start afresh
    while (this.visibleItems.length > 0) {
      this.removeLastItem();
    }

    for (let i = this.visibleStartIndex; i <= this.visibleEndIndex && i < this.sorted.length; i++) {
      this.addNewLastItem(i);
    }
  }

  private reapplySort(): void {
    this.sorted.sort((a, b) => {
      return (this.sortSetting.ascending ? 1 : -1) * this.sortSetting.compare(a[2], b[2]);
    });

    this.resetFromSorted();
    this.updateView();
  }

  private changeVisibleStartAndEnd(newStart: number, newEnd: number) {
    if (newStart < 0) {
      throw new Error("start cannot be less than zero");
    }

    if (newStart > this.visibleEndIndex || newEnd < this.visibleStartIndex) {
      this.visibleStartIndex = newStart;
      this.visibleEndIndex = newEnd;
      this.resetFromSorted();
      this.updateView();
    } else {
      const diffFromStart = this.visibleStartIndex - newStart; // positive is adding to start
      const diffFromEnd = newEnd - Math.min(this.visibleEndIndex, this.sorted.length - 1); // positive is adding to end

      if (diffFromStart < 0) {
        const toRemove = -diffFromStart;
        for (let i = 0; i < toRemove; i++) {
          this.removeFirstItem();
        }
      } else if (diffFromStart > 0) {
        for (let i = 0; i < diffFromStart; i++) {
          const indexInSort = this.visibleStartIndex - (i + 1);
          if (indexInSort < this.sorted.length) {
            this.addNewFirstItem(indexInSort);
          }
        }
      }

      if (diffFromEnd < 0) {
        const toRemove = -diffFromEnd;
        for (let i = 0; i < toRemove; i++) {
          this.removeLastItem();
        }
      } else if (diffFromEnd > 0) {
        for (let i = 0; i < diffFromEnd; i++) {
          const indexInSort = this.visibleEndIndex + i + 1;
          if (indexInSort < this.sorted.length) {
            this.addNewLastItem(indexInSort);
          }
        }
      }

      this.visibleStartIndex = newStart;
      this.visibleEndIndex = newEnd;
      this.updateView();
    }
  }

  private removeFirstItem() {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const firstItem = this.visibleItems.shift()!;
    firstItem.remove();
    this.visibleItemMap.delete(firstItem.identifier);
  }

  private removeLastItem() {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lastItem = this.visibleItems.pop()!;
    lastItem.remove();
    this.visibleItemMap.delete(lastItem.identifier);
  }

  private createItem(identifier: GIdentifier, itemData: GItemData) {
    return this.itemFactory(identifier, itemData);
  }

  private addNewFirstItem(fromSortIndex: number) {
    if (fromSortIndex >= this.sorted.length) {
      return;
    }

    if (fromSortIndex < this.sorted.length) {
      const newFirstItemData = this.sorted[fromSortIndex];
      const newFirstItem = this.createItem(newFirstItemData[0], newFirstItemData[1]);
      const previousFirstItem = this.visibleItems[0];
      if (previousFirstItem !== undefined) {
        newFirstItem.appendBefore(this.container, previousFirstItem.element);
      } else {
        newFirstItem.appendBefore(this.container, null);
      }
      this.visibleItemMap.set(newFirstItemData[0], newFirstItem);
      this.visibleItems.unshift(newFirstItem);
    }
  }

  private addNewLastItem(fromSortIndex: number) {
    if (fromSortIndex >= this.sorted.length) {
      return;
    }

    const newLastItemData = this.sorted[fromSortIndex];
    const newLastItem = this.createItem(newLastItemData[0], newLastItemData[1]);
    newLastItem.appendBefore(this.container, null);
    this.visibleItemMap.set(newLastItemData[0], newLastItem);
    this.visibleItems.push(newLastItem);
  }

  private insertIntoVisibleItems(
    identifier: GIdentifier,
    itemData: GItemData,
    indexInVisible: number,
  ) {
    if (this.visibleItems.length > this.visibleEndIndex - this.visibleStartIndex) {
      // the items will extend beyond the visible range so the last one should be removed
      this.removeLastItem();
    }

    const newItem = this.createItem(identifier, itemData);
    const indexIntoVisibleItems = indexInVisible;
    if (indexIntoVisibleItems >= this.visibleItems.length) {
      this.visibleItems.push(newItem);
      newItem.appendBefore(this.container, null);
    } else {
      newItem.appendBefore(this.container, this.visibleItems[indexIntoVisibleItems].element);
      this.visibleItems.splice(indexIntoVisibleItems, 0, newItem);
    }
    this.visibleItemMap.set(identifier, newItem);
  }

  // findInsertionIndex binary searches the already sorted data set to find the insertion index.
  private findInsertionIndex(computedValue: unknown): number {
    let minIndex = 0;
    let maxIndex = this.sorted.length - 1;
    let currentIndex = 0;
    let currentElement;

    while (minIndex <= maxIndex) {
      currentIndex = Math.floor((minIndex + maxIndex) / 2);
      currentElement = this.sorted[currentIndex];

      const comparison =
        (this.sortSetting.ascending ? 1 : -1) *
        this.sortSetting.compare(currentElement[2], computedValue);

      if (comparison < 0) {
        minIndex = currentIndex + 1;
      } else if (comparison > 0) {
        maxIndex = currentIndex - 1;
      } else {
        return currentIndex;
      }
    }

    return minIndex;
  }

  // indexOfIdentifierInSorted binary searches the dataset to find the index of a item.
  private indexOfIdentifierInSorted(
    identifier: GIdentifier,
    currentExtractedValue: unknown,
  ): number {
    const index = this.findInsertionIndex(currentExtractedValue);

    let i = 0;
    while (i < this.sorted.length) {
      const leftIndex = index - i;
      const rightIndex = index + i;
      if (leftIndex >= 0 && this.sorted[leftIndex][0] === identifier) {
        return leftIndex;
      }
      if (rightIndex < this.sorted.length && this.sorted[rightIndex][0] === identifier) {
        return rightIndex;
      }
      i++;
    }

    throw new Error(`identifier not found in sorted: ${identifier}`);
  }

  private calculateVisibleRegion() {
    switch (this.orientation) {
      case DataGridOrientation.VERTICAL:
        {
          const firstVisibleIndex = Math.floor(
            (this.scrollable.scrollTop - this.viewSettings.startPadding) /
              this.viewSettings.itemSize,
          );
          const startIndex = Math.max(0, firstVisibleIndex - this.viewSettings.overScanItems);
          const endIndex = Math.max(
            0,
            firstVisibleIndex +
              Math.ceil(this.viewSettings.height / this.viewSettings.itemSize) +
              this.viewSettings.overScanItems -
              1,
          );
          this.changeVisibleStartAndEnd(startIndex, endIndex);
        }
        break;
      case DataGridOrientation.HORIZONTAL:
        {
          const firstVisibleIndex = Math.floor(
            (this.scrollable.scrollLeft - this.viewSettings.startPadding) /
              this.viewSettings.itemSize,
          );
          const startIndex = Math.max(0, firstVisibleIndex - this.viewSettings.overScanItems);
          const endIndex = Math.max(
            0,
            firstVisibleIndex +
              Math.ceil(this.viewSettings.width / this.viewSettings.itemSize) +
              this.viewSettings.overScanItems -
              1,
          );
          this.changeVisibleStartAndEnd(startIndex, endIndex);
        }
        break;
    }
  }
}
