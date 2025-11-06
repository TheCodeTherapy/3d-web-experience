import {
  DeltaNetClientState,
  DeltaNetClientWebsocket,
  DeltaNetClientWebsocketInitialCheckout,
  DeltaNetClientWebsocketStatus,
  DeltaNetClientWebsocketTick,
  DeltaNetClientWebsocketUserIndex,
} from "@mml-io/delta-net-web";

import {
  DeltaNetComponentMapping,
  STATE_CHARACTER_DESCRIPTION,
  STATE_COLORS,
  STATE_INTERNAL_CONNECTION_ID,
  STATE_USERNAME,
} from "./DeltaNetComponentMapping";
import { UserNetworkingClientUpdate, WebsocketFactory, WebsocketStatus } from "./types";
import { UserData } from "./UserData";
import { UserNetworkingConsoleLogger, UserNetworkingLogger } from "./UserNetworkingLogger";
import { CharacterDescription } from "./UserNetworkingMessages";

export type UserNetworkingClientConfig = {
  url: string;
  sessionToken: string;
  websocketFactory: WebsocketFactory;
  statusUpdateCallback: (status: WebsocketStatus) => void;
  assignedIdentity: (clientId: number) => void;
  onServerError: (error: { message: string; errorType: string }) => void;
  onCustomMessage?: (customType: number, contents: string) => void;
  onUpdate(update: NetworkUpdate): void;
};

export type AddedUser = {
  userState: UserData;
  components: UserNetworkingClientUpdate;
};

export type UpdatedUser = {
  userState?: Partial<UserData>;
  components: UserNetworkingClientUpdate;
};

export type NetworkUpdate = {
  removedUserIds: Set<number>;
  addedUserIds: Map<number, AddedUser>;
  updatedUsers: Map<number, UpdatedUser>;
};

export class UserNetworkingClient {
  private deltaNetClient: DeltaNetClientWebsocket;
  private deltaNetState: DeltaNetClientState;

  private userId: number | null = null;
  private userIndex: number | null = null;
  private userState: UserData = {
    username: null,
    characterDescription: null,
    colors: null,
  };

  private stableIdToUserId: Map<number, number> = new Map();
  private userProfiles: Map<number, UserData> = new Map();
  private isAuthenticated = false;
  private pendingUpdate: UserNetworkingClientUpdate;

  constructor(
    private config: UserNetworkingClientConfig,
    initialUserState?: UserData,
    initialUpdate?: UserNetworkingClientUpdate,
    private logger: UserNetworkingLogger = new UserNetworkingConsoleLogger(),
  ) {
    this.pendingUpdate = initialUpdate ?? {
      position: { x: 0, y: 0, z: 0 },
      rotation: { quaternionY: 0, quaternionW: 1 },
      state: 0,
    };
    this.userState = initialUserState ?? {
      username: null,
      characterDescription: null,
      colors: null,
    };
    this.deltaNetState = new DeltaNetClientState();

    // Create deltanet client
    this.deltaNetClient = new DeltaNetClientWebsocket(
      config.url,
      (url: string) => {
        const ws = config.websocketFactory(url);
        return ws;
      },
      config.sessionToken,
      {
        ignoreData: false,
        onInitialCheckout: (initialCheckout: DeltaNetClientWebsocketInitialCheckout) => {
          const { addedStableIds } = this.deltaNetState.handleInitialCheckout(initialCheckout);

          // Process any state updates
          const networkUpdate = this.processNetworkUpdate([], addedStableIds, []);
          this.config.onUpdate(networkUpdate);

          // Now that we have the user IDs, resolve our stable user ID from the userIndex
          if (this.userIndex !== null) {
            const userIds = this.deltaNetState.getStableIds();
            if (this.userIndex < userIds.length) {
              const stableId = userIds[this.userIndex];
              const userId = this.stableIdToUserId.get(stableId);
              if (!userId) {
                throw new Error(`No userId found for stableId ${stableId}`);
              }
              this.userId = userId;
              this.isAuthenticated = true;
              this.config.assignedIdentity(this.userId);
            } else {
              this.logger.error(
                `Invalid userIndex ${this.userIndex}, userIds length: ${userIds.length}`,
              );
            }
          }
        },
        onTick: (tick: DeltaNetClientWebsocketTick) => {
          const { stateUpdates, removedStableIds, addedStableIds } =
            this.deltaNetState.handleTick(tick);
          // Process state updates
          const networkUpdate = this.processNetworkUpdate(
            removedStableIds,
            addedStableIds,
            stateUpdates,
          );
          this.config.onUpdate(networkUpdate);
        },
        onUserIndex: (userIndex: DeltaNetClientWebsocketUserIndex) => {
          // Store the userIndex and set it on deltanet state
          this.userIndex = userIndex.userIndex;
          this.deltaNetState.setLocalIndex(userIndex.userIndex);
        },
        onError: (errorType: string, errorMessage: string, retryable: boolean) => {
          this.logger.error(
            "DeltaNet error:",
            errorType,
            "errorMessage:",
            errorMessage,
            "retryable:",
            retryable,
          );
          this.config.onServerError({
            message: errorMessage,
            errorType: errorType,
          });
        },
        onWarning: (warning: string) => {
          this.logger.warn("DeltaNet warning:", warning);
        },
        onServerCustom: (customType: number, contents: string) => {
          // Handle server custom messages
          this.config.onCustomMessage?.(customType, contents);
        },
      },
      undefined, // timeCallback is optional
      (status: DeltaNetClientWebsocketStatus) => {
        // Map deltanet status to websocket status
        let mappedStatus: WebsocketStatus;
        switch (status) {
          case DeltaNetClientWebsocketStatus.Connected:
            mappedStatus = WebsocketStatus.Connected;
            break;
          case DeltaNetClientWebsocketStatus.ConnectionOpen:
            this.sendInitialAuthentication();
            mappedStatus = WebsocketStatus.Connected;
            // Send initial authentication data immediately upon connection
            break;
          case DeltaNetClientWebsocketStatus.Disconnected:
            mappedStatus = WebsocketStatus.Disconnected;
            this.reset();
            break;
          case DeltaNetClientWebsocketStatus.Reconnecting:
            mappedStatus = WebsocketStatus.Reconnecting;
            this.reset();
            break;
          default:
            mappedStatus = WebsocketStatus.Disconnected;
        }
        this.config.statusUpdateCallback(mappedStatus);
      },
    );
  }

  private reset(): void {
    this.deltaNetState.reset();
    this.userProfiles.clear();
    this.stableIdToUserId.clear();
    this.isAuthenticated = false;
    this.userId = null;
    this.userIndex = null;
  }

  private sendInitialAuthentication(): void {
    // Send initial components and states to become "ready"
    const components = DeltaNetComponentMapping.toComponents(this.pendingUpdate);

    // Create initial states for user data
    const states = DeltaNetComponentMapping.toStates(this.userState);

    // Send to deltanet - this makes the client "ready" and triggers authentication
    this.deltaNetClient.setUserComponents(components, states);
  }

  private processNetworkUpdate(
    removedStableIds: number[],
    addedStableIdsArray: number[],
    stateUpdates: Array<{ stableId: number; stateId: number; state: Uint8Array }>,
  ): NetworkUpdate {
    const addedUserIds = new Map<number, AddedUser>();
    const removedUserIds = new Set<number>();

    for (const stableId of removedStableIds) {
      const userId = this.stableIdToUserId.get(stableId);
      if (userId) {
        removedUserIds.add(userId);

        // Remove from user profiles
        this.userProfiles.delete(userId);

        // Remove from stableIdToUserId
        this.stableIdToUserId.delete(stableId);
      } else {
        throw new Error(`No userId found for stableId ${stableId}`);
      }
    }

    for (const stableId of addedStableIdsArray) {
      const stableUserData = this.deltaNetState.byStableId.get(stableId);
      if (!stableUserData) {
        throw new Error(`No stableUserData found for stableId ${stableId}`);
      }
      const userIdState = stableUserData.states.get(STATE_INTERNAL_CONNECTION_ID);
      if (!userIdState) {
        throw new Error(`No userIdState found for stableId ${stableId}`);
      }
      const userId = DeltaNetComponentMapping.userIdFromBytes(userIdState);
      if (!userId) {
        throw new Error(`Failed to extract userId from bytes for stableId ${stableId}`);
      }
      this.stableIdToUserId.set(stableId, userId);
      const newProfile = DeltaNetComponentMapping.fromStates(stableUserData.states, this.logger);
      this.userProfiles.set(userId, newProfile);
      const clientUpdate = DeltaNetComponentMapping.fromComponents(stableUserData.components);
      addedUserIds.set(userId, {
        userState: newProfile,
        components: clientUpdate,
      });
    }

    const updatedUsers = new Map<number, UpdatedUser>();

    for (const [stableUserId, userInfo] of this.deltaNetState.byStableId) {
      const userId = this.stableIdToUserId.get(stableUserId);
      if (!userId) {
        throw new Error(`No userId found for stableUserId ${stableUserId}`);
      }
      if (!addedUserIds.has(userId)) {
        if (userInfo.components.size > 0) {
          const clientUpdate = DeltaNetComponentMapping.fromComponents(userInfo.components);
          updatedUsers.set(userId, {
            components: clientUpdate,
          });
        }
      }
    }

    for (const update of stateUpdates) {
      // update.stableId is actually a stable user ID maintained by deltanet, not an index
      const stableUserId = update.stableId;

      const userId = this.stableIdToUserId.get(stableUserId);
      if (!userId) {
        throw new Error(`No userId found for stableUserId ${stableUserId}`);
      }

      if (addedUserIds.has(userId)) {
        continue;
      }

      const profile = this.userProfiles.get(userId);
      if (!profile) {
        this.logger.warn(`No profile found for user ${userId}, skipping update`);
        continue;
      }
      const existingUpdate = updatedUsers.get(userId)!;
      let existingUserStateUpdate: Partial<UserData> | undefined = existingUpdate.userState;
      if (!existingUserStateUpdate) {
        existingUserStateUpdate = {};
        existingUpdate.userState = existingUserStateUpdate;
      }

      switch (update.stateId) {
        case STATE_INTERNAL_CONNECTION_ID:
          this.logger.error(
            "STATE_INTERNAL_CONNECTION_ID is not expected to change in state updates",
          );
          break;
        case STATE_USERNAME:
          const username = DeltaNetComponentMapping.usernameFromBytes(update.state);
          if (username) {
            profile.username = username;
            existingUserStateUpdate.username = username;
          }
          break;
        case STATE_CHARACTER_DESCRIPTION:
          const characterDescription = DeltaNetComponentMapping.characterDescriptionFromBytes(
            update.state,
          );
          profile.characterDescription = characterDescription;
          existingUserStateUpdate.characterDescription = characterDescription;
          break;
        case STATE_COLORS:
          const colors = DeltaNetComponentMapping.decodeColors(update.state, this.logger);
          profile.colors = colors;
          existingUserStateUpdate.colors = colors;
          break;
        default:
          this.logger.warn(`Unknown state ID: ${update.stateId}`);
      }
    }

    return {
      removedUserIds,
      addedUserIds,
      updatedUsers,
    };
  }

  public sendUpdate(update: UserNetworkingClientUpdate): void {
    if (!this.isAuthenticated || this.userId === null) {
      // Store the update to send after authentication
      this.pendingUpdate = update;
      return;
    }

    // Convert to deltanet components and send
    const components = DeltaNetComponentMapping.toComponents(update);
    this.deltaNetClient.setUserComponents(components, new Map());
  }

  public sendCustomMessage(customType: number, contents: string): void {
    if (!this.isAuthenticated || this.userId === null) {
      this.logger.warn("Cannot send custom message before authentication");
      return;
    }

    this.deltaNetClient.sendCustomMessage(customType, contents);
  }

  public updateUsername(username: string): void {
    if (!this.isAuthenticated || this.userId === null) {
      return;
    }

    // Update local state
    this.userState.username = username;

    // Send state update
    const states = DeltaNetComponentMapping.toUsernameState(username);
    this.deltaNetClient.setUserComponents(new Map(), states);
  }

  public updateCharacterDescription(characterDescription: CharacterDescription): void {
    if (!this.isAuthenticated || this.userId === null) {
      return;
    }

    // Update local state
    this.userState.characterDescription = characterDescription;

    // Send state update
    const states = DeltaNetComponentMapping.toCharacterDescriptionState(characterDescription);
    this.deltaNetClient.setUserComponents(new Map(), states);
  }

  public updateColors(colors: Array<[number, number, number]>): void {
    if (!this.isAuthenticated || this.userId === null) {
      return;
    }

    // Update local state
    this.userState.colors = colors;

    // Send state update
    const states = DeltaNetComponentMapping.toColorsState(colors);
    this.deltaNetClient.setUserComponents(new Map(), states);
  }

  public stop(): void {
    this.deltaNetClient.stop();
    this.reset();
  }
}
