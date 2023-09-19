import {
  CHAT_MESSAGE_TYPE,
  CONNECTED_MESSAGE_TYPE,
  DISCONNECTED_MESSAGE_TYPE,
  FromClientChatMessage,
  FromClientMessage,
  FromServerMessage,
  IDENTITY_MESSAGE_TYPE,
  PING_MESSAGE_TYPE,
} from "./ChatNetworkingMessages";
import { ReconnectingWebSocket, WebsocketFactory, WebsocketStatus } from "./ReconnectingWebsocket";

export class ChatNetworkingClient extends ReconnectingWebSocket {
  constructor(
    url: string,
    websocketFactory: WebsocketFactory,
    statusUpdateCallback: (status: WebsocketStatus) => void,
    private setIdentityCallback: (id: number) => void,
    private clientChatUpdate: (id: number, update: null | FromClientChatMessage) => void,
  ) {
    super(url, websocketFactory, statusUpdateCallback);
  }

  protected handleIncomingWebsocketMessage(message: MessageEvent) {
    if (typeof message.data === "string") {
      const parsed = JSON.parse(message.data) as FromServerMessage;
      switch (parsed.type) {
        case IDENTITY_MESSAGE_TYPE:
          this.setIdentityCallback(parsed.id);
          break;
        case CONNECTED_MESSAGE_TYPE:
          console.log(`Client ID: ${parsed.id} joined chat`);
          break;
        case DISCONNECTED_MESSAGE_TYPE:
          console.log(`Client ID: ${parsed.id} left chat`);
          break;
        case PING_MESSAGE_TYPE: {
          this.send({ type: "pong" } as FromClientMessage);
          break;
        }
        case CHAT_MESSAGE_TYPE: {
          this.clientChatUpdate(parsed.id, parsed);
          break;
        }
        default:
          console.warn("unknown message type received", parsed);
      }
    } else {
      console.error("Unhandled message type", message.data);
    }
  }

  public sendUpdate(chatMessage: FromClientChatMessage) {
    this.send(chatMessage as FromClientChatMessage);
  }
}
