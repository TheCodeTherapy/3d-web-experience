import { BufferReader } from "../BufferReader";

import {
  decodeError,
  decodeInitialCheckout,
  decodePing,
  decodeServerCustom,
  decodeTick,
  decodeUserIndex,
  decodeWarning,
  DeltaNetV01ServerMessage,
} from "./messages";
import {
  ErrorMessageType,
  InitialCheckoutMessageType,
  PingMessageType,
  ServerCustomMessageType,
  TickMessageType,
  UserIndexMessageType,
  WarningMessageType,
} from "./messageTypes";

export type DecodeServerMessageOptions = {
  ignoreData?: boolean; // Used when the client doesn't want to process data, e.g., in bot mode
};

export function decodeServerMessages(
  buffer: BufferReader,
  opts?: DecodeServerMessageOptions,
): Array<DeltaNetV01ServerMessage> {
  const messages: DeltaNetV01ServerMessage[] = [];
  while (!buffer.isEnd()) {
    const messageType = buffer.readUInt8();
    switch (messageType) {
      case InitialCheckoutMessageType:
        messages.push(decodeInitialCheckout(buffer, opts));
        break;
      case UserIndexMessageType:
        messages.push(decodeUserIndex(buffer));
        break;
      case TickMessageType:
        messages.push(decodeTick(buffer, opts));
        break;
      case ServerCustomMessageType:
        messages.push(decodeServerCustom(buffer));
        break;
      case PingMessageType:
        messages.push(decodePing(buffer));
        break;
      case WarningMessageType:
        messages.push(decodeWarning(buffer));
        break;
      case ErrorMessageType:
        messages.push(decodeError(buffer));
        break;
      default:
        throw new Error(`Unknown message type: ${messageType}`);
    }
  }
  return messages;
}
