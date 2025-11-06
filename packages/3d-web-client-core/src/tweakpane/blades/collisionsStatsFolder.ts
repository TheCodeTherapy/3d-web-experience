import { FolderApi } from "tweakpane";

export class CollisionsStatsFolder {
  private folder: FolderApi;
  private debugCheckbox: { enabled: boolean };

  constructor(parentFolder: FolderApi, expanded: boolean = true) {
    this.folder = parentFolder.addFolder({ title: "collisions", expanded: expanded });
    this.debugCheckbox = { enabled: false };
  }

  public setupChangeEvent(toggleDebug: (enabled: boolean) => void): void {
    this.folder
      .addBinding(this.debugCheckbox, "enabled", {
        label: "Debug Geometry",
      })
      .on("change", (ev) => {
        toggleDebug(ev.value);
      });
  }
}
