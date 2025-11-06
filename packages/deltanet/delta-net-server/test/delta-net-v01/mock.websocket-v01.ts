import {
  BufferReader,
  BufferWriter,
  decodeServerMessages,
  deltaNetProtocolSubProtocol_v0_1,
  DeltaNetV01ClientMessage,
  DeltaNetV01ServerMessage,
  encodeClientMessage,
} from "@mml-io/delta-net-protocol";

export class MockWebsocketV01 {
  public readonly protocol = deltaNetProtocolSubProtocol_v0_1;
  private allMessages: Array<DeltaNetV01ServerMessage> = [];
  private messageTriggers = new Set<() => void>();
  private serverMessageListeners = new Set<(message: MessageEvent) => void>();
  private serverCloseListeners = new Set<() => void>();
  private isClosed = false;

  send(data: Uint8Array) {
    const reader = new BufferReader(data);
    const messages = decodeServerMessages(reader);
    this.allMessages.push(...messages);
    this.messageTriggers.forEach((trigger) => {
      trigger();
    });
  }

  public close() {
    if (this.isClosed) {
      return;
    }
    this.isClosed = true;

    // Trigger close event listeners
    this.serverCloseListeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.warn("Error in close listener:", error);
      }
    });

    // Clear all listeners and triggers
    this.serverMessageListeners.clear();
    this.serverCloseListeners.clear();
    this.messageTriggers.clear();
  }

  async waitForTotalMessageCount(
    totalMessageCount: number,
    startFrom = 0,
  ): Promise<Array<DeltaNetV01ServerMessage>> {
    let resolveProm: (value: Array<DeltaNetV01ServerMessage>) => void;
    const promise = new Promise<Array<DeltaNetV01ServerMessage>>((resolve) => {
      resolveProm = resolve;
    });

    if (this.allMessages.length >= totalMessageCount) {
      return this.allMessages.slice(startFrom, totalMessageCount);
    }

    const trigger = () => {
      if (this.allMessages.length >= totalMessageCount) {
        this.messageTriggers.delete(trigger);
        resolveProm(this.allMessages.slice(startFrom, totalMessageCount));
      }
    };
    this.messageTriggers.add(trigger);
    return promise;
  }

  addEventListener(eventType: string, listener: () => void) {
    if (eventType === "message") {
      this.serverMessageListeners.add(listener);
    } else if (eventType === "close") {
      this.serverCloseListeners.add(listener);
    }
  }

  removeEventListener(eventType: string, listener: () => void) {
    if (eventType === "message") {
      this.serverMessageListeners.delete(listener);
    } else {
      this.serverCloseListeners.delete(listener);
    }
  }

  sendToServer(toSend: DeltaNetV01ClientMessage) {
    if (this.isClosed) {
      throw new Error("Cannot send message on closed WebSocket");
    }

    const writer = new BufferWriter(32);
    encodeClientMessage(toSend, writer);
    this.serverMessageListeners.forEach((listener) => {
      listener(
        new MessageEvent("message", {
          data: writer.getBuffer(),
        }),
      );
    });
  }

  getMessage(number: number) {
    return this.allMessages[number] as DeltaNetV01ServerMessage;
  }

  get closed(): boolean {
    return this.isClosed;
  }
}
