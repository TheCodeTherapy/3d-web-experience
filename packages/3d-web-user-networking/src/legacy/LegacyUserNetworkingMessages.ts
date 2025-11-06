export const LEGACY_USER_NETWORKING_DISCONNECTED_MESSAGE_TYPE = "disconnected";
export const LEGACY_USER_NETWORKING_IDENTITY_MESSAGE_TYPE = "identity";
export const LEGACY_USER_NETWORKING_USER_AUTHENTICATE_MESSAGE_TYPE = "user_auth";
export const LEGACY_USER_NETWORKING_USER_PROFILE_MESSAGE_TYPE = "user_profile";
export const LEGACY_USER_NETWORKING_USER_UPDATE_MESSAGE_TYPE = "user_update";
export const LEGACY_USER_NETWORKING_SERVER_BROADCAST_MESSAGE_TYPE = "broadcast";
export const LEGACY_USER_NETWORKING_SERVER_ERROR_MESSAGE_TYPE = "error";
export const LEGACY_USER_NETWORKING_PING_MESSAGE_TYPE = "ping";
export const LEGACY_USER_NETWORKING_PONG_MESSAGE_TYPE = "pong";

export type LegacyUserNetworkingIdentityMessage = {
  type: typeof LEGACY_USER_NETWORKING_IDENTITY_MESSAGE_TYPE;
  id: number;
};

export type LegacyCharacterDescription =
  | {
      meshFileUrl: string;
      mmlCharacterString?: null;
      mmlCharacterUrl?: null;
    }
  | {
      meshFileUrl?: null;
      mmlCharacterString: string;
      mmlCharacterUrl?: null;
    }
  | {
      meshFileUrl?: null;
      mmlCharacterString?: null;
      mmlCharacterUrl: string;
    };

export type LegacyUserData = {
  readonly username: string;
  readonly characterDescription: LegacyCharacterDescription;
};

export type LegacyUserNetworkingProfileMessage = {
  type: typeof LEGACY_USER_NETWORKING_USER_PROFILE_MESSAGE_TYPE;
  id: number;
  username: string;
  characterDescription: LegacyCharacterDescription;
};

export type LegacyUserNetworkingDisconnectedMessage = {
  type: typeof LEGACY_USER_NETWORKING_DISCONNECTED_MESSAGE_TYPE;
  id: number;
};

export const LEGACY_USER_NETWORKING_CONNECTION_LIMIT_REACHED_ERROR_TYPE =
  "CONNECTION_LIMIT_REACHED";
export const LEGACY_USER_NETWORKING_AUTHENTICATION_FAILED_ERROR_TYPE = "AUTHENTICATION_FAILED";
export const LEGACY_USER_NETWORKING_SERVER_SHUTDOWN_ERROR_TYPE = "SERVER_SHUTDOWN";
export const LEGACY_USER_NETWORKING_UNKNOWN_ERROR = "UNKNOWN_ERROR";

export type LegacyUserNetworkingServerErrorType =
  | typeof LEGACY_USER_NETWORKING_CONNECTION_LIMIT_REACHED_ERROR_TYPE
  | typeof LEGACY_USER_NETWORKING_AUTHENTICATION_FAILED_ERROR_TYPE
  | typeof LEGACY_USER_NETWORKING_SERVER_SHUTDOWN_ERROR_TYPE
  | typeof LEGACY_USER_NETWORKING_UNKNOWN_ERROR;

export type LegacyUserNetworkingServerError = {
  type: typeof LEGACY_USER_NETWORKING_SERVER_ERROR_MESSAGE_TYPE;
  errorType: LegacyUserNetworkingServerErrorType;
  message: string;
};

export type LegacyUserNetworkingServerBroadcast = {
  type: typeof LEGACY_USER_NETWORKING_SERVER_BROADCAST_MESSAGE_TYPE;
  broadcastType: string;
  payload: any;
};

export type LegacyUserNetworkingServerPingMessage = {
  type: typeof LEGACY_USER_NETWORKING_PING_MESSAGE_TYPE;
};

export type LegacyFromUserNetworkingServerMessage =
  | LegacyUserNetworkingIdentityMessage
  | LegacyUserNetworkingProfileMessage
  | LegacyUserNetworkingDisconnectedMessage
  | LegacyUserNetworkingServerPingMessage
  | LegacyUserNetworkingServerBroadcast
  | LegacyUserNetworkingServerError;

export type LegacyUserNetworkingClientPongMessage = {
  type: typeof LEGACY_USER_NETWORKING_PONG_MESSAGE_TYPE;
};

export type LegacyUserIdentity = {
  characterDescription: LegacyCharacterDescription | null;
  username: string | null;
};

export type LegacyUserNetworkingAuthenticateMessage = {
  type: typeof LEGACY_USER_NETWORKING_USER_AUTHENTICATE_MESSAGE_TYPE;
  sessionToken: string;
  // The client can send a LegacyUserIdentity to use as the initial user profile and the server can choose to accept it or not
  userIdentity?: LegacyUserIdentity;
};

export type LegacyUserNetworkingUserUpdateMessage = {
  type: typeof LEGACY_USER_NETWORKING_USER_UPDATE_MESSAGE_TYPE;
  userIdentity: LegacyUserIdentity;
};

export type LegacyFromUserNetworkingClientMessage =
  | LegacyUserNetworkingClientPongMessage
  | LegacyUserNetworkingAuthenticateMessage
  | LegacyUserNetworkingUserUpdateMessage;
