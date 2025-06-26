import * as React from "react";
import { createRef } from "react";
import { flushSync } from "react-dom";
import { createRoot, Root } from "react-dom/client";

import EditorPanelComponent from "./components/EditorPanel/EditorPanelComponent"; // Import the updated component

export type EditorProps = {
  holderElement: HTMLElement;
  visible: boolean;
  onUpdate: (content: string) => void;
};

export class EditorUI {
  private root: Root;
  private appRef: React.RefObject<any> = createRef<any>();

  private wrapper = document.createElement("div");

  public isVisible: boolean = false;

  constructor(private config: EditorProps) {
    this.isVisible = this.config.visible;
    this.config.holderElement.appendChild(this.wrapper);
    this.root = createRoot(this.wrapper);

    window.addEventListener("keydown", (event) => {
      if (event.key === "\\") {
        this.setVisible(false);
      }
    });
  }

  init() {
    flushSync(() =>
      this.root.render(
        <>
          <EditorPanelComponent
            ref={this.appRef}
            onUpdate={this.config.onUpdate}
            holderElement={this.config.holderElement}
            visible={this.isVisible}
          />
        </>,
      ),
    );
  }

  public setVisible(visible: boolean): void {
    this.appRef.current.setVisible(visible);
  }
}
