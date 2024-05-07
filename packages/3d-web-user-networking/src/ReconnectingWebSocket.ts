import { UserNetworkingClientUpdate, UserNetworkingCodec } from "./UserNetworkingCodec";

export type WebsocketFactory = (url: string) => WebSocket;

export enum WebsocketStatus {
  Connecting,
  Connected,
  Reconnecting,
  Disconnected,
}

const startingBackoffTimeMilliseconds = 100;
const maximumBackoffTimeMilliseconds = 10000;
const maximumWebsocketConnectionTimeout = 5000;

export abstract class ReconnectingWebSocket {
  private websocket: WebSocket | null = null;
  private status: WebsocketStatus | null = null;
  private receivedMessageSinceOpen = false;
  private backoffTime = startingBackoffTimeMilliseconds;
  private stopped = false;

  constructor(
    private url: string,
    private websocketFactory: WebsocketFactory,
    private statusUpdateCallback: (status: WebsocketStatus) => void,
  ) {
    this.setStatus(WebsocketStatus.Connecting);
    this.startWebSocketConnectionAttempt();
  }

  private setStatus(status: WebsocketStatus) {
    if (this.status !== status) {
      this.status = status;
      this.statusUpdateCallback(status);
    }
  }

  public sendUpdate(update: UserNetworkingClientUpdate): void {
    if (!this.websocket) {
      console.error("Not connected to the server");
      return;
    }
    const encodedUpdate = UserNetworkingCodec.encodeUpdate(update);
    this.send(encodedUpdate);
  }

  private async startWebSocketConnectionAttempt() {
    if (this.stopped) {
      return;
    }
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this.stopped) {
        return;
      }
      try {
        await this.createWebsocketWithTimeout(maximumWebsocketConnectionTimeout);
        break;
      } catch (e) {
        // Connection failed, retry with backoff
        this.setStatus(WebsocketStatus.Reconnecting);
        await this.waitBackoffTime();
      }
    }
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

  protected abstract handleIncomingWebsocketMessage(message: MessageEvent): void;

  protected send(message: object | Uint8Array): void {
    if (!this.websocket) {
      console.error("Not connected to the server");
      return;
    }
    if (message instanceof Uint8Array) {
      this.websocket.send(message);
    } else {
      this.websocket.send(JSON.stringify(message));
    }
  }

  private createWebsocketWithTimeout(timeout: number): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("websocket connection timed out"));
      }, timeout);
      const websocket = this.websocketFactory(this.url);
      websocket.binaryType = "arraybuffer";
      websocket.addEventListener("open", () => {
        clearTimeout(timeoutId);
        this.receivedMessageSinceOpen = false;
        this.websocket = websocket;
        this.setStatus(WebsocketStatus.Connected);

        websocket.addEventListener("message", (event) => {
          if (websocket !== this.websocket) {
            console.log("Ignoring websocket message event because it is no longer current");
            websocket.close();
            return;
          }
          if (!this.receivedMessageSinceOpen) {
            this.receivedMessageSinceOpen = true;
          }
          this.handleIncomingWebsocketMessage(event);
        });

        const onWebsocketClose = async () => {
          if (websocket !== this.websocket) {
            console.log("Ignoring websocket close event because it is no longer current");
            return;
          }
          this.websocket = null;
          if (this.stopped) {
            // This closing is expected. The client closed the websocket.
            this.setStatus(WebsocketStatus.Disconnected);
            return;
          }
          if (!this.receivedMessageSinceOpen) {
            // The websocket did not deliver any contents. It may have been successfully opened, but immediately closed. This client should back off to prevent this happening in a rapid loop.
            await this.waitBackoffTime();
          }
          // The websocket closed unexpectedly. Try to reconnect.
          this.setStatus(WebsocketStatus.Reconnecting);
          this.startWebSocketConnectionAttempt();
        };

        websocket.addEventListener("close", (e) => {
          if (websocket !== this.websocket) {
            console.warn("Ignoring websocket close event because it is no longer current");
            return;
          }
          console.log("NetworkedDOMWebsocket close", e);
          onWebsocketClose();
        });
        websocket.addEventListener("error", (e) => {
          if (websocket !== this.websocket) {
            console.log("Ignoring websocket error event because it is no longer current");
            return;
          }
          console.error("NetworkedDOMWebsocket error", e);
          onWebsocketClose();
        });

        resolve(websocket);
      });
      websocket.addEventListener("error", (e) => {
        clearTimeout(timeoutId);
        reject(e);
      });
    });
  }

  public stop() {
    this.stopped = true;
    if (this.websocket !== null) {
      this.websocket.close();
      this.websocket = null;
    }
  }
}
