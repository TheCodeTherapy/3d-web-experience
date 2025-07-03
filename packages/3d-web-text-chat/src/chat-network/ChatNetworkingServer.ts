import WebSocket from "ws";

import {
  CHAT_NETWORKING_CHAT_MESSAGE_TYPE,
  CHAT_NETWORKING_CONNECTED_MESSAGE_TYPE,
  ChatNetworkingConnectedMessage,
  CHAT_NETWORKING_DISCONNECTED_MESSAGE_TYPE,
  ChatNetworkingDisconnectedMessage,
  FromClientMessage,
  ChatNetworkingServerChatMessage,
  FromServerMessage,
  CHAT_NETWORKING_IDENTITY_MESSAGE_TYPE,
  ChatNetworkingIdentityMessage,
  CHAT_NETWORKING_PONG_MESSAGE_TYPE,
  ChatNetworkingServerError,
  CHAT_NETWORKING_USER_AUTHENTICATE_MESSAGE_TYPE,
} from "./ChatNetworkingMessages";
import { heartBeatRate, pingPongRate } from "./ChatNetworkingSettings";

export type ChatNetworkingServerClient = {
  socket: WebSocket;
  id: number | null;
  lastPong: number;
};

const WebSocketOpenStatus = 1;

export type ChatNetworkingServerOptions = {
  getChatUserIdentity: (sessionToken: string) => { id: number } | null;
};

export class ChatNetworkingServer {
  private allClients = new Set<ChatNetworkingServerClient>();
  private clientsById = new Map<number, ChatNetworkingServerClient>();

  private pingClientsIntervalTimer: NodeJS.Timeout;
  private heartbeatIntervalTimer: NodeJS.Timeout;

  constructor(private options: ChatNetworkingServerOptions) {
    this.pingClientsIntervalTimer = setInterval(this.pingClients.bind(this), pingPongRate);
    this.heartbeatIntervalTimer = setInterval(this.heartBeat.bind(this), heartBeatRate);
  }

  private heartBeat() {
    const now = Date.now();
    this.allClients.forEach((client) => {
      if (now - client.lastPong > heartBeatRate) {
        client.socket.close();
        this.handleDisconnectedClient(client);
      }
    });
  }

  private sendToAuthenticated(
    message: FromServerMessage,
    exceptClient?: ChatNetworkingServerClient,
  ) {
    const stringified = JSON.stringify(message);
    for (const client of this.allClients) {
      if (
        (exceptClient === undefined || exceptClient !== client) &&
        client.id !== null &&
        client.socket.readyState === WebSocketOpenStatus
      ) {
        client.socket.send(stringified);
      }
    }
  }

  private handleDisconnectedClient(client: ChatNetworkingServerClient) {
    if (!this.allClients.has(client)) {
      return;
    }
    this.allClients.delete(client);
    if (client.id) {
      this.clientsById.delete(client.id);
      const disconnectMessage: ChatNetworkingDisconnectedMessage = {
        id: client.id,
        type: CHAT_NETWORKING_DISCONNECTED_MESSAGE_TYPE,
      };
      this.sendToAuthenticated(disconnectMessage);
    }
  }

  private pingClients() {
    this.sendToAuthenticated({ type: "ping" });
  }

  public connectClient(socket: WebSocket) {
    console.log(`Client joined chat.`);

    const client: ChatNetworkingServerClient = {
      id: null,
      lastPong: Date.now(),
      socket: socket as WebSocket,
    };
    this.allClients.add(client);

    socket.on("message", (message: WebSocket.Data) => {
      let parsed;
      try {
        parsed = JSON.parse(message as string) as FromClientMessage;
      } catch (e) {
        console.error("Error parsing JSON message", message, e);
        return;
      }
      if (!client.id) {
        if (parsed.type === CHAT_NETWORKING_USER_AUTHENTICATE_MESSAGE_TYPE) {
          const { sessionToken } = parsed;
          const authResponse = this.options.getChatUserIdentity(sessionToken);
          if (authResponse === null) {
            // If the user is not authorized, disconnect the client
            socket.close();
            return;
          }
          if (this.clientsById.has(authResponse.id)) {
            /*
             This client is already connected. Reject the connection. If the old connection is abandoned then it will
             be removed and retry attempts will succeed.
            */
            console.error(`Client already connected with ID: ${authResponse.id}`);
            socket.close();
            return;
          }
          client.id = authResponse.id;
          this.clientsById.set(client.id, client);
          socket.send(
            JSON.stringify({
              type: CHAT_NETWORKING_IDENTITY_MESSAGE_TYPE,
              id: client.id,
            } as ChatNetworkingIdentityMessage),
          );
          const connectedMessage = {
            type: CHAT_NETWORKING_CONNECTED_MESSAGE_TYPE,
            id: client.id,
          } as ChatNetworkingConnectedMessage;
          this.sendToAuthenticated(connectedMessage, client);
        } else {
          console.error(`Unhandled message pre-auth: ${JSON.stringify(parsed)}`);
          socket.close();
        }
      } else {
        switch (parsed.type) {
          case CHAT_NETWORKING_PONG_MESSAGE_TYPE:
            client.lastPong = Date.now();
            break;

          case CHAT_NETWORKING_CHAT_MESSAGE_TYPE:
            const asChatMessage: ChatNetworkingServerChatMessage = {
              type: CHAT_NETWORKING_CHAT_MESSAGE_TYPE,
              id: client.id,
              text: parsed.text,
            };
            this.sendToAuthenticated(asChatMessage, client);
            break;

          default:
            console.error(`Unhandled message: ${JSON.stringify(parsed)}`);
        }
      }
    });

    socket.on("close", () => {
      console.log("Client disconnected from Chat", client.id);
      this.handleDisconnectedClient(client);
    });
  }

  public disconnectClientId(clientId: number) {
    const client = this.clientsById.get(clientId);
    if (client) {
      client.socket.close();
      this.handleDisconnectedClient(client);
    }
  }

  public dispose(clientCloseError?: ChatNetworkingServerError) {
    clearInterval(this.pingClientsIntervalTimer);
    clearInterval(this.heartbeatIntervalTimer);

    const stringifiedError = clientCloseError ? JSON.stringify(clientCloseError) : undefined;

    for (const [, client] of this.clientsById) {
      if (stringifiedError) {
        client.socket.send(stringifiedError);
      }
      client.socket.close();
    }
  }
}
