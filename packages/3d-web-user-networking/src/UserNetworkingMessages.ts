export const DISCONNECTED_MESSAGE_TYPE = "disconnected";
export const IDENTITY_MESSAGE_TYPE = "identity";
export const USER_AUTHENTICATE_MESSAGE_TYPE = "user_auth";
export const USER_PROFILE_MESSAGE_TYPE = "user_profile";
export const USER_UPDATE_MESSAGE_TYPE = "user_update";
export const PING_MESSAGE_TYPE = "ping";
export const PONG_MESSAGE_TYPE = "pong";

export type IdentityMessage = {
  type: typeof IDENTITY_MESSAGE_TYPE;
  id: number;
};

export type CharacterDescription = {
  meshFileUrl?: string;
  mmlCharacterUrl?: string;
  mmlCharacterString?: string;
} & (
  | {
      meshFileUrl: string;
    }
  | {
      mmlCharacterUrl: string;
    }
  | {
      mmlCharacterString: string;
    }
);

export type UserProfileMessage = {
  type: typeof USER_PROFILE_MESSAGE_TYPE;
  id: number;
  username: string;
  characterDescription: CharacterDescription;
};

export type DisconnectedMessage = {
  type: typeof DISCONNECTED_MESSAGE_TYPE;
  id: number;
};

export type FromServerPingMessage = {
  type: typeof PING_MESSAGE_TYPE;
};

export type FromServerMessage =
  | IdentityMessage
  | UserProfileMessage
  | DisconnectedMessage
  | FromServerPingMessage;

export type FromClientPongMessage = {
  type: typeof PONG_MESSAGE_TYPE;
};

export type UserIdentity = {
  characterDescription: CharacterDescription | null;
  username: string | null;
};

export type UserAuthenticateMessage = {
  type: typeof USER_AUTHENTICATE_MESSAGE_TYPE;
  sessionToken: string;
  // The client can send a UserIdentity to use as the initial user profile and the server can choose to accept it or not
  userIdentity?: UserIdentity;
};

export type UserUpdateMessage = {
  type: typeof USER_UPDATE_MESSAGE_TYPE;
  userIdentity: UserIdentity;
};

export type FromClientMessage = FromClientPongMessage | UserAuthenticateMessage | UserUpdateMessage;
