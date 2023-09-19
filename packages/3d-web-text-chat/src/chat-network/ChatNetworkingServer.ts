import WebSocket from "ws";

import {
  CONNECTED_MESSAGE_TYPE,
  DISCONNECTED_MESSAGE_TYPE,
  FromClientMessage,
  FromServerMessage,
  IDENTITY_MESSAGE_TYPE,
} from "./ChatNetworkingMessages";
import { heartBeatRate, pingPongRate } from "./ChatNetworkingSettings";

export type Client = {
  socket: WebSocket;
};

const WebSocketOpenStatus = 1;

export class ChatNetworkingServer {
  private clients: Map<number, Client> = new Map();
  private clientLastPong: Map<number, number> = new Map();

  constructor() {
    setInterval(this.pingClients.bind(this), pingPongRate);
    setInterval(this.heartBeat.bind(this), heartBeatRate);
  }

  heartBeat() {
    const now = Date.now();
    this.clientLastPong.forEach((clientLastPong, id) => {
      if (now - clientLastPong > heartBeatRate) {
        this.clients.delete(id);
        this.clientLastPong.delete(id);
        const disconnectMessage = JSON.stringify({
          id,
          type: DISCONNECTED_MESSAGE_TYPE,
        } as FromServerMessage);
        for (const { socket: otherSocket } of this.clients.values()) {
          if (otherSocket.readyState === WebSocketOpenStatus) {
            otherSocket.send(disconnectMessage);
          }
        }
      }
    });
  }

  pingClients() {
    this.clients.forEach((client) => {
      if (client.socket.readyState === WebSocketOpenStatus) {
        client.socket.send(JSON.stringify({ type: "ping" } as FromServerMessage));
      }
    });
  }

  connectClient(socket: WebSocket, id: number) {
    console.log(`Client joined chat with ID: ${id}`);

    const connectMessage = JSON.stringify({
      id,
      type: CONNECTED_MESSAGE_TYPE,
    } as FromServerMessage);
    for (const { socket: otherSocket } of this.clients.values()) {
      if (otherSocket.readyState === WebSocketOpenStatus) {
        otherSocket.send(connectMessage);
      }
    }

    const identityMessage = JSON.stringify({
      id,
      type: IDENTITY_MESSAGE_TYPE,
    } as FromServerMessage);
    socket.send(identityMessage);

    this.clients.set(id, {
      socket: socket as WebSocket,
    });

    socket.on("message", (message: WebSocket.Data) => {
      try {
        const data = JSON.parse(message as string) as FromClientMessage;
        if (data.type === "pong") {
          this.clientLastPong.set(id, Date.now());
        } else if (data.type === "chat") {
          for (const [otherClientId, otherClient] of this.clients) {
            if (otherClientId !== id && otherClient.socket.readyState === WebSocketOpenStatus) {
              otherClient.socket.send(JSON.stringify(data));
            }
          }
        }
      } catch (e) {
        console.error("Error parsing JSON message", message, e);
      }
    });

    socket.on("close", () => {
      console.log("Client disconnected from Chat", id);
      this.clients.delete(id);
      const disconnectMessage = JSON.stringify({
        id,
        type: DISCONNECTED_MESSAGE_TYPE,
      } as FromServerMessage);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const [, { socket: otherSocket }] of this.clients) {
        if (otherSocket.readyState === WebSocketOpenStatus) {
          otherSocket.send(disconnectMessage);
        }
      }
    });
  }
}
