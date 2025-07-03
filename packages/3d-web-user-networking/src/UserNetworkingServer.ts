import WebSocket from "ws";

import { heartBeatRate, packetsUpdateRate, pingPongRate } from "./user-networking-settings";
import { UserData } from "./UserData";
import { UserNetworkingClientUpdate, UserNetworkingCodec } from "./UserNetworkingCodec";
import {
  FromUserNetworkingClientMessage,
  FromUserNetworkingServerMessage,
  USER_NETWORKING_AUTHENTICATION_FAILED_ERROR_TYPE,
  USER_NETWORKING_CONNECTION_LIMIT_REACHED_ERROR_TYPE,
  USER_NETWORKING_DISCONNECTED_MESSAGE_TYPE,
  USER_NETWORKING_IDENTITY_MESSAGE_TYPE,
  USER_NETWORKING_PONG_MESSAGE_TYPE,
  USER_NETWORKING_SERVER_ERROR_MESSAGE_TYPE,
  USER_NETWORKING_USER_AUTHENTICATE_MESSAGE_TYPE,
  USER_NETWORKING_USER_PROFILE_MESSAGE_TYPE,
  USER_NETWORKING_USER_UPDATE_MESSAGE_TYPE,
  UserIdentity,
  UserNetworkingAuthenticateMessage,
  UserNetworkingServerError,
  UserNetworkingUserUpdateMessage,
} from "./UserNetworkingMessages";

export type UserNetworkingServerClient = {
  socket: WebSocket;
  id: number;
  lastPong: number;
  update: UserNetworkingClientUpdate;
  authenticatedUser: UserData | null;
};

const WebSocketOpenStatus = 1;

export type UserNetworkingServerOptions = {
  connectionLimit?: number;
  onClientConnect: (
    clientId: number,
    sessionToken: string,
    userIdentity?: UserIdentity,
  ) => Promise<UserData | null> | UserData | null;
  onClientUserIdentityUpdate: (
    clientId: number,
    userIdentity: UserIdentity,
  ) => Promise<UserData | null> | UserData | null;
  onClientDisconnect: (clientId: number) => void;
};

export class UserNetworkingServer {
  private allClientsById = new Map<number, UserNetworkingServerClient>();
  private authenticatedClientsById: Map<number, UserNetworkingServerClient> = new Map();

  private sendUpdatesIntervalTimer: NodeJS.Timeout;
  private pingClientsIntervalTimer: NodeJS.Timeout;
  private heartbeatIntervalTimer: NodeJS.Timeout;

  constructor(private options: UserNetworkingServerOptions) {
    this.sendUpdatesIntervalTimer = setInterval(this.sendUpdates.bind(this), packetsUpdateRate);
    this.pingClientsIntervalTimer = setInterval(this.pingClients.bind(this), pingPongRate);
    this.heartbeatIntervalTimer = setInterval(this.heartBeat.bind(this), heartBeatRate);
  }

  private heartBeat() {
    const now = Date.now();
    this.allClientsById.forEach((client) => {
      if (now - client.lastPong > heartBeatRate) {
        client.socket.close();
        this.handleDisconnectedClient(client);
      }
    });
  }

  private pingClients() {
    const message: FromUserNetworkingServerMessage = { type: "ping" };
    const messageString = JSON.stringify(message);
    this.authenticatedClientsById.forEach((client) => {
      if (client.socket.readyState === WebSocketOpenStatus) {
        client.socket.send(messageString);
      }
    });
  }

  private getId(): number {
    let id = 1;
    while (this.allClientsById.has(id)) {
      id++;
    }
    return id;
  }

  public broadcastMessage(broadcastType: string, broadcastPayload: any) {
    const message: FromUserNetworkingServerMessage = {
      type: "broadcast",
      broadcastType,
      payload: broadcastPayload,
    };
    const messageString = JSON.stringify(message);
    for (const [, client] of this.authenticatedClientsById) {
      if (client.socket.readyState === WebSocketOpenStatus) {
        client.socket.send(messageString);
      }
    }
  }

  public connectClient(socket: WebSocket) {
    const id = this.getId();
    console.log(`Client ID: ${id} joined, waiting for user-identification`);

    // Create a client but without user information
    const client: UserNetworkingServerClient = {
      id,
      lastPong: Date.now(),
      socket: socket as WebSocket,
      authenticatedUser: null,
      update: {
        id,
        position: { x: 0, y: 0, z: 0 },
        rotation: { quaternionY: 0, quaternionW: 1 },
        state: 0,
      },
    };
    this.allClientsById.set(id, client);

    socket.on("message", (message: WebSocket.Data, _isBinary: boolean) => {
      if (message instanceof Buffer) {
        const arrayBuffer = new Uint8Array(message).buffer;
        const update = UserNetworkingCodec.decodeUpdate(arrayBuffer);
        update.id = id;
        client.update = update;
      } else {
        let parsed;
        try {
          parsed = JSON.parse(message as string) as FromUserNetworkingClientMessage;
        } catch (e) {
          console.error("Error parsing JSON message", message, e);
          return;
        }
        if (!client.authenticatedUser) {
          if (parsed.type === USER_NETWORKING_USER_AUTHENTICATE_MESSAGE_TYPE) {
            this.handleUserAuth(client, parsed).then((authResult) => {
              if (client.socket.readyState !== WebSocketOpenStatus) {
                // The client disconnected before the authentication was completed
                return;
              }
              if (!authResult) {
                // If the user is not authorized, disconnect the client
                const serverError = JSON.stringify({
                  type: USER_NETWORKING_SERVER_ERROR_MESSAGE_TYPE,
                  errorType: USER_NETWORKING_AUTHENTICATION_FAILED_ERROR_TYPE,
                  message: "Authentication failed",
                } as FromUserNetworkingServerMessage);
                socket.send(serverError);
                socket.close();
              } else {
                if (
                  this.options.connectionLimit !== undefined &&
                  this.authenticatedClientsById.size >= this.options.connectionLimit
                ) {
                  // There is a connection limit and it has been met - disconnect the user
                  const serverError = JSON.stringify({
                    type: USER_NETWORKING_SERVER_ERROR_MESSAGE_TYPE,
                    errorType: USER_NETWORKING_CONNECTION_LIMIT_REACHED_ERROR_TYPE,
                    message: "Connection limit reached",
                  } as FromUserNetworkingServerMessage);
                  socket.send(serverError);
                  socket.close();
                  return;
                }

                const userData = authResult;
                client.authenticatedUser = userData;

                // Give the client its own profile
                const userProfileMessage = JSON.stringify({
                  id: client.id,
                  type: USER_NETWORKING_USER_PROFILE_MESSAGE_TYPE,
                  username: userData.username,
                  characterDescription: userData.characterDescription,
                } as FromUserNetworkingServerMessage);
                client.socket.send(userProfileMessage);

                // Give the client its own identity
                const identityMessage = JSON.stringify({
                  id: client.id,
                  type: USER_NETWORKING_IDENTITY_MESSAGE_TYPE,
                } as FromUserNetworkingServerMessage);
                client.socket.send(identityMessage);

                const userUpdateMessage = UserNetworkingCodec.encodeUpdate(client.update);

                // Send information about all other clients to the freshly connected client and vice versa
                for (const [, otherClient] of this.authenticatedClientsById) {
                  if (
                    otherClient.socket.readyState !== WebSocketOpenStatus ||
                    otherClient === client
                  ) {
                    // Do not send updates for any clients which have not yet authenticated or not yet connected
                    continue;
                  }
                  // Send the character information
                  client.socket.send(
                    JSON.stringify({
                      id: otherClient.update.id,
                      type: USER_NETWORKING_USER_PROFILE_MESSAGE_TYPE,
                      username: otherClient.authenticatedUser?.username,
                      characterDescription: otherClient.authenticatedUser?.characterDescription,
                    } as FromUserNetworkingServerMessage),
                  );
                  client.socket.send(UserNetworkingCodec.encodeUpdate(otherClient.update));

                  otherClient.socket.send(userProfileMessage);
                  otherClient.socket.send(userUpdateMessage);
                }

                this.authenticatedClientsById.set(id, client);
              }
            });
          } else {
            console.error(`Unhandled message pre-auth: ${JSON.stringify(parsed)}`);
            socket.close();
          }
        } else {
          switch (parsed.type) {
            case USER_NETWORKING_PONG_MESSAGE_TYPE:
              client.lastPong = Date.now();
              break;

            case USER_NETWORKING_USER_UPDATE_MESSAGE_TYPE:
              this.handleUserUpdate(id, parsed as UserNetworkingUserUpdateMessage);
              break;

            default:
              console.error(`Unhandled message: ${JSON.stringify(parsed)}`);
          }
        }
      }
    });

    socket.on("close", () => {
      console.log("Client disconnected", id);
      this.handleDisconnectedClient(client);
    });
  }

  private handleDisconnectedClient(client: UserNetworkingServerClient) {
    if (!this.allClientsById.has(client.id)) {
      return;
    }
    this.allClientsById.delete(client.id);
    if (client.authenticatedUser !== null) {
      // Only report disconnections of clients that were authenticated
      this.options.onClientDisconnect(client.id);
      this.authenticatedClientsById.delete(client.id);
      const disconnectMessage = JSON.stringify({
        id: client.id,
        type: USER_NETWORKING_DISCONNECTED_MESSAGE_TYPE,
      } as FromUserNetworkingServerMessage);
      for (const [, otherClient] of this.authenticatedClientsById) {
        if (otherClient.socket.readyState === WebSocketOpenStatus) {
          otherClient.socket.send(disconnectMessage);
        }
      }
    }
  }

  private async handleUserAuth(
    client: UserNetworkingServerClient,
    credentials: UserNetworkingAuthenticateMessage,
  ): Promise<false | UserData> {
    const userData = this.options.onClientConnect(
      client.id,
      credentials.sessionToken,
      credentials.userIdentity,
    );
    let resolvedUserData;
    if (userData instanceof Promise) {
      resolvedUserData = await userData;
    } else {
      resolvedUserData = userData;
    }
    if (resolvedUserData === null) {
      console.error(`Client-id ${client.id} user_auth unauthorized and ignored`);
      return false;
    }

    console.log("Client authenticated", client.id, resolvedUserData);

    return resolvedUserData;
  }

  public updateUserCharacter(clientId: number, userData: UserData) {
    this.internalUpdateUser(clientId, userData);
  }

  private internalUpdateUser(clientId: number, userData: UserData) {
    // This function assumes authorization has already been done
    const client = this.authenticatedClientsById.get(clientId)!;

    client.authenticatedUser = userData;
    this.authenticatedClientsById.set(clientId, client);

    const newUserData = JSON.stringify({
      id: clientId,
      type: USER_NETWORKING_USER_PROFILE_MESSAGE_TYPE,
      username: userData.username,
      characterDescription: userData.characterDescription,
    } as FromUserNetworkingServerMessage);

    // Broadcast the new userdata to all sockets, INCLUDING the user of the calling socket
    // Clients will always render based on the public userProfile.
    // This makes it intuitive, as it is "what you see is what other's see" from a user's perspective.
    for (const [otherClientId, otherClient] of this.authenticatedClientsById) {
      if (otherClient.socket.readyState === WebSocketOpenStatus) {
        otherClient.socket.send(newUserData);
      }
    }
  }

  private async handleUserUpdate(
    clientId: number,
    message: UserNetworkingUserUpdateMessage,
  ): Promise<void> {
    const client = this.authenticatedClientsById.get(clientId);
    if (!client) {
      console.error(`Client-id ${clientId} user_update ignored, client not found`);
      return;
    }

    // Verify using the user authenticator what the allowed version of this update is
    const authorizedUserData = this.options.onClientUserIdentityUpdate(
      clientId,
      message.userIdentity,
    );

    let resolvedAuthorizedUserData;
    if (authorizedUserData instanceof Promise) {
      resolvedAuthorizedUserData = await authorizedUserData;
    } else {
      resolvedAuthorizedUserData = authorizedUserData;
    }
    if (!resolvedAuthorizedUserData) {
      // TODO - inform the client about the unauthorized update
      console.warn(`Client-id ${clientId} user_update unauthorized and ignored`);
      return;
    }

    this.internalUpdateUser(clientId, resolvedAuthorizedUserData);
  }

  private sendUpdates(): void {
    for (const [clientId, client] of this.authenticatedClientsById) {
      const update = client.update;
      const encodedUpdate = UserNetworkingCodec.encodeUpdate(update);

      for (const [otherClientId, otherClient] of this.authenticatedClientsById) {
        if (otherClientId !== clientId && otherClient.socket.readyState === WebSocketOpenStatus) {
          otherClient.socket.send(encodedUpdate);
        }
      }
    }
  }

  public dispose(clientCloseError?: UserNetworkingServerError) {
    clearInterval(this.sendUpdatesIntervalTimer);
    clearInterval(this.pingClientsIntervalTimer);
    clearInterval(this.heartbeatIntervalTimer);

    const stringifiedError = clientCloseError ? JSON.stringify(clientCloseError) : undefined;

    for (const [, client] of this.authenticatedClientsById) {
      if (stringifiedError) {
        client.socket.send(stringifiedError);
      }
      client.socket.close();
    }
  }
}
