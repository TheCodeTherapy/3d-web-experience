export const CONNECTED_MESSAGE_TYPE = "connected";
export const DISCONNECTED_MESSAGE_TYPE = "disconnected";
export const IDENTITY_MESSAGE_TYPE = "identity";
export const PING_MESSAGE_TYPE = "ping";
export const PONG_MESSAGE_TYPE = "pong";
export const CHAT_MESSAGE_TYPE = "chat";

export type ConnectedMessage = {
  type: typeof CONNECTED_MESSAGE_TYPE;
  id: number;
};

export type IdentityMessage = {
  type: typeof IDENTITY_MESSAGE_TYPE;
  id: number;
};

export type DisconnectedMessage = {
  type: typeof DISCONNECTED_MESSAGE_TYPE;
  id: number;
};

export type FromServerPingMessage = {
  type: typeof PING_MESSAGE_TYPE;
};

export type FromClientChatMessage = {
  type: typeof CHAT_MESSAGE_TYPE;
  id: number;
  text: string;
};

export type FromServerMessage =
  | ConnectedMessage
  | IdentityMessage
  | DisconnectedMessage
  | FromServerPingMessage
  | FromClientChatMessage;

export type FromClientPongMessage = {
  type: typeof PONG_MESSAGE_TYPE;
};

export type FromClientMessage = FromClientPongMessage | FromClientChatMessage;
