import { BufferReader } from "../../../BufferReader";
import { BufferWriter } from "../../../BufferWriter";
import { WarningMessageType } from "../../messageTypes";

export type DeltaNetV01WarningMessage = {
  type: "warning";
  message: string;
};

export function encodeWarning(
  msg: DeltaNetV01WarningMessage,
  writer: BufferWriter = new BufferWriter(64),
): BufferWriter {
  writer.writeUint8(WarningMessageType);
  writer.writeLengthPrefixedString(msg.message);
  return writer;
}

// Assumes that the first byte has already been read (the message type)
export function decodeWarning(buffer: BufferReader): DeltaNetV01WarningMessage {
  const message = buffer.readUVarintPrefixedString();
  return {
    type: "warning",
    message,
  };
}
