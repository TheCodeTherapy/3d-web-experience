import {
  CONNECTED_MESSAGE_TYPE,
  DISCONNECTED_MESSAGE_TYPE,
  FromClientMessage,
  FromServerMessage,
  IDENTITY_MESSAGE_TYPE,
  PING_MESSAGE_TYPE,
} from "./messages";
import { ReconnectingWebSocket, WebsocketFactory, WebsocketStatus } from "./ReconnectingWebSocket";
import { UserNetworkingClientUpdate, UserNetworkingCodec } from "./UserNetworkingCodec";

export class UserNetworkingClient extends ReconnectingWebSocket {
  constructor(
    url: string,
    websocketFactory: WebsocketFactory,
    statusUpdateCallback: (status: WebsocketStatus) => void,
    private setIdentityCallback: (id: number) => void,
    private clientUpdate: (id: number, update: null | UserNetworkingClientUpdate) => void,
  ) {
    super(url, websocketFactory, statusUpdateCallback);
  }

  public sendUpdate(update: UserNetworkingClientUpdate): void {
    const encodedUpdate = UserNetworkingCodec.encodeUpdate(update);
    this.send(encodedUpdate);
  }

  protected handleIncomingWebsocketMessage(message: MessageEvent) {
    if (typeof message.data === "string") {
      const parsed = JSON.parse(message.data) as FromServerMessage;
      switch (parsed.type) {
        case IDENTITY_MESSAGE_TYPE:
          console.log(`Assigned ID: ${parsed.id}`);
          this.setIdentityCallback(parsed.id);
          break;
        case CONNECTED_MESSAGE_TYPE:
          console.log(`Client ID: ${parsed.id} joined`);
          break;
        case DISCONNECTED_MESSAGE_TYPE:
          console.log(`Client ID: ${parsed.id} left`);
          this.clientUpdate(parsed.id, null);
          break;
        case PING_MESSAGE_TYPE: {
          this.send({ type: "pong" } as FromClientMessage);
          break;
        }
        default:
          console.warn("unknown message type received", parsed);
      }
    } else if (message.data instanceof ArrayBuffer) {
      const userNetworkingClientUpdate = UserNetworkingCodec.decodeUpdate(message.data);
      this.clientUpdate(userNetworkingClientUpdate.id, userNetworkingClientUpdate);
    } else {
      console.error("Unhandled message type", message.data);
    }
  }
}
