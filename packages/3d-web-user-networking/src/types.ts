export type WebsocketFactory = (url: string) => WebSocket;

export enum WebsocketStatus {
  Connecting,
  Connected,
  Reconnecting,
  Disconnected,
}

export type UserNetworkingClientUpdate = {
  position: { x: number; y: number; z: number };
  rotation: { quaternionY: number; quaternionW: number };
  state: number;
};
