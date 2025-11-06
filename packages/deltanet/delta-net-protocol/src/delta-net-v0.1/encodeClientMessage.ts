import { BufferWriter } from "../BufferWriter";

import {
  DeltaNetV01ClientMessage,
  encodeConnectUser,
  encodePong,
  encodeSetUserComponents,
  encodeClientCustom,
} from "./messages";

export function encodeClientMessage(message: DeltaNetV01ClientMessage, writer: BufferWriter) {
  const type = message.type;
  switch (type) {
    case "connectUser":
      return encodeConnectUser(message, writer);
    case "setUserComponents":
      return encodeSetUserComponents(message, writer);
    case "pong":
      return encodePong(message, writer);
    case "clientCustom":
      return encodeClientCustom(message, writer);
    default:
      throw new Error(`Unknown message type: ${type}`);
  }
}
