import WebSocket from "ws";

import {
  CHAT_MESSAGE_TYPE,
  CONNECTED_MESSAGE_TYPE,
  ConnectedMessage,
  DISCONNECTED_MESSAGE_TYPE,
  DisconnectedMessage,
  FromClientAuthenticateMessage,
  FromClientMessage,
  FromServerChatMessage,
  FromServerMessage,
  IDENTITY_MESSAGE_TYPE,
  IdentityMessage,
  PONG_MESSAGE_TYPE,
  USER_AUTHENTICATE_MESSAGE_TYPE,
} from "./ChatNetworkingMessages";
import { heartBeatRate, pingPongRate } from "./ChatNetworkingSettings";

export type Client = {
  socket: WebSocket;
  id: number | null;
  lastPong: number;
};

const WebSocketOpenStatus = 1;

export type ChatNetworkingServerOptions = {
  getChatUserIdentity: (sessionToken: string) => { id: number } | null;
};

export class ChatNetworkingServer {
  private allClients = new Set<Client>();
  private clientsById = new Map<number, Client>();

  constructor(private options: ChatNetworkingServerOptions) {
    setInterval(this.pingClients.bind(this), pingPongRate);
    setInterval(this.heartBeat.bind(this), heartBeatRate);
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

  private sendToAuthenticated(message: FromServerMessage, exceptClient?: Client) {
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

  private handleDisconnectedClient(client: Client) {
    if (!this.allClients.has(client)) {
      return;
    }
    this.allClients.delete(client);
    if (client.id) {
      this.clientsById.delete(client.id);
      const disconnectMessage: DisconnectedMessage = {
        id: client.id,
        type: DISCONNECTED_MESSAGE_TYPE,
      };
      this.sendToAuthenticated(disconnectMessage);
    }
  }

  private pingClients() {
    this.sendToAuthenticated({ type: "ping" });
  }

  public connectClient(socket: WebSocket) {
    console.log(`Client joined chat.`);

    const client: Client = {
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
        if (parsed.type === USER_AUTHENTICATE_MESSAGE_TYPE) {
          const { sessionToken } = parsed;
          const authResponse = this.options.getChatUserIdentity(sessionToken);
          if (authResponse === null) {
            // If the user is not authorized, disconnect the client
            socket.close();
            return;
          }
          if (this.clientsById.has(authResponse.id)) {
            throw new Error(`Client already connected with ID: ${authResponse.id}`);
          }
          client.id = authResponse.id;
          this.clientsById.set(client.id, client);
          socket.send(
            JSON.stringify({ type: IDENTITY_MESSAGE_TYPE, id: client.id } as IdentityMessage),
          );
          const connectedMessage = {
            type: CONNECTED_MESSAGE_TYPE,
            id: client.id,
          } as ConnectedMessage;
          this.sendToAuthenticated(connectedMessage, client);
        } else {
          console.error(`Unhandled message pre-auth: ${JSON.stringify(parsed)}`);
          socket.close();
        }
      } else {
        switch (parsed.type) {
          case PONG_MESSAGE_TYPE:
            client.lastPong = Date.now();
            break;

          case CHAT_MESSAGE_TYPE:
            const asChatMessage: FromServerChatMessage = {
              type: CHAT_MESSAGE_TYPE,
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
}
