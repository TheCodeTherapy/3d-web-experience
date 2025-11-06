import { BufferReader } from "../../../BufferReader";
import { BufferWriter } from "../../../BufferWriter";
import { ClientCustomMessageType } from "../../messageTypes";

export type DeltaNetV01ClientCustomMessage = {
  type: "clientCustom";
  customType: number;
  contents: string;
};

export function encodeClientCustom(
  msg: DeltaNetV01ClientCustomMessage,
  writer: BufferWriter = new BufferWriter(64),
): BufferWriter {
  writer.writeUint8(ClientCustomMessageType);
  writer.writeUVarint(msg.customType);
  writer.writeLengthPrefixedString(msg.contents);
  return writer;
}

// Assumes that the first byte has already been read (the message type)
export function decodeClientCustom(buffer: BufferReader): DeltaNetV01ClientCustomMessage {
  const customType = buffer.readUVarint();
  const contents = buffer.readUVarintPrefixedString();
  return {
    type: "clientCustom",
    customType,
    contents,
  };
}
