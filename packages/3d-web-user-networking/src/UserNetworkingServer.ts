import WebSocket from "ws";

import {
  CONNECTED_MESSAGE_TYPE,
  DISCONNECTED_MESSAGE_TYPE,
  FromClientMessage,
  FromServerMessage,
  IDENTITY_MESSAGE_TYPE,
} from "./messages";
import { heartBeatRate, packetsUpdateRate, pingPongRate } from "./user-networking-settings";
import { UserNetworkingClientUpdate, UserNetworkingCodec } from "./UserNetworkingCodec";

export type Client = {
  socket: WebSocket;
  update: UserNetworkingClientUpdate;
};

const WebSocketOpenStatus = 1;

export class UserNetworkingServer {
  private clients: Map<number, Client> = new Map();
  private clientLastPong: Map<number, number> = new Map();

  constructor() {
    setInterval(this.sendUpdates.bind(this), packetsUpdateRate);
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

  getId(): number {
    let id = 1;
    while (this.clients.has(id)) id++;
    return id;
  }

  connectClient(socket: WebSocket) {
    const id = this.getId();
    console.log(`Client ID: ${id} joined`);

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

    for (const { update } of this.clients.values()) {
      socket.send(UserNetworkingCodec.encodeUpdate(update));
    }

    this.clients.set(id, {
      socket: socket as WebSocket,
      update: {
        id,
        position: { x: 0, y: 0, z: 0 },
        rotation: { quaternionY: 0, quaternionW: 1 },
        state: 0,
      },
    });

    socket.on("message", (message: WebSocket.Data, _isBinary: boolean) => {
      if (message instanceof Buffer) {
        const arrayBuffer = new Uint8Array(message).buffer;
        const update = UserNetworkingCodec.decodeUpdate(arrayBuffer);
        update.id = id;
        if (this.clients.get(id) !== undefined) {
          this.clients.get(id)!.update = update;
        }
      } else {
        try {
          const data = JSON.parse(message as string) as FromClientMessage;
          if (data.type === "pong") {
            this.clientLastPong.set(id, Date.now());
          }
        } catch (e) {
          console.error("Error parsing JSON message", message, e);
        }
      }
    });

    socket.on("close", () => {
      console.log("Client disconnected", id);
      this.clients.delete(id);
      const disconnectMessage = JSON.stringify({
        id,
        type: DISCONNECTED_MESSAGE_TYPE,
      } as FromServerMessage);
      for (const [clientId, { socket: otherSocket }] of this.clients) {
        if (otherSocket.readyState === WebSocketOpenStatus) {
          otherSocket.send(disconnectMessage);
        }
      }
    });
  }

  sendUpdates(): void {
    for (const [clientId, client] of this.clients) {
      const update = client.update;
      const encodedUpdate = UserNetworkingCodec.encodeUpdate(update);

      for (const [otherClientId, otherClient] of this.clients) {
        if (otherClientId !== clientId && otherClient.socket.readyState === WebSocketOpenStatus) {
          otherClient.socket.send(encodedUpdate);
        }
      }
    }
  }
}
