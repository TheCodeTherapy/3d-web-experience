import { createRef, forwardRef } from "react";
import { flushSync } from "react-dom";
import { createRoot, Root } from "react-dom/client";

import { ChatUIComponent } from "./components/ChatPanel/TextChatUIComponent";

const ForwardedChatUIComponent = forwardRef(ChatUIComponent);

export type ChatUIInstance = {
  addMessage: (username: string, message: string) => void;
};

export class TextChatUI {
  private root: Root;
  private appRef: React.RefObject<ChatUIInstance> = createRef<ChatUIInstance>();

  public addTextMessage(username: string, message: string) {
    if (this.appRef.current) {
      this.appRef.current.addMessage(username, message);
    }
  }

  private wrapper = document.createElement("div");

  constructor(
    private holderElement: HTMLElement,
    private clientname: string,
    private sendMessageToServerMethod: (message: string) => void,
  ) {
    this.holderElement.appendChild(this.wrapper);
    this.root = createRoot(this.wrapper);
    this.sendMessageToServerMethod = sendMessageToServerMethod;
  }

  init() {
    flushSync(() =>
      this.root.render(
        <ForwardedChatUIComponent
          ref={this.appRef}
          clientName={this.clientname}
          sendMessageToServer={this.sendMessageToServerMethod}
        />,
      ),
    );
  }
}
