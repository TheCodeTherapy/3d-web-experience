import { DeltaNetServer } from "@mml-io/delta-net-server";

import {
  COMPONENT_POSITION_X,
  COMPONENT_ROTATION_W,
  COMPONENT_POSITION_Y,
  COMPONENT_POSITION_Z,
  COMPONENT_ROTATION_Y,
  COMPONENT_STATE,
  rotationMultiplier,
  positionMultiplier,
} from "../DeltaNetComponentMapping";
import { UserData } from "../UserData";
import { UserNetworkingLogger } from "../UserNetworkingLogger";
import {
  parseServerBroadcastMessage,
  SERVER_BROADCAST_MESSAGE_TYPE,
} from "../UserNetworkingMessages";
import { UserNetworkingServer } from "../UserNetworkingServer";

import {
  LegacyUserNetworkingClientUpdate,
  LegacyUserNetworkingCodec,
} from "./LegacyUserNetworkingCodec";
import {
  LEGACY_USER_NETWORKING_AUTHENTICATION_FAILED_ERROR_TYPE,
  LEGACY_USER_NETWORKING_CONNECTION_LIMIT_REACHED_ERROR_TYPE,
  LEGACY_USER_NETWORKING_DISCONNECTED_MESSAGE_TYPE,
  LEGACY_USER_NETWORKING_IDENTITY_MESSAGE_TYPE,
  LEGACY_USER_NETWORKING_PONG_MESSAGE_TYPE,
  LEGACY_USER_NETWORKING_SERVER_ERROR_MESSAGE_TYPE,
  LEGACY_USER_NETWORKING_UNKNOWN_ERROR,
  LEGACY_USER_NETWORKING_USER_AUTHENTICATE_MESSAGE_TYPE,
  LEGACY_USER_NETWORKING_USER_PROFILE_MESSAGE_TYPE,
  LEGACY_USER_NETWORKING_USER_UPDATE_MESSAGE_TYPE,
  LegacyFromUserNetworkingClientMessage,
  LegacyFromUserNetworkingServerMessage,
  LegacyUserData,
  LegacyUserNetworkingAuthenticateMessage,
  LegacyUserNetworkingServerBroadcast,
  LegacyUserNetworkingServerError,
  LegacyUserNetworkingUserUpdateMessage,
} from "./LegacyUserNetworkingMessages";

export type LegacyUserNetworkingServerClient = {
  socket: WebSocket;
  id: number;
  lastPong: number;
  update: LegacyUserNetworkingClientUpdate;
  authenticatedUser: LegacyUserData | null;
};

function toArrayBuffer(buffer: Buffer) {
  const arrayBuffer = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(arrayBuffer);
  for (let i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i];
  }
  return arrayBuffer;
}

const WebSocketOpenStatus = 1;

export class LegacyAdapter {
  private allClientsById: Map<number, LegacyUserNetworkingServerClient> = new Map();
  private legacyAuthenticatedClientsById: Map<number, LegacyUserNetworkingServerClient> = new Map();

  constructor(
    private readonly userNetworkingServer: UserNetworkingServer,
    private readonly deltaNetServer: DeltaNetServer,
    private logger: UserNetworkingLogger,
  ) {}

  public broadcastMessage(broadcastType: number, broadcastPayload: string) {
    // The new broadcast type is a number and then the payload is a string
    // "Broadcast" messages intended for legacy clients are only the SERVER_BROADCAST_MESSAGE_TYPE
    if (broadcastType !== SERVER_BROADCAST_MESSAGE_TYPE) {
      return;
    }

    const parsedPayload = parseServerBroadcastMessage(broadcastPayload);
    if (parsedPayload instanceof Error) {
      this.logger.error("Error parsing server broadcast message", parsedPayload);
      return;
    }

    const { broadcastType: broadcastTypeString, payload } = parsedPayload;

    const message: LegacyUserNetworkingServerBroadcast = {
      type: "broadcast",
      broadcastType: broadcastTypeString,
      payload: payload,
    };
    const messageString = JSON.stringify(message);
    for (const [, client] of this.legacyAuthenticatedClientsById) {
      if (client.socket.readyState === WebSocketOpenStatus) {
        client.socket.send(messageString);
      }
    }
  }

  public addWebSocket(socket: WebSocket) {
    const id = this.userNetworkingServer.getLegacyClientId();

    // Create a client but without user information
    const client: LegacyUserNetworkingServerClient = {
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

    socket.addEventListener("message", (message: MessageEvent) => {
      try {
        if (message.data instanceof ArrayBuffer || message.data instanceof Buffer) {
          if (client.authenticatedUser) {
            const arrayBuffer =
              message.data instanceof ArrayBuffer ? message.data : toArrayBuffer(message.data);
            const update = LegacyUserNetworkingCodec.decodeUpdate(arrayBuffer);
            update.id = id;
            const index = this.deltaNetServer.dangerouslyGetConnectionsToComponentIndex().get(id);
            client.update = update;
            if (index !== undefined) {
              this.deltaNetServer.setComponentValue(
                COMPONENT_POSITION_X,
                index,
                BigInt(Math.round(update.position.x * positionMultiplier)),
              );
              this.deltaNetServer.setComponentValue(
                COMPONENT_POSITION_Y,
                index,
                BigInt(Math.round(update.position.y * positionMultiplier)),
              );
              this.deltaNetServer.setComponentValue(
                COMPONENT_POSITION_Z,
                index,
                BigInt(Math.round(update.position.z * positionMultiplier)),
              );
              this.deltaNetServer.setComponentValue(
                COMPONENT_ROTATION_Y,
                index,
                BigInt(Math.round(update.rotation.quaternionY * rotationMultiplier)),
              );
              this.deltaNetServer.setComponentValue(
                COMPONENT_ROTATION_W,
                index,
                BigInt(Math.round(update.rotation.quaternionW * rotationMultiplier)),
              );
              this.deltaNetServer.setComponentValue(
                COMPONENT_STATE,
                index,
                BigInt(Math.round(update.state)),
              );
            }
          }
        } else {
          let parsed;
          try {
            parsed = JSON.parse(message.data as string) as LegacyFromUserNetworkingClientMessage;
          } catch (e) {
            this.logger.error("Error parsing JSON message", message, e);
            return;
          }
          if (!client.authenticatedUser) {
            if (parsed.type === LEGACY_USER_NETWORKING_USER_AUTHENTICATE_MESSAGE_TYPE) {
              this.handleUserAuth(client, parsed).then((authResult) => {
                if (client.socket.readyState !== WebSocketOpenStatus) {
                  // The client disconnected before the authentication was completed
                  return;
                }
                if (!authResult) {
                  this.logger.error(`Client-id ${client.id} user_auth failed`, authResult);
                  // If the user is not authorized, disconnect the client
                  const serverError = JSON.stringify({
                    type: LEGACY_USER_NETWORKING_SERVER_ERROR_MESSAGE_TYPE,
                    errorType: LEGACY_USER_NETWORKING_AUTHENTICATION_FAILED_ERROR_TYPE,
                    message: "Authentication failed",
                  } as LegacyFromUserNetworkingServerMessage);
                  socket.send(serverError);
                  socket.close();
                } else {
                  if (!this.userNetworkingServer.hasCapacityForLegacyClient()) {
                    // There is a connection limit and it has been met - disconnect the user
                    const serverError = JSON.stringify({
                      type: LEGACY_USER_NETWORKING_SERVER_ERROR_MESSAGE_TYPE,
                      errorType: LEGACY_USER_NETWORKING_CONNECTION_LIMIT_REACHED_ERROR_TYPE,
                      message: "Connection limit reached",
                    } as LegacyFromUserNetworkingServerMessage);
                    socket.send(serverError);
                    socket.close();
                    return;
                  }

                  const userData = authResult;

                  this.deltaNetServer.dangerouslyAddNewJoinerCallback((index) => {
                    if (client.socket.readyState !== WebSocketOpenStatus) {
                      return null;
                    }
                    client.authenticatedUser = userData;
                    this.deltaNetServer.setComponentValue(COMPONENT_POSITION_X, index, BigInt(0));
                    this.deltaNetServer.setComponentValue(COMPONENT_POSITION_Y, index, BigInt(0));
                    this.deltaNetServer.setComponentValue(COMPONENT_POSITION_Z, index, BigInt(0));
                    this.deltaNetServer.setComponentValue(COMPONENT_ROTATION_Y, index, BigInt(0));
                    this.deltaNetServer.setComponentValue(COMPONENT_ROTATION_W, index, BigInt(0));
                    this.deltaNetServer.setComponentValue(COMPONENT_STATE, index, BigInt(0));

                    const asUserData: UserData = {
                      ...userData,
                      colors: [],
                    };
                    return {
                      id: client.id,
                      afterAddCallback: () => {
                        this.userNetworkingServer.setAuthenticatedLegacyClientConnection(
                          client.id,
                          client.socket,
                          asUserData,
                        );
                        this.userNetworkingServer.updateUserCharacter(client.id, asUserData);
                      },
                    };
                  });

                  // Give the client its own profile
                  const userProfileMessage = JSON.stringify({
                    id: client.id,
                    type: LEGACY_USER_NETWORKING_USER_PROFILE_MESSAGE_TYPE,
                    username: userData.username,
                    characterDescription: userData.characterDescription,
                  } as LegacyFromUserNetworkingServerMessage);
                  client.socket.send(userProfileMessage);

                  // Give the client its own identity
                  const identityMessage = JSON.stringify({
                    id: client.id,
                    type: LEGACY_USER_NETWORKING_IDENTITY_MESSAGE_TYPE,
                  } as LegacyFromUserNetworkingServerMessage);
                  client.socket.send(identityMessage);

                  const allUsers: Map<number, number> =
                    this.deltaNetServer.dangerouslyGetConnectionsToComponentIndex();
                  for (const [connectionId, componentIndex] of allUsers) {
                    if (connectionId === client.id) {
                      continue;
                    }
                    const x =
                      this.deltaNetServer.getComponentValue(COMPONENT_POSITION_X, componentIndex) ??
                      0 / positionMultiplier;
                    const y =
                      this.deltaNetServer.getComponentValue(COMPONENT_POSITION_Y, componentIndex) ??
                      0 / positionMultiplier;
                    const z =
                      this.deltaNetServer.getComponentValue(COMPONENT_POSITION_Z, componentIndex) ??
                      0 / positionMultiplier;
                    const quaternionY =
                      this.deltaNetServer.getComponentValue(COMPONENT_ROTATION_Y, componentIndex) ??
                      0 / rotationMultiplier;
                    const quaternionW =
                      this.deltaNetServer.getComponentValue(COMPONENT_ROTATION_W, componentIndex) ??
                      0 / rotationMultiplier;
                    const state =
                      this.deltaNetServer.getComponentValue(COMPONENT_STATE, componentIndex) ?? 0;
                    const update = LegacyUserNetworkingCodec.encodeUpdate({
                      id: connectionId,
                      position: { x, y, z },
                      rotation: { quaternionY, quaternionW },
                      state,
                    });
                    // Send the update about the other user to the newly connected client
                    client.socket.send(
                      JSON.stringify({
                        id: connectionId,
                        type: LEGACY_USER_NETWORKING_USER_PROFILE_MESSAGE_TYPE,
                        username: this.userNetworkingServer.getUsername(connectionId),
                        characterDescription:
                          this.userNetworkingServer.getCharacterDescription(connectionId),
                      } satisfies LegacyFromUserNetworkingServerMessage),
                    );
                    client.socket.send(update);
                  }

                  this.legacyAuthenticatedClientsById.set(id, client);
                }
              });
            } else {
              this.logger.error(`Unhandled message pre-auth: ${JSON.stringify(parsed)}`);
              socket.close();
            }
          } else {
            switch (parsed.type) {
              case LEGACY_USER_NETWORKING_PONG_MESSAGE_TYPE:
                client.lastPong = Date.now();
                break;

              case LEGACY_USER_NETWORKING_USER_UPDATE_MESSAGE_TYPE:
                this.handleUserUpdate(id, parsed as LegacyUserNetworkingUserUpdateMessage);
                break;

              default:
                this.logger.error(`Unhandled message: ${JSON.stringify(parsed)}`);
            }
          }
        }
      } catch (e) {
        this.logger.error("Error handling message", message, e);
        socket.send(
          JSON.stringify({
            type: LEGACY_USER_NETWORKING_SERVER_ERROR_MESSAGE_TYPE,
            errorType: LEGACY_USER_NETWORKING_UNKNOWN_ERROR,
            message: "Error handling message",
          } satisfies LegacyFromUserNetworkingServerMessage),
        );
        socket.close();
      }
    });

    socket.addEventListener("close", () => {
      this.handleDisconnectedClient(client);
    });
  }

  private handleDisconnectedClient(client: LegacyUserNetworkingServerClient) {
    if (!this.allClientsById.has(client.id)) {
      return;
    }
    this.allClientsById.delete(client.id);
    if (client.authenticatedUser !== null) {
      // Only report disconnections of clients that were authenticated
      this.userNetworkingServer.onLegacyClientDisconnect(client.id);
      this.legacyAuthenticatedClientsById.delete(client.id);
      this.deltaNetServer.clearInternalConnectionId(client.id);
    }
  }

  private async handleUserAuth(
    client: LegacyUserNetworkingServerClient,
    credentials: LegacyUserNetworkingAuthenticateMessage,
  ): Promise<false | LegacyUserData> {
    const userData = this.userNetworkingServer.onLegacyClientConnect(
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

    if (resolvedUserData instanceof Error) {
      this.logger.error(`Client-id ${client.id} user_auth failed`, resolvedUserData);
      return false;
    } else if (resolvedUserData === true) {
      this.logger.error(`Client-id ${client.id} user_auth failed`, resolvedUserData);
      resolvedUserData = credentials.userIdentity as LegacyUserData;
    } else {
      resolvedUserData = resolvedUserData as LegacyUserData;
    }
    if (resolvedUserData === null) {
      this.logger.error(`Client-id ${client.id} user_auth unauthorized and ignored`);
      return false;
    }

    return resolvedUserData;
  }

  public updateUserCharacter(clientId: number, userData: LegacyUserData) {
    this.internalUpdateUser(clientId, userData);
  }

  private internalUpdateUser(clientId: number, userData: LegacyUserData) {
    // This function assumes authorization has already been done
    const client = this.legacyAuthenticatedClientsById.get(clientId)!;

    client.authenticatedUser = userData;
    this.legacyAuthenticatedClientsById.set(clientId, client);

    this.userNetworkingServer.updateUserCharacter(client.id, { ...userData, colors: [] });
  }

  private async handleUserUpdate(
    clientId: number,
    message: LegacyUserNetworkingUserUpdateMessage,
  ): Promise<void> {
    const client = this.legacyAuthenticatedClientsById.get(clientId);
    if (!client) {
      this.logger.error(`Client-id ${clientId} user_update ignored, client not found`);
      return;
    }

    // TODO - call the UserNetworkingServer to check if the update is allowed
    // Verify using the user authenticator what the allowed version of this update is
    const authorizedUserData = message.userIdentity;

    let resolvedAuthorizedUserData;
    if (authorizedUserData instanceof Promise) {
      resolvedAuthorizedUserData = await authorizedUserData;
    } else {
      resolvedAuthorizedUserData = authorizedUserData;
    }
    if (!resolvedAuthorizedUserData) {
      // TODO - inform the client about the unauthorized update
      this.logger.warn(`Client-id ${clientId} user_update unauthorized and ignored`);
      return;
    }

    this.internalUpdateUser(clientId, resolvedAuthorizedUserData);
  }

  public sendUpdates(
    removedIds: Set<number>,
    addedIds: Set<number>,
    updateUserProfilesInTick: Set<number>,
  ): void {
    for (const id of removedIds) {
      const disconnectMessage = JSON.stringify({
        id,
        type: LEGACY_USER_NETWORKING_DISCONNECTED_MESSAGE_TYPE,
      } as LegacyFromUserNetworkingServerMessage);
      for (const [, otherClient] of this.legacyAuthenticatedClientsById) {
        if (otherClient.socket.readyState === WebSocketOpenStatus) {
          otherClient.socket.send(disconnectMessage);
        }
      }
    }

    for (const id of addedIds) {
      const identityMessage = JSON.stringify({
        id: id,
        type: LEGACY_USER_NETWORKING_USER_PROFILE_MESSAGE_TYPE,
        username: this.userNetworkingServer.getUsername(id),
        characterDescription: this.userNetworkingServer.getCharacterDescription(id),
      } satisfies LegacyFromUserNetworkingServerMessage);
      for (const [, otherClient] of this.legacyAuthenticatedClientsById) {
        if (otherClient.socket.readyState === WebSocketOpenStatus) {
          otherClient.socket.send(identityMessage);
        }
      }
    }

    for (const id of updateUserProfilesInTick) {
      const identityMessage = JSON.stringify({
        id: id,
        type: LEGACY_USER_NETWORKING_USER_PROFILE_MESSAGE_TYPE,
        username: this.userNetworkingServer.getUsername(id),
        characterDescription: this.userNetworkingServer.getCharacterDescription(id),
      } satisfies LegacyFromUserNetworkingServerMessage);
      for (const [, otherClient] of this.legacyAuthenticatedClientsById) {
        if (otherClient.socket.readyState === WebSocketOpenStatus) {
          otherClient.socket.send(identityMessage);
        }
      }
    }

    const allUsers: Map<number, number> =
      this.deltaNetServer.dangerouslyGetConnectionsToComponentIndex();
    for (const [connectionId, componentIndex] of allUsers) {
      const x =
        this.deltaNetServer.getComponentValue(COMPONENT_POSITION_X, componentIndex) ??
        0 / positionMultiplier;
      const y =
        this.deltaNetServer.getComponentValue(COMPONENT_POSITION_Y, componentIndex) ??
        0 / positionMultiplier;
      const z =
        this.deltaNetServer.getComponentValue(COMPONENT_POSITION_Z, componentIndex) ??
        0 / positionMultiplier;
      const quaternionY =
        this.deltaNetServer.getComponentValue(COMPONENT_ROTATION_Y, componentIndex) ??
        0 / rotationMultiplier;
      const quaternionW =
        this.deltaNetServer.getComponentValue(COMPONENT_ROTATION_W, componentIndex) ??
        0 / rotationMultiplier;
      const state = this.deltaNetServer.getComponentValue(COMPONENT_STATE, componentIndex) ?? 0;
      const encodedUpdate = LegacyUserNetworkingCodec.encodeUpdate({
        id: connectionId,
        position: { x, y, z },
        rotation: { quaternionY, quaternionW },
        state,
      });

      for (const [otherClientId, otherClient] of this.legacyAuthenticatedClientsById) {
        if (
          otherClientId !== connectionId &&
          otherClient.socket.readyState === WebSocketOpenStatus
        ) {
          otherClient.socket.send(encodedUpdate);
        }
      }
    }
  }

  public dispose(clientCloseError?: LegacyUserNetworkingServerError) {
    const stringifiedError = clientCloseError ? JSON.stringify(clientCloseError) : undefined;

    for (const [, client] of this.legacyAuthenticatedClientsById) {
      if (stringifiedError) {
        client.socket.send(stringifiedError);
      }
      client.socket.close();
    }
  }
}
