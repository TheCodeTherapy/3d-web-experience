import {
  BufferReader,
  BufferWriter,
  decodeServerMessages,
  DeltaNetV01ClientMessage,
  DeltaNetV01ClientCustomMessage,
  DeltaNetV01InitialCheckoutMessage,
  DeltaNetV01PingMessage,
  DeltaNetV01ServerMessage,
  DeltaNetV01ServerCustomMessage,
  DeltaNetV01SetUserComponentsMessage,
  DeltaNetV01Tick,
  DeltaNetV01UserIndexMessage,
  encodeClientMessage,
  lastInitialCheckoutDebugData,
  lastTickDebugData,
} from "@mml-io/delta-net-protocol";
import { DeltaNetV01ConnectUserMessage } from "@mml-io/delta-net-protocol/src";

import {
  DeltaNetClientWebsocketAdapter,
  DeltaNetClientWebsocketOptions,
} from "./DeltaNetClientWebsocket";

function areUint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export class DeltaNetClientWebsocketV01Adapter implements DeltaNetClientWebsocketAdapter {
  private gotInitialCheckout = false;
  private sentUserConnect = false;
  private receivedUserIndex = false;
  private queuedStateUpdates = new Map<number, Uint8Array>();
  private components = new Map<number, bigint>();
  private states = new Map<number, Uint8Array>();
  private disposed = false;
  private isObserver: boolean;

  constructor(
    private websocket: WebSocket,
    private connectedCallback: () => void,
    private options: DeltaNetClientWebsocketOptions,
    private token: string,
    private internalOptions: {
      receivedBytes: (bytes: number, now: number) => void;
      receivedComponentBytes: (bytes: number, now: number) => void;
      receivedStateBytes: (bytes: number, now: number) => void;
      onError: (errorType: string, errorMessage: string, retryable: boolean) => void;
      onWarning: (warning: string) => void;
    },
    private timeCallback?: (time: number) => void,
  ) {
    this.websocket.binaryType = "arraybuffer";
    this.isObserver = options.observer ?? false;

    // Observers need to send connectUser message immediately since they won't call setUserComponents
    if (this.isObserver) {
      this.sendConnectUser([], []);
    }
  }

  private sendConnectUser(
    components: Array<[number, bigint]>,
    states: Array<[number, Uint8Array]>,
  ) {
    if (this.sentUserConnect) {
      return;
    }

    this.sentUserConnect = true;
    this.send({
      type: "connectUser",
      token: this.token,
      observer: this.isObserver,
      components: this.isObserver ? [] : components,
      states: this.isObserver ? [] : states,
    } satisfies DeltaNetV01ConnectUserMessage);
  }

  public setUserComponents(
    components: Map<number, bigint>,
    changedStates: Map<number, Uint8Array>,
  ) {
    if (this.disposed) {
      throw new Error("DeltaNetClientWebsocketV01Adapter is disposed");
    }

    const messageComponents: Array<[number, bigint]> = [];
    for (const [componentId, value] of components) {
      messageComponents.push([componentId, value]);
      this.components.set(componentId, value);
    }

    const messageStates: Array<[number, Uint8Array]> = [];
    for (const [stateId, value] of changedStates) {
      const currentState = this.states.get(stateId);
      if (currentState && areUint8ArraysEqual(currentState, value)) {
        continue;
      }
      this.states.set(stateId, value);
      messageStates.push([stateId, value]);
    }

    if (!this.sentUserConnect) {
      this.sendConnectUser(messageComponents, messageStates);
      return;
    }

    // Observers should not send component updates after initial connection
    if (this.isObserver) {
      return;
    }

    if (this.receivedUserIndex) {
      if (messageComponents.length > 0 || messageStates.length > 0) {
        const setUserComponents: DeltaNetV01SetUserComponentsMessage = {
          type: "setUserComponents",
          components: messageComponents,
          states: messageStates,
        };
        this.send(setUserComponents);
      }
    } else {
      for (const [stateId, value] of messageStates) {
        this.queuedStateUpdates.set(stateId, value);
      }
    }
  }

  private send(message: DeltaNetV01ClientMessage) {
    const writer = new BufferWriter(256);
    encodeClientMessage(message, writer);
    this.websocket.send(writer.getBuffer());
  }

  public sendCustomMessage(customType: number, contents: string) {
    if (this.disposed) {
      return;
    }

    const customMessage: DeltaNetV01ClientCustomMessage = {
      type: "clientCustom",
      customType,
      contents,
    };

    this.send(customMessage);
  }

  public receiveMessage(event: MessageEvent) {
    if (this.disposed) {
      return;
    }

    const buffer = new Uint8Array(event.data);
    const now = Date.now();
    this.internalOptions.receivedBytes(buffer.byteLength, now);
    const reader = new BufferReader(buffer);
    const messages = decodeServerMessages(reader, {
      ignoreData: this.options.ignoreData,
    });
    for (const message of messages) {
      this.applyMessage(message, now);
    }
  }

  private applyMessage(message: DeltaNetV01ServerMessage, now: number) {
    switch (message.type) {
      case "error":
        console.error("Error from server", message);
        this.internalOptions.onError(message.errorType, message.message, message.retryable);
        break;
      case "warning":
        console.warn("Warning from server", message);
        this.internalOptions.onWarning(message.message);
        break;
      case "initialCheckout":
        this.handleInitialCheckout(message, now);
        this.connectedCallback();
        break;
      case "tick":
        this.handleTick(message, now);
        break;
      case "userIndex":
        this.handleUserIndex(message);
        break;
      case "ping":
        this.handlePing(message);
        break;
      case "serverCustom":
        this.handleServerCustom(message);
        break;
      default:
        console.warn("unknown message type", message);
        break;
    }
  }

  private handleUserIndex(message: DeltaNetV01UserIndexMessage) {
    this.receivedUserIndex = true;

    this.options.onUserIndex({
      userIndex: message.index,
    });

    this.sendQueuedUpdates();
  }

  private sendQueuedUpdates() {
    if (this.queuedStateUpdates.size > 0) {
      const queuedStatesArray: Array<[number, Uint8Array]> = [];
      for (const [stateId, value] of this.queuedStateUpdates) {
        queuedStatesArray.push([stateId, value]);
      }
      const setUserComponents: DeltaNetV01SetUserComponentsMessage = {
        type: "setUserComponents",
        components: Array.from(this.components.entries()),
        states: queuedStatesArray,
      };
      this.send(setUserComponents);
      this.queuedStateUpdates.clear();
    }
  }

  private handlePing(message: DeltaNetV01PingMessage) {
    this.send({
      type: "pong",
      pong: message.ping,
    });
  }

  private handleServerCustom(message: DeltaNetV01ServerCustomMessage) {
    this.options.onServerCustom?.(message.customType, message.contents);
  }

  public didConnect(): boolean {
    return this.gotInitialCheckout;
  }

  private handleInitialCheckout(message: DeltaNetV01InitialCheckoutMessage, now: number) {
    this.gotInitialCheckout = true;

    if (this.options.ignoreData) {
      return;
    }

    const components = new Map<number, { values: BigInt64Array; deltas: BigInt64Array }>();
    for (const { componentId, deltas, values } of message.components) {
      components.set(componentId, { values, deltas });
    }

    const allStates = new Map<number, Array<Uint8Array>>();
    for (const { stateId, values } of message.states) {
      allStates.set(stateId, values);
    }

    this.internalOptions.receivedComponentBytes(
      lastInitialCheckoutDebugData.componentsByteLength,
      now,
    );
    this.internalOptions.receivedStateBytes(lastInitialCheckoutDebugData.statesByteLength, now);

    this.options.onInitialCheckout({
      indicesCount: message.indicesCount,
      initialComponents: components,
      initialStates: allStates,
    });
  }

  private handleTick(message: DeltaNetV01Tick, now: number) {
    if (this.options.ignoreData) {
      return;
    }
    this.timeCallback?.(message.serverTime);
    const components = new Map<number, BigInt64Array>();
    for (const { componentId, deltaDeltas } of message.componentDeltaDeltas) {
      components.set(componentId, deltaDeltas);
    }

    const stateChanges = new Map<number, Map<number, Uint8Array>>();
    for (const stateChange of message.states) {
      const updatedStates = new Map<number, Uint8Array>();
      for (const [index, value] of stateChange.updatedStates) {
        updatedStates.set(index, value);
      }
      stateChanges.set(stateChange.stateId, updatedStates);
    }

    this.internalOptions.receivedComponentBytes(lastTickDebugData.componentsByteLength, now);
    this.internalOptions.receivedStateBytes(lastTickDebugData.statesByteLength, now);

    this.options.onTick({
      unoccupying: message.removedIndices,
      indicesCount: message.indicesCount,
      componentDeltaDeltas: components,
      stateChanges,
    });
  }

  dispose() {
    this.disposed = true;
  }
}
