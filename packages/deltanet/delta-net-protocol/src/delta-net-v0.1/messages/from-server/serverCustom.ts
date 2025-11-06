import { BufferReader } from "../../../BufferReader";
import { BufferWriter } from "../../../BufferWriter";
import { ServerCustomMessageType } from "../../messageTypes";

export type DeltaNetV01ServerCustomMessage = {
  type: "serverCustom";
  customType: number;
  contents: string;
};

export function encodeServerCustom(
  msg: DeltaNetV01ServerCustomMessage,
  writer: BufferWriter = new BufferWriter(64),
): BufferWriter {
  writer.writeUint8(ServerCustomMessageType);
  writer.writeUVarint(msg.customType);
  writer.writeLengthPrefixedString(msg.contents);
  return writer;
}

// Assumes that the first byte has already been read (the message type)
export function decodeServerCustom(buffer: BufferReader): DeltaNetV01ServerCustomMessage {
  const customType = buffer.readUVarint();
  const contents = buffer.readUVarintPrefixedString();
  return {
    type: "serverCustom",
    customType,
    contents,
  };
}
