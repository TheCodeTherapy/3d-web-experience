import { encodeError, DeltaNetV01ServerErrors } from "@mml-io/delta-net-protocol";
import {
  DeltaNetServer,
  DeltaNetServerError,
  DeltaNetV01Connection,
  onComponentsUpdateOptions,
  onCustomMessageOptions,
  onJoinerOptions,
  onLeaveOptions,
  onStatesUpdateOptions,
} from "@mml-io/delta-net-server";

import { DeltaNetComponentMapping } from "./DeltaNetComponentMapping";
import { LegacyAdapter } from "./legacy/LegacyAdapter";
import {
  LegacyUserIdentity,
  LegacyCharacterDescription,
} from "./legacy/LegacyUserNetworkingMessages";
import { UserData } from "./UserData";
import { UserNetworkingConsoleLogger, UserNetworkingLogger } from "./UserNetworkingLogger";
import {
  FROM_CLIENT_CHAT_MESSAGE_TYPE,
  FROM_SERVER_CHAT_MESSAGE_TYPE,
  parseClientChatMessage,
  ServerChatMessage,
  UserNetworkingServerError,
  CharacterDescription,
} from "./UserNetworkingMessages";

export type UserNetworkingServerClient = {
  socket: WebSocket;
  id: number;
  lastPong: number;
  authenticatedUser: UserData | null;
  // May be null for legacy clients
  deltaNetConnection: DeltaNetV01Connection | null;
};

export type UserNetworkingServerOptions = {
  legacyAdapterEnabled?: boolean;
  onClientConnect: (
    clientId: number,
    sessionToken: string,
    userIdentity?: UserData,
  ) => Promise<UserData | true | Error> | UserData | true | Error;
  onClientUserIdentityUpdate: (
    clientId: number,
    userIdentity: UserData,
  ) => Promise<UserData | null | false | true | Error> | UserData | null | false | true | Error;
  onClientDisconnect: (clientId: number) => void;
};

export class UserNetworkingServer {
  private deltaNetServer: DeltaNetServer;
  private authenticatedClientsById: Map<number, UserNetworkingServerClient> = new Map();
  private tickInterval: NodeJS.Timeout;
  private legacyAdapter: LegacyAdapter | null = null;
  private updatedUserProfilesInTick: Set<number> = new Set();

  constructor(
    private options: UserNetworkingServerOptions,
    private logger: UserNetworkingLogger = new UserNetworkingConsoleLogger(),
  ) {
    this.deltaNetServer = new DeltaNetServer({
      serverConnectionIdStateId: 0,
      onJoiner: (joiner: onJoinerOptions) => {
        return this.handleJoiner(joiner);
      },
      onLeave: (leave: onLeaveOptions) => {
        this.handleLeave(leave);
      },
      onComponentsUpdate: (update: onComponentsUpdateOptions) => {
        // TODO - potentially check that components are valid (e.g. rotation is 0 to 2pi)
        return; // No error
      },
      onStatesUpdate: (update: onStatesUpdateOptions) => {
        return this.handleStatesUpdate(update);
      },
      onCustomMessage: (customMessage: onCustomMessageOptions) => {
        this.handleCustomMessage(customMessage);
      },
    });
    if (this.options.legacyAdapterEnabled) {
      this.legacyAdapter = new LegacyAdapter(this, this.deltaNetServer, this.logger);
    }

    // Start the deltanet server tick
    this.tickInterval = setInterval(() => {
      const { removedIds, addedIds } = this.deltaNetServer.tick();
      if (this.legacyAdapter) {
        this.legacyAdapter.sendUpdates(removedIds, addedIds, this.updatedUserProfilesInTick);
        this.updatedUserProfilesInTick.clear();
      }
    }, 50);
  }

  getCharacterDescription(connectionId: number): LegacyCharacterDescription {
    const client = this.authenticatedClientsById.get(connectionId);
    return client?.authenticatedUser?.characterDescription ?? { mmlCharacterUrl: "" };
  }
  getUsername(connectionId: number): string {
    const client = this.authenticatedClientsById.get(connectionId);
    this.logger.info("getUsername", connectionId, client?.authenticatedUser?.username);
    return client?.authenticatedUser?.username ?? "";
  }

  public getLegacyClientId() {
    return this.deltaNetServer.getNextConnectionId();
  }

  public hasCapacityForLegacyClient() {
    return true;
  }

  public onLegacyClientConnect(
    id: number,
    sessionToken: string,
    userIdentity: LegacyUserIdentity | undefined,
  ): Promise<UserData | true | Error> | UserData | true | Error {
    return this.options.onClientConnect(id, sessionToken, {
      username: userIdentity?.username ?? null,
      characterDescription: userIdentity?.characterDescription ?? null,
      colors: null,
    });
  }

  public setAuthenticatedLegacyClientConnection(
    clientId: number,
    webSocket: WebSocket,
    userData: UserData,
  ) {
    this.logger.info("setAuthenticatedLegacyClientConnection", clientId, userData);
    const authenticatedClient: UserNetworkingServerClient = {
      id: clientId,
      socket: webSocket,
      lastPong: Date.now(),
      authenticatedUser: userData,
      deltaNetConnection: null,
    };
    this.authenticatedClientsById.set(clientId, authenticatedClient);
  }

  public onLegacyClientDisconnect(id: number) {
    this.options.onClientDisconnect(id);
  }

  private handleStatesUpdate(
    update: onStatesUpdateOptions,
  ):
    | DeltaNetServerError
    | void
    | { success: true; stateOverrides?: Array<[number, Uint8Array]> }
    | Promise<
        DeltaNetServerError | void | { success: true; stateOverrides?: Array<[number, Uint8Array]> }
      > {
    const deltaNetConnection = update.deltaNetV01Connection;
    const clientId = deltaNetConnection.internalConnectionId;
    const updatedStates = update.states;
    const updatedStatesMap = new Map<number, Uint8Array>(updatedStates);
    const updatedUserData: UserData = DeltaNetComponentMapping.fromUserStates(
      updatedStatesMap,
      this.logger,
    );

    const existingClient = this.authenticatedClientsById.get(clientId);
    if (!existingClient) {
      return new DeltaNetServerError(
        DeltaNetV01ServerErrors.USER_AUTHENTICATION_FAILED_ERROR_TYPE,
        "User not authenticated - no client found",
        false,
      );
    }
    const existingUserData = existingClient.authenticatedUser ?? {};
    const userData = {
      ...existingUserData,
      ...updatedUserData,
    };

    const res = this.options.onClientUserIdentityUpdate(clientId, userData);
    if (res instanceof Promise) {
      return res.then((res) => {
        if (!this.authenticatedClientsById.get(clientId)) {
          return new DeltaNetServerError(
            DeltaNetV01ServerErrors.USER_AUTHENTICATION_FAILED_ERROR_TYPE,
            "User not authenticated - client disconnected",
            false,
          );
        }

        if (res instanceof DeltaNetServerError) {
          return res;
        }
        if (res instanceof Error) {
          return new DeltaNetServerError(
            DeltaNetV01ServerErrors.USER_AUTHENTICATION_FAILED_ERROR_TYPE,
            "User identity update failed",
            false,
          );
        }
        if (res === null) {
          return new DeltaNetServerError(
            DeltaNetV01ServerErrors.USER_AUTHENTICATION_FAILED_ERROR_TYPE,
            "User identity update failed",
            false,
          );
        }
        if (res === false) {
          return new DeltaNetServerError(
            DeltaNetV01ServerErrors.USER_AUTHENTICATION_FAILED_ERROR_TYPE,
            "User identity update failed",
            false,
          );
        }
        if (!res || typeof res !== "object") {
          return new DeltaNetServerError(
            DeltaNetV01ServerErrors.USER_AUTHENTICATION_FAILED_ERROR_TYPE,
            "User identity update failed",
            false,
          );
        }

        this.updatedUserProfilesInTick.add(clientId);

        existingClient.authenticatedUser = {
          ...existingClient.authenticatedUser,
          ...res,
        };

        return {
          success: true,
          stateOverrides: Array.from(DeltaNetComponentMapping.toStates(res).entries()),
        };
      });
    }
    if (res instanceof DeltaNetServerError) {
      return res;
    }
    if (res instanceof Error) {
      return new DeltaNetServerError(
        DeltaNetV01ServerErrors.USER_AUTHENTICATION_FAILED_ERROR_TYPE,
        "User identity update failed",
        false,
      );
    }
    if (res === null) {
      return new DeltaNetServerError(
        DeltaNetV01ServerErrors.USER_AUTHENTICATION_FAILED_ERROR_TYPE,
        "User identity update failed",
        false,
      );
    }
    if (res === false) {
      return new DeltaNetServerError(
        DeltaNetV01ServerErrors.USER_AUTHENTICATION_FAILED_ERROR_TYPE,
        "User identity update failed",
        false,
      );
    }
    if (!res || typeof res !== "object") {
      return new DeltaNetServerError(
        DeltaNetV01ServerErrors.USER_AUTHENTICATION_FAILED_ERROR_TYPE,
        "User identity update failed",
        false,
      );
    }

    this.updatedUserProfilesInTick.add(clientId);

    existingClient.authenticatedUser = {
      ...existingClient.authenticatedUser,
      ...res,
    };

    return {
      success: true,
      stateOverrides: Array.from(DeltaNetComponentMapping.toStates(res).entries()),
    };
  }

  private handleJoiner(
    joiner: onJoinerOptions,
  ):
    | DeltaNetServerError
    | void
    | { success: true; stateOverrides?: Array<[number, Uint8Array]> }
    | Promise<
        DeltaNetServerError | void | { success: true; stateOverrides?: Array<[number, Uint8Array]> }
      > {
    const deltaNetConnection = joiner.deltaNetV01Connection as DeltaNetV01Connection;
    const webSocket = deltaNetConnection.webSocket as unknown as WebSocket;
    const states = joiner.states as Array<[number, Uint8Array]>;
    const clientId = joiner.internalConnectionId;

    const statesMap = new Map<number, Uint8Array>(states);
    const userData: UserData = DeltaNetComponentMapping.fromUserStates(statesMap, this.logger);

    // Handle authentication and return the result with state overrides
    return this.handleDeltaNetAuthentication(
      clientId,
      webSocket,
      deltaNetConnection,
      joiner.token,
      userData,
    )
      .then((authResult) => {
        if (!authResult.success) {
          // Authentication failed - return error to reject connection
          this.logger.warn(`Authentication failed for client ID: ${clientId}`, authResult.error);
          return new DeltaNetServerError(
            DeltaNetV01ServerErrors.USER_AUTHENTICATION_FAILED_ERROR_TYPE,
            authResult.error?.message || "Authentication failed",
            false,
          );
        } else {
          // Return success with state overrides
          return {
            success: true as const,
            stateOverrides: authResult.stateOverrides,
          };
        }
      })
      .catch((error) => {
        this.logger.error(`Authentication error for client ID: ${clientId}:`, error);
        return new DeltaNetServerError(
          DeltaNetV01ServerErrors.USER_AUTHENTICATION_FAILED_ERROR_TYPE,
          "Authentication error",
          false,
        );
      });
  }

  private handleLeave(leave: onLeaveOptions): void {
    const deltaNetConnection = leave.deltaNetV01Connection as DeltaNetV01Connection;
    const clientId = deltaNetConnection.internalConnectionId;

    if (clientId !== undefined) {
      const client = this.authenticatedClientsById.get(clientId);
      if (client) {
        this.options.onClientDisconnect(clientId);
        this.authenticatedClientsById.delete(clientId);
      }
    }
  }

  private handleCustomMessage(customMessage: onCustomMessageOptions): void {
    const deltaNetConnection = customMessage.deltaNetV01Connection;
    const clientId = deltaNetConnection.internalConnectionId;

    const client = this.authenticatedClientsById.get(clientId);
    if (client && client.authenticatedUser) {
      // Handle chat messages
      if (customMessage.customType === FROM_CLIENT_CHAT_MESSAGE_TYPE) {
        const chatMessage = parseClientChatMessage(customMessage.contents);
        if (chatMessage instanceof Error) {
          this.logger.error(`Invalid chat message from client ${clientId}:`, chatMessage);
        } else {
          const serverChatMessage: ServerChatMessage = {
            fromUserId: clientId,
            message: chatMessage.message,
          };
          // Broadcast the chat message to all other clients
          this.deltaNetServer.broadcastCustomMessage(
            FROM_SERVER_CHAT_MESSAGE_TYPE,
            JSON.stringify(serverChatMessage),
          );
        }
      }
    } else {
      this.logger.warn(`Custom message from unauthenticated client ${clientId} - ignoring`);
    }
  }

  private async handleDeltaNetAuthentication(
    clientId: number,
    webSocket: WebSocket,
    deltaNetConnection: DeltaNetV01Connection,
    sessionToken: string,
    userIdentity: UserData,
  ): Promise<
    | { success: true; stateOverrides?: Array<[number, Uint8Array]> }
    | { success: false; error?: Error }
  > {
    try {
      // For observers, we might want to allow anonymous access or use a different authentication flow
      let onClientConnectReturn = deltaNetConnection.isObserver
        ? null // Observers don't need user data
        : await this.options.onClientConnect(clientId, sessionToken, userIdentity);

      if (!deltaNetConnection.isObserver && !onClientConnectReturn) {
        this.logger.warn(`Authentication failed for client ${clientId} - no user data returned`);
        return { success: false };
      }

      if (onClientConnectReturn instanceof Error) {
        return { success: false, error: onClientConnectReturn };
      }

      if (onClientConnectReturn === true) {
        onClientConnectReturn = userIdentity;
      }

      const authenticatedUser: UserData | null = onClientConnectReturn;

      // Create authenticated client
      const authenticatedClient: UserNetworkingServerClient = {
        id: clientId,
        socket: webSocket,
        lastPong: Date.now(),
        authenticatedUser,
        deltaNetConnection: deltaNetConnection,
      };
      this.authenticatedClientsById.set(clientId, authenticatedClient);

      // Create state overrides with the user data from the authenticator
      // Observers don't have user data, so no state overrides
      let stateOverrides: Array<[number, Uint8Array]> = [];
      if (onClientConnectReturn) {
        const officialStates = DeltaNetComponentMapping.toStates(onClientConnectReturn);
        stateOverrides = Array.from(officialStates.entries());
      }

      return {
        success: true,
        stateOverrides: stateOverrides,
      };
    } catch (error) {
      this.logger.error("Authentication error:", error);
      return { success: false };
    }
  }

  public connectClient(socket: WebSocket): void {
    if (socket.protocol === "") {
      // This is likely a legacy client that does not support deltanet - use legacy adapter if enabled
      if (this.legacyAdapter) {
        this.legacyAdapter.addWebSocket(socket as unknown as globalThis.WebSocket);
        return;
      } else {
        socket.close(1000, "Legacy client detected (no subprotocol) - not supported");
        return;
      }
    }

    // Add websocket to deltanet server
    this.deltaNetServer.addWebSocket(socket as unknown as globalThis.WebSocket);

    socket.addEventListener("close", () => {
      this.deltaNetServer.removeWebSocket(socket as unknown as globalThis.WebSocket);
    });
  }

  public broadcastMessage(broadcastType: number, broadcastPayload: string): void {
    this.deltaNetServer.broadcastCustomMessage(broadcastType, broadcastPayload);
    if (this.legacyAdapter) {
      this.legacyAdapter.broadcastMessage(broadcastType, broadcastPayload);
    }
  }

  public updateUserCharacter(clientId: number, userData: UserData): void {
    this.logger.info("updateUserCharacter", clientId, userData);
    this.internalUpdateUser(clientId, userData);
  }

  public updateUserUsername(clientId: number, username: string): void {
    const client = this.authenticatedClientsById.get(clientId);
    if (!client || !client.authenticatedUser) return;

    // Update local user data by creating a new UserData object
    client.authenticatedUser = {
      ...client.authenticatedUser,
      username: username,
    };

    this.updatedUserProfilesInTick.add(clientId);

    // Update deltanet states with just the username
    const states = DeltaNetComponentMapping.toUsernameState(username);
    const asArray = Array.from(states.entries());
    this.deltaNetServer.overrideUserStates(client.deltaNetConnection, clientId, asArray);
  }

  public updateUserCharacterDescription(
    clientId: number,
    characterDescription: CharacterDescription,
  ): void {
    const client = this.authenticatedClientsById.get(clientId);
    if (!client || !client.authenticatedUser) return;

    // Update local user data by creating a new UserData object
    client.authenticatedUser = {
      ...client.authenticatedUser,
      characterDescription: characterDescription,
    };

    this.updatedUserProfilesInTick.add(clientId);

    // Update deltanet states with just the character description
    const states = DeltaNetComponentMapping.toCharacterDescriptionState(characterDescription);
    const asArray = Array.from(states.entries());
    this.deltaNetServer.overrideUserStates(client.deltaNetConnection, clientId, asArray);
  }

  public updateUserColors(clientId: number, colors: Array<[number, number, number]>): void {
    const client = this.authenticatedClientsById.get(clientId);
    if (!client || !client.authenticatedUser) return;

    // Update local user data by creating a new UserData object
    client.authenticatedUser = {
      ...client.authenticatedUser,
      colors: colors,
    };

    this.updatedUserProfilesInTick.add(clientId);

    // Update deltanet states with just the colors
    const states = DeltaNetComponentMapping.toColorsState(colors);
    const asArray = Array.from(states.entries());
    this.deltaNetServer.overrideUserStates(client.deltaNetConnection, clientId, asArray);
  }

  public updateUserStates(clientId: number, updates: UserData): void {
    const client = this.authenticatedClientsById.get(clientId);
    if (!client || !client.authenticatedUser) return;

    const states = new Map<number, Uint8Array>();
    let hasUpdates = false;
    let updatedUserData = client.authenticatedUser;

    this.updatedUserProfilesInTick.add(clientId);

    // Update username if provided
    if (updates.username !== null) {
      updatedUserData = {
        ...updatedUserData,
        username: updates.username,
      };
      const usernameStates = DeltaNetComponentMapping.toUsernameState(updates.username);
      for (const [stateId, stateValue] of usernameStates) {
        states.set(stateId, stateValue);
      }
      hasUpdates = true;
    }

    // Update character description if provided
    if (updates.characterDescription !== null) {
      updatedUserData = {
        ...updatedUserData,
        characterDescription: updates.characterDescription,
      };
      const characterDescStates = DeltaNetComponentMapping.toCharacterDescriptionState(
        updates.characterDescription,
      );
      for (const [stateId, stateValue] of characterDescStates) {
        states.set(stateId, stateValue);
      }
      hasUpdates = true;
    }

    // Update colors if provided
    if (updates.colors !== null) {
      updatedUserData = {
        ...updatedUserData,
        colors: updates.colors,
      };
      const colorsStates = DeltaNetComponentMapping.toColorsState(updates.colors);
      for (const [stateId, stateValue] of colorsStates) {
        states.set(stateId, stateValue);
      }
      hasUpdates = true;
    }

    // Only send update if there are changes
    if (hasUpdates) {
      client.authenticatedUser = updatedUserData;
      const asArray = Array.from(states.entries());
      this.deltaNetServer.overrideUserStates(client.deltaNetConnection, clientId, asArray);
    }
  }

  private internalUpdateUser(clientId: number, userData: UserData): void {
    const client = this.authenticatedClientsById.get(clientId);
    if (!client) {
      throw new Error(`internalUpdateUser - client not found for clientId ${clientId}`);
    }
    this.logger.info("internalUpdateUser", clientId, userData);

    this.updatedUserProfilesInTick.add(clientId);

    client.authenticatedUser = {
      ...client.authenticatedUser,
      ...userData,
    };

    // Update deltanet states
    const states = DeltaNetComponentMapping.toStates(userData);

    const asArray = Array.from(states.entries());
    this.deltaNetServer.overrideUserStates(client.deltaNetConnection, clientId, asArray);
  }

  public dispose(clientCloseError?: UserNetworkingServerError): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
    }

    let errorMessage: Uint8Array | null = null;
    if (clientCloseError) {
      errorMessage = encodeError({
        type: "error",
        errorType: clientCloseError.errorType,
        message: clientCloseError.message,
        retryable: clientCloseError.retryable,
      }).getBuffer();
    }

    // Close all client connections
    for (const [, client] of this.authenticatedClientsById) {
      if (errorMessage) {
        client.socket.send(errorMessage);
      }
      client.socket.close();
    }

    this.authenticatedClientsById.clear();
  }
}
