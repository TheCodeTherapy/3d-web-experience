import { ReconnectingWebSocket, WebsocketFactory, WebsocketStatus } from "./ReconnectingWebSocket";
import { UserNetworkingClientUpdate, UserNetworkingCodec } from "./UserNetworkingCodec";
import {
  CharacterDescription,
  FromUserNetworkingClientMessage,
  FromUserNetworkingServerMessage,
  USER_NETWORKING_DISCONNECTED_MESSAGE_TYPE,
  USER_NETWORKING_IDENTITY_MESSAGE_TYPE,
  USER_NETWORKING_PING_MESSAGE_TYPE,
  USER_NETWORKING_SERVER_BROADCAST_MESSAGE_TYPE,
  USER_NETWORKING_SERVER_ERROR_MESSAGE_TYPE,
  USER_NETWORKING_USER_AUTHENTICATE_MESSAGE_TYPE,
  USER_NETWORKING_USER_PROFILE_MESSAGE_TYPE,
  UserNetworkingServerErrorType,
} from "./UserNetworkingMessages";

export type UserNetworkingClientConfig = {
  url: string;
  sessionToken: string;
  websocketFactory: WebsocketFactory;
  statusUpdateCallback: (status: WebsocketStatus) => void;
  assignedIdentity: (clientId: number) => void;
  clientUpdate: (id: number, update: null | UserNetworkingClientUpdate) => void;
  clientProfileUpdated: (
    id: number,
    username: string,
    characterDescription: CharacterDescription,
  ) => void;
  onServerError: (error: { message: string; errorType: UserNetworkingServerErrorType }) => void;
  onServerBroadcast?: (broadcast: { broadcastType: string; payload: any }) => void;
};

export class UserNetworkingClient extends ReconnectingWebSocket {
  constructor(private config: UserNetworkingClientConfig) {
    super(config.url, config.websocketFactory, (status: WebsocketStatus) => {
      if (status === WebsocketStatus.Connected) {
        this.sendMessage({
          type: USER_NETWORKING_USER_AUTHENTICATE_MESSAGE_TYPE,
          sessionToken: config.sessionToken,
        });
      }
      config.statusUpdateCallback(status);
    });
  }

  public sendUpdate(update: UserNetworkingClientUpdate): void {
    const encodedUpdate = UserNetworkingCodec.encodeUpdate(update);
    this.send(encodedUpdate);
  }

  public sendMessage(message: FromUserNetworkingClientMessage): void {
    this.send(message);
  }

  protected handleIncomingWebsocketMessage(message: MessageEvent) {
    if (typeof message.data === "string") {
      const parsed = JSON.parse(message.data) as FromUserNetworkingServerMessage;
      switch (parsed.type) {
        case USER_NETWORKING_SERVER_ERROR_MESSAGE_TYPE:
          console.error(`Server error: ${parsed.message}. errorType: ${parsed.errorType}`);
          this.config.onServerError(parsed);
          break;
        case USER_NETWORKING_DISCONNECTED_MESSAGE_TYPE:
          console.log(`Client ID: ${parsed.id} left`);
          this.config.clientUpdate(parsed.id, null);
          break;
        case USER_NETWORKING_IDENTITY_MESSAGE_TYPE:
          console.log(`Client ID: ${parsed.id} assigned to self`);
          this.config.assignedIdentity(parsed.id);
          break;
        case USER_NETWORKING_USER_PROFILE_MESSAGE_TYPE:
          console.log(`Client ID: ${parsed.id} updated profile`);
          this.config.clientProfileUpdated(parsed.id, parsed.username, parsed.characterDescription);
          break;
        case USER_NETWORKING_PING_MESSAGE_TYPE: {
          this.sendMessage({ type: "pong" } as FromUserNetworkingClientMessage);
          break;
        }
        case USER_NETWORKING_SERVER_BROADCAST_MESSAGE_TYPE: {
          if (this.config.onServerBroadcast) {
            this.config.onServerBroadcast({
              broadcastType: parsed.broadcastType,
              payload: parsed.payload,
            });
          } else {
            console.warn("Unhandled broadcast", parsed);
          }
          break;
        }
        default:
          console.error("Unhandled message", parsed);
      }
    } else if (message.data instanceof ArrayBuffer) {
      const userNetworkingClientUpdate = UserNetworkingCodec.decodeUpdate(message.data);
      this.config.clientUpdate(userNetworkingClientUpdate.id, userNetworkingClientUpdate);
    } else {
      console.error("Unhandled message type", message.data);
    }
  }
}
