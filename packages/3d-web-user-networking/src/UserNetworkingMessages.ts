export const USER_NETWORKING_DISCONNECTED_MESSAGE_TYPE = "disconnected";
export const USER_NETWORKING_IDENTITY_MESSAGE_TYPE = "identity";
export const USER_NETWORKING_USER_AUTHENTICATE_MESSAGE_TYPE = "user_auth";
export const USER_NETWORKING_USER_PROFILE_MESSAGE_TYPE = "user_profile";
export const USER_NETWORKING_USER_UPDATE_MESSAGE_TYPE = "user_update";
export const USER_NETWORKING_SERVER_BROADCAST_MESSAGE_TYPE = "broadcast";
export const USER_NETWORKING_SERVER_ERROR_MESSAGE_TYPE = "error";
export const USER_NETWORKING_PING_MESSAGE_TYPE = "ping";
export const USER_NETWORKING_PONG_MESSAGE_TYPE = "pong";

export type UserNetworkingIdentityMessage = {
  type: typeof USER_NETWORKING_IDENTITY_MESSAGE_TYPE;
  id: number;
};

export type CharacterDescription =
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

export type UserNetworkingProfileMessage = {
  type: typeof USER_NETWORKING_USER_PROFILE_MESSAGE_TYPE;
  id: number;
  username: string;
  characterDescription: CharacterDescription;
};

export type UserNetworkingDisconnectedMessage = {
  type: typeof USER_NETWORKING_DISCONNECTED_MESSAGE_TYPE;
  id: number;
};

export const USER_NETWORKING_CONNECTION_LIMIT_REACHED_ERROR_TYPE = "CONNECTION_LIMIT_REACHED";
export const USER_NETWORKING_AUTHENTICATION_FAILED_ERROR_TYPE = "AUTHENTICATION_FAILED";
export const USER_NETWORKING_SERVER_SHUTDOWN_ERROR_TYPE = "SERVER_SHUTDOWN";
export const USER_NETWORKING_UNKNOWN_ERROR = "UNKNOWN_ERROR";

export type UserNetworkingServerErrorType =
  | typeof USER_NETWORKING_CONNECTION_LIMIT_REACHED_ERROR_TYPE
  | typeof USER_NETWORKING_AUTHENTICATION_FAILED_ERROR_TYPE
  | typeof USER_NETWORKING_SERVER_SHUTDOWN_ERROR_TYPE
  | typeof USER_NETWORKING_UNKNOWN_ERROR;

export type UserNetworkingServerError = {
  type: typeof USER_NETWORKING_SERVER_ERROR_MESSAGE_TYPE;
  errorType: UserNetworkingServerErrorType;
  message: string;
};

export type UserNetworkingServerBroadcast = {
  type: typeof USER_NETWORKING_SERVER_BROADCAST_MESSAGE_TYPE;
  broadcastType: string;
  payload: any;
};

export type UserNetworkingServerPingMessage = {
  type: typeof USER_NETWORKING_PING_MESSAGE_TYPE;
};

export type FromUserNetworkingServerMessage =
  | UserNetworkingIdentityMessage
  | UserNetworkingProfileMessage
  | UserNetworkingDisconnectedMessage
  | UserNetworkingServerPingMessage
  | UserNetworkingServerBroadcast
  | UserNetworkingServerError;

export type UserNetworkingClientPongMessage = {
  type: typeof USER_NETWORKING_PONG_MESSAGE_TYPE;
};

export type UserIdentity = {
  characterDescription: CharacterDescription | null;
  username: string | null;
};

export type UserNetworkingAuthenticateMessage = {
  type: typeof USER_NETWORKING_USER_AUTHENTICATE_MESSAGE_TYPE;
  sessionToken: string;
  // The client can send a UserIdentity to use as the initial user profile and the server can choose to accept it or not
  userIdentity?: UserIdentity;
};

export type UserNetworkingUserUpdateMessage = {
  type: typeof USER_NETWORKING_USER_UPDATE_MESSAGE_TYPE;
  userIdentity: UserIdentity;
};

export type FromUserNetworkingClientMessage =
  | UserNetworkingClientPongMessage
  | UserNetworkingAuthenticateMessage
  | UserNetworkingUserUpdateMessage;
