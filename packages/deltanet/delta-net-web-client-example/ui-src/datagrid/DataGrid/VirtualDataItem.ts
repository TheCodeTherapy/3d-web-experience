export abstract class VirtualDataItem<GIdentifier, GItemData, GItemUpdate, GRenderUpdate> {
  public element: HTMLDivElement;

  constructor(
    public identifier: GIdentifier,
    public itemData: GItemData,
  ) {
    this.element = document.createElement("div");
  }

  abstract updateData(u: GItemUpdate): void;

  abstract updateRendering(r?: GRenderUpdate): void;

  appendBefore(parent: HTMLElement, before: HTMLElement | null): void {
    if (before === null) {
      parent.appendChild(this.element);
    } else {
      parent.insertBefore(this.element, before);
    }
  }

  remove(): void {
    this.onRemove();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.element.parentNode!.removeChild(this.element);
  }

  abstract onRemove(): void;
}
