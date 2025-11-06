import { createRef, forwardRef } from "react";
import { flushSync } from "react-dom";
import { createRoot, Root } from "react-dom/client";

import { ChatUIComponent } from "./components/ChatPanel/TextChatUIComponent";

export type StringToHslOptions = {
  hueThresholds?: [number, number][];
  saturationThresholds?: [number, number][];
  lightnessThresholds?: [number, number][];
};

const DEFAULT_HUE_RANGES: [number, number][] = [[10, 350]];
const DEFAULT_SATURATION_RANGES: [number, number][] = [[60, 100]];
const DEFAULT_LIGHTNESS_RANGES: [number, number][] = [[65, 75]];

export const DEFAULT_HSL_OPTIONS: StringToHslOptions = {
  hueThresholds: DEFAULT_HUE_RANGES,
  saturationThresholds: DEFAULT_SATURATION_RANGES,
  lightnessThresholds: DEFAULT_LIGHTNESS_RANGES,
};

const ForwardedChatUIComponent = forwardRef(ChatUIComponent);

export type ChatUIInstance = {
  addMessage: (username: string, message: string) => void;
};

export type TextChatUIProps = {
  holderElement: HTMLElement;
  sendMessageToServerMethod: (message: string) => void;
  visibleByDefault?: boolean;
  stringToHslOptions?: StringToHslOptions;
};

export class TextChatUI {
  private root: Root;
  private appRef = createRef<ChatUIInstance>();

  public addTextMessage(username: string, message: string) {
    if (this.appRef.current) {
      this.appRef.current.addMessage(username, message);
    }
  }

  private wrapper = document.createElement("div");

  constructor(private config: TextChatUIProps) {
    this.config.holderElement.appendChild(this.wrapper);
    this.root = createRoot(this.wrapper);
  }

  dispose() {
    this.root.unmount();
    this.wrapper.remove();
  }

  init() {
    flushSync(() =>
      this.root.render(
        <ForwardedChatUIComponent
          ref={this.appRef}
          sendMessageToServer={this.config.sendMessageToServerMethod}
          visibleByDefault={this.config.visibleByDefault}
          stringToHslOptions={this.config.stringToHslOptions}
        />,
      ),
    );
  }
}
