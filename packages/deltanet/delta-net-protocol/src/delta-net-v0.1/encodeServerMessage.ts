import { BufferWriter } from "../BufferWriter";

import {
  DeltaNetV01ServerMessage,
  encodeInitialCheckout,
  encodeServerCustom,
  encodeUserIndex,
} from "./messages";
import { encodeError } from "./messages/from-server/error";
import { encodePing } from "./messages/from-server/ping";
import { encodeTick } from "./messages/from-server/tick";
import { encodeWarning } from "./messages/from-server/warning";

export function encodeServerMessage(
  message: DeltaNetV01ServerMessage,
  writer?: BufferWriter,
): BufferWriter {
  switch (message.type) {
    case "initialCheckout":
      return encodeInitialCheckout(message, writer);
    case "tick":
      return encodeTick(message, writer);
    case "userIndex":
      return encodeUserIndex(message, writer);
    case "ping":
      return encodePing(message, writer);
    case "serverCustom":
      return encodeServerCustom(message, writer);
    case "warning":
      return encodeWarning(message, writer);
    case "error":
      return encodeError(message, writer);
    default:
      throw new Error(`Unknown message type: ${(message as any).type}`);
  }
}
