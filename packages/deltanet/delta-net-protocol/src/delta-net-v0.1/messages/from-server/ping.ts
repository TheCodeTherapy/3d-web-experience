import { BufferReader } from "../../../BufferReader";
import { BufferWriter } from "../../../BufferWriter";
import { PingMessageType } from "../../messageTypes";

export type DeltaNetV01PingMessage = {
  type: "ping";
  ping: number;
};

export function encodePing(
  pingMessage: DeltaNetV01PingMessage,
  writer: BufferWriter = new BufferWriter(8),
): BufferWriter {
  writer.writeUint8(PingMessageType);
  writer.writeUVarint(pingMessage.ping);
  return writer;
}

// Assumes that the first byte has already been read (the message type)
export function decodePing(buffer: BufferReader): DeltaNetV01PingMessage {
  const ping = buffer.readUVarint();
  return {
    type: "ping",
    ping,
  };
}
