import { deltaNetProtocolSubProtocol_v0_1 } from "@mml-io/delta-net-protocol";

import { DeltaNetClientWebsocketV01Adapter } from "./DeltaNetClientWebsocketV01Adapter";

const startingBackoffTimeMilliseconds = 100;
const maximumBackoffTimeMilliseconds = 10000;
const maximumWebsocketConnectionTimeout = 5000;

export type DeltaNetClientWebsocketFactory = (url: string) => WebSocket;

export enum DeltaNetClientWebsocketStatus {
  Connecting,
  ConnectionOpen, // The websocket is open and connected, but no messages have been received yet
  Connected, // The websocket is open and connected, and messages are being received
  Reconnecting,
  Disconnected,
}

export function DeltaNetClientWebsocketStatusToString(
  status: DeltaNetClientWebsocketStatus,
): string {
  switch (status) {
    case DeltaNetClientWebsocketStatus.Connecting:
      return "Connecting...";
    case DeltaNetClientWebsocketStatus.ConnectionOpen:
      return "Connection Open";
    case DeltaNetClientWebsocketStatus.Connected:
      return "Connected";
    case DeltaNetClientWebsocketStatus.Reconnecting:
      return "Reconnecting...";
    case DeltaNetClientWebsocketStatus.Disconnected:
      return "Disconnected";
    default:
      return "Unknown";
  }
}

export type DeltaNetClientWebsocketInitialCheckout = {
  indicesCount: number;
  initialComponents: Map<number, { values: BigInt64Array; deltas: BigInt64Array }>;
  initialStates: Map<number, Array<Uint8Array>>;
};

export type DeltaNetClientWebsocketTick = {
  unoccupying: Array<number>;
  indicesCount: number;
  componentDeltaDeltas: Map<number, BigInt64Array>;
  stateChanges: Map<number, Map<number, Uint8Array>>;
};

export type DeltaNetClientWebsocketUserIndex = {
  userIndex: number;
};

export type DeltaNetClientWebsocketOptions = {
  ignoreData?: boolean;
  observer?: boolean;
  onUserIndex: (userIndex: DeltaNetClientWebsocketUserIndex) => void;
  onInitialCheckout: (initialCheckout: DeltaNetClientWebsocketInitialCheckout) => void;
  onTick: (tick: DeltaNetClientWebsocketTick) => void;
  onError: (errorType: string, errorMessage: string, retryable: boolean) => void;
  onWarning: (warning: string) => void;
  onServerCustom?: (customType: number, contents: string) => void;
};

export type DeltaNetClientWebsocketAdapter = {
  receiveMessage: (message: MessageEvent) => void;
  setUserComponents: (
    components: Map<number, bigint>,
    changedStates: Map<number, Uint8Array>,
  ) => void;
  sendCustomMessage: (customType: number, contents: string) => void;
  didConnect: () => boolean;
  dispose: () => void;
};

function updateLastSecondArray(
  records: Array<[number, number]>,
  size: number,
  time: number,
): number {
  let sizeChange = size;
  const oneSecondAgo = time - 1000;
  records.push([time, size]);
  let i;
  for (i = 0; i < records.length; i++) {
    if (records[i][0] < oneSecondAgo) {
      sizeChange -= records[i][1];
    } else {
      break;
    }
  }
  records.splice(0, i);
  return sizeChange;
}

/**
 * DeltaNetClientWebsocket is a client for a DeltaNetServer. It connects to a server on the provided url and receives
 * updates to the DOM. It also sends events to the server for interactions with the DOM.
 *
 * The DeltaNetClientWebsocket is attached to a parentElement and synchronizes the received DOM under that element.
 */
export class DeltaNetClientWebsocket {
  private websocket: WebSocket | null = null;
  private websocketAdapter: DeltaNetClientWebsocketAdapter | null = null;

  private stopped = false;
  private backoffTime = startingBackoffTimeMilliseconds;
  private status: DeltaNetClientWebsocketStatus = DeltaNetClientWebsocketStatus.Connecting;

  public bandwidthPerSecond = 0;
  public lastSecondMessageSizes: Array<[number, number]> = []; // Timestamp in ms, size in bytes
  public componentBytesPerSecond = 0;
  public lastSecondComponentBufferSizes: Array<[number, number]> = []; // Timestamp in ms, size in bytes
  public stateBytesPerSecond = 0;
  public lastSecondStateBufferSizes: Array<[number, number]> = []; // Timestamp in ms, size in bytes

  public static createWebSocket(url: string): WebSocket {
    return new WebSocket(url, [deltaNetProtocolSubProtocol_v0_1]);
  }

  constructor(
    private url: string,
    private websocketFactory: DeltaNetClientWebsocketFactory,
    private token: string,
    private options: DeltaNetClientWebsocketOptions,
    private timeCallback?: (time: number) => void,
    private statusUpdateCallback?: (status: DeltaNetClientWebsocketStatus) => void,
  ) {
    this.setStatus(DeltaNetClientWebsocketStatus.Connecting);
    this.startWebSocketConnectionAttempt();
  }

  private setStatus(status: DeltaNetClientWebsocketStatus) {
    if (this.status !== status) {
      this.status = status;
      if (this.statusUpdateCallback) {
        this.statusUpdateCallback(status);
      }
    }
  }

  public getStatus(): DeltaNetClientWebsocketStatus {
    return this.status;
  }

  private async createWebsocketWithTimeout(timeout: number): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const websocket = this.websocketFactory(this.url);
      const timeoutId = setTimeout(() => {
        reject(new Error("websocket connection timed out"));
        websocket.close();
      }, timeout);
      websocket.binaryType = "arraybuffer";
      websocket.addEventListener("open", () => {
        clearTimeout(timeoutId);

        this.websocket = websocket;
        const websocketAdapter: DeltaNetClientWebsocketAdapter =
          new DeltaNetClientWebsocketV01Adapter(
            websocket,
            () => {
              this.backoffTime = startingBackoffTimeMilliseconds;
              this.setStatus(DeltaNetClientWebsocketStatus.Connected);
            },
            this.options,
            this.token,
            {
              receivedBytes: (bytes: number, now: number) => {
                this.bandwidthPerSecond += updateLastSecondArray(
                  this.lastSecondMessageSizes,
                  bytes,
                  now,
                );
              },
              receivedComponentBytes: (bytes: number, now: number) => {
                this.componentBytesPerSecond += updateLastSecondArray(
                  this.lastSecondComponentBufferSizes,
                  bytes,
                  now,
                );
              },
              receivedStateBytes: (bytes: number, now: number) => {
                this.stateBytesPerSecond += updateLastSecondArray(
                  this.lastSecondStateBufferSizes,
                  bytes,
                  now,
                );
              },
              onError: (errorType: string, errorMessage: string, retryable: boolean) => {
                this.options.onError(errorType, errorMessage, retryable);
                if (this.websocket === websocket) {
                  this.websocket?.close();
                  this.websocket = null;
                  this.websocketAdapter?.dispose();
                  this.websocketAdapter = null;
                  onWebsocketClose(retryable);
                }
              },
              onWarning: (warning: string) => {
                this.options.onWarning(warning);
              },
            },
            this.timeCallback,
          );

        this.websocketAdapter = websocketAdapter;

        websocket.addEventListener("message", (event) => {
          if (websocket !== this.websocket) {
            console.log("Ignoring websocket message event because it is no longer current");
            websocket.close();
            return;
          }
          if (this.stopped) {
            console.warn("Ignoring websocket message event because the client is stopped");
            return;
          }

          websocketAdapter.receiveMessage(event);
        });

        const onWebsocketClose = async (retryable: boolean = true) => {
          let didConnect = false;
          if (this.websocketAdapter) {
            didConnect = this.websocketAdapter.didConnect();
          }
          if (this.stopped) {
            // This closing is expected. The client closed the websocket.
            this.setStatus(DeltaNetClientWebsocketStatus.Disconnected);
            return;
          }
          if (retryable) {
            if (!didConnect) {
              // The websocket did not deliver any contents.
              // It may have been successfully opened, but immediately closed.
              // This client should back off to prevent this happening in a rapid loop.
              await this.waitBackoffTime();
            }
            // The websocket closed unexpectedly. Try to reconnect.
            this.setStatus(DeltaNetClientWebsocketStatus.Reconnecting);
            this.startWebSocketConnectionAttempt();
          } else {
            this.setStatus(DeltaNetClientWebsocketStatus.Disconnected);
          }
        };

        websocket.addEventListener("close", () => {
          if (websocket !== this.websocket) {
            console.warn("Ignoring websocket close event because it is no longer current");
            return;
          }
          this.websocket = null;
          this.websocketAdapter?.dispose();
          this.websocketAdapter = null;
          onWebsocketClose();
        });
        websocket.addEventListener("error", (e) => {
          if (websocket !== this.websocket) {
            console.log("Ignoring websocket error event because it is no longer current");
            return;
          }
          console.error("DeltaNetClientWebsocket error", e);
          this.websocket = null;
          this.websocketAdapter?.dispose();
          this.websocketAdapter = null;
          onWebsocketClose();
        });

        this.setStatus(DeltaNetClientWebsocketStatus.ConnectionOpen);
        resolve(websocket);
      });
      websocket.addEventListener("error", (e) => {
        clearTimeout(timeoutId);
        reject(e);
      });
    });
  }

  private async waitBackoffTime(): Promise<void> {
    console.warn(`Websocket connection to '${this.url}' failed: retrying in ${this.backoffTime}ms`);
    await new Promise((resolve) => setTimeout(resolve, this.backoffTime));
    this.backoffTime = Math.min(
      // Introduce a small amount of randomness to prevent clients from retrying in lockstep
      this.backoffTime * (1.5 + Math.random() * 0.5),
      maximumBackoffTimeMilliseconds,
    );
  }

  private async startWebSocketConnectionAttempt() {
    if (this.stopped) {
      return;
    }
    while (true) {
      if (this.stopped) {
        return;
      }
      try {
        await this.createWebsocketWithTimeout(maximumWebsocketConnectionTimeout);
        break;
      } catch (e) {
        console.error("Websocket connection failed", e);
        // Connection failed, retry with backoff
        this.setStatus(DeltaNetClientWebsocketStatus.Reconnecting);
        await this.waitBackoffTime();
      }
    }
  }

  public stop() {
    this.stopped = true;
    if (this.websocket !== null) {
      this.websocket.close();
      this.websocket = null;
    }
    this.websocketAdapter?.dispose();
    this.websocketAdapter = null;
  }

  public setUserComponents(
    components: Map<number, bigint>,
    changedStates: Map<number, Uint8Array>,
  ) {
    if (this.websocketAdapter) {
      this.websocketAdapter.setUserComponents(components, changedStates);
    }
  }

  public sendCustomMessage(customType: number, contents: string) {
    if (this.websocketAdapter) {
      this.websocketAdapter.sendCustomMessage(customType, contents);
    }
  }
}
