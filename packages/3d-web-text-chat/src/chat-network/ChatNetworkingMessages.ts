export const IDENTITY_MESSAGE_TYPE = "identity";
export const USER_AUTHENTICATE_MESSAGE_TYPE = "user_auth";
export const CONNECTED_MESSAGE_TYPE = "connected";
export const DISCONNECTED_MESSAGE_TYPE = "disconnected";
export const PING_MESSAGE_TYPE = "ping";
export const PONG_MESSAGE_TYPE = "pong";
export const CHAT_MESSAGE_TYPE = "chat";

export type IdentityMessage = {
  type: typeof IDENTITY_MESSAGE_TYPE;
  id: number;
};

export type ConnectedMessage = {
  type: typeof CONNECTED_MESSAGE_TYPE;
  id: number;
};

export type DisconnectedMessage = {
  type: typeof DISCONNECTED_MESSAGE_TYPE;
  id: number;
};

export type FromServerPingMessage = {
  type: typeof PING_MESSAGE_TYPE;
};

export type FromServerChatMessage = {
  type: typeof CHAT_MESSAGE_TYPE;
  id: number;
  text: string;
};

export type FromServerMessage =
  | IdentityMessage
  | ConnectedMessage
  | DisconnectedMessage
  | FromServerPingMessage
  | FromServerChatMessage;

export type FromClientPongMessage = {
  type: typeof PONG_MESSAGE_TYPE;
};

export type FromClientAuthenticateMessage = {
  type: typeof USER_AUTHENTICATE_MESSAGE_TYPE;
  sessionToken: string;
};

export type FromClientChatMessage = {
  type: typeof CHAT_MESSAGE_TYPE;
  text: string;
};

export type FromClientMessage =
  | FromClientPongMessage
  | FromClientAuthenticateMessage
  | FromClientChatMessage;
