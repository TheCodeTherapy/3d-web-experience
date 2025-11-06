import { BufferReader } from "../../../BufferReader";
import { BufferWriter } from "../../../BufferWriter";
import { UserIndexMessageType } from "../../messageTypes";

export type DeltaNetV01UserIndexMessage = {
  type: "userIndex";
  index: number;
};

export function encodeUserIndex(
  msg: DeltaNetV01UserIndexMessage,
  writer: BufferWriter = new BufferWriter(64),
): BufferWriter {
  writer.writeUint8(UserIndexMessageType);
  writer.writeUVarint(msg.index);
  return writer;
}

// Assumes that the first byte has already been read (the message type)
export function decodeUserIndex(buffer: BufferReader): DeltaNetV01UserIndexMessage {
  const index = buffer.readUVarint();
  return {
    type: "userIndex",
    index,
  };
}
