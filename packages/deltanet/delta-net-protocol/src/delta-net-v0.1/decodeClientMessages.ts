import { BufferReader } from "../BufferReader";

import { DeltaNetV01ClientMessage } from "./messages";
import { decodeClientCustom } from "./messages/from-client/clientCustom";
import { decodeConnectUser } from "./messages/from-client/connectUser";
import { decodePong } from "./messages/from-client/pong";
import { decodeSetUserComponents } from "./messages/from-client/setUserComponents";
import {
  ConnectUserMessageType,
  PongMessageType,
  SetUserComponentsMessageType,
  ClientCustomMessageType,
} from "./messageTypes";

export function decodeClientMessages(buffer: BufferReader): Array<DeltaNetV01ClientMessage> {
  const messages: DeltaNetV01ClientMessage[] = [];
  while (!buffer.isEnd()) {
    const messageType = buffer.readUInt8();
    switch (messageType) {
      case ConnectUserMessageType:
        messages.push(decodeConnectUser(buffer));
        break;
      case SetUserComponentsMessageType:
        messages.push(decodeSetUserComponents(buffer));
        break;
      case PongMessageType:
        messages.push(decodePong(buffer));
        break;
      case ClientCustomMessageType:
        messages.push(decodeClientCustom(buffer));
        break;
      default:
        throw new Error(`Unknown message type: ${messageType}`);
    }
  }
  return messages;
}
