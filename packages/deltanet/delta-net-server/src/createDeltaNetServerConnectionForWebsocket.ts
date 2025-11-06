import {
  deltaNetProtocolSubProtocol_v0_1,
  DeltaNetV01ServerMessage,
} from "@mml-io/delta-net-protocol";

import { DeltaNetServer } from "./DeltaNetServer";
import { DeltaNetV01Connection } from "./DeltaNetV01Connection";

// First to last in order of preference
export const SupportedWebsocketSubProtocolsPreferenceOrder = [
  deltaNetProtocolSubProtocol_v0_1,
] as const;

function IsRecognizedWebsocketSubProtocol(
  protocol: string,
): protocol is (typeof SupportedWebsocketSubProtocolsPreferenceOrder)[number] {
  return SupportedWebsocketSubProtocolsPreferenceOrder.includes(protocol as any);
}

export function createDeltaNetServerConnectionForWebsocket(
  webSocket: WebSocket,
  deltaNetServer: DeltaNetServer,
): DeltaNetV01Connection | null {
  if (!webSocket.protocol || !IsRecognizedWebsocketSubProtocol(webSocket.protocol)) {
    const errorMessageString = `Unsupported websocket subprotocol: ${webSocket.protocol}`;
    const errorMessage: Array<DeltaNetV01ServerMessage> = [
      {
        type: "error",
        errorType: "UNSUPPORTED_WEBSOCKET_SUBPROTOCOL",
        message: errorMessageString,
        retryable: false,
      },
    ];
    webSocket.send(JSON.stringify(errorMessage));
    webSocket.close();
    return null;
  }

  return new DeltaNetV01Connection(webSocket, deltaNetServer);
}
