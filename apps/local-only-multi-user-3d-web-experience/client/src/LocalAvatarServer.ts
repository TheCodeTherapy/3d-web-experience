import { CharacterState } from "@mml-io/3d-web-client-core";

export class LocalAvatarServer {
  private callbacks = new Map<
    number,
    (clientId: number, userNetworkingClientUpdate: null | CharacterState) => void
  >();

  send(clientId: number, userNetworkingClientUpdate: null | CharacterState) {
    this.callbacks.forEach((callback, callbackClientId) => {
      if (callbackClientId !== clientId) {
        callback(clientId, userNetworkingClientUpdate);
      }
    });
  }

  addClient(
    clientId: number,
    callback: (clientId: number, userNetworkingClientUpdate: null | CharacterState) => void,
  ) {
    this.callbacks.set(clientId, callback);
  }

  removeClient(clientId: number) {
    this.callbacks.delete(clientId);
  }
}
