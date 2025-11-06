import { BufferReader } from "../../../BufferReader";
import { BufferWriter } from "../../../BufferWriter";
import { SetUserComponentsMessageType } from "../../messageTypes";

/**
 * Message sent by client to update component and state values.
 * Used to send user input and state changes to the server.
 */
export type DeltaNetV01SetUserComponentsMessage = {
  /** Message type identifier */
  type: "setUserComponents";
  /** Array of [componentId, value] pairs for updated component values */
  components: Array<[number, bigint]>;
  /** Array of [stateId, value] pairs for updated state values */
  states: Array<[number, Uint8Array]>;
};

/**
 * Encodes a set user components message into a binary buffer.
 * @param message - The message to encode
 * @param writer - The BufferWriter to write to
 */
export function encodeSetUserComponents(
  message: DeltaNetV01SetUserComponentsMessage,
  writer: BufferWriter,
) {
  writer.writeUint8(SetUserComponentsMessageType);
  writer.writeUVarint(message.components.length);
  for (const [componentId, componentValue] of message.components) {
    writer.writeUVarint(componentId);
    writer.writeBigIntVarint(componentValue);
  }
  writer.writeUVarint(message.states.length);
  for (const [stateId, stateValue] of message.states) {
    writer.writeUVarint(stateId);
    writer.writeUVarintLengthPrefixedBytes(stateValue);
  }
}

/**
 * Decodes a set user components message from a binary buffer.
 * Assumes that the first byte (message type) has already been read.
 * @param buffer - The BufferReader containing the message data
 * @returns The decoded set user components message
 */
export function decodeSetUserComponents(buffer: BufferReader): DeltaNetV01SetUserComponentsMessage {
  const componentsLength = buffer.readUVarint();
  const components: Array<[number, bigint]> = [];
  for (let i = 0; i < componentsLength; i++) {
    const componentId = buffer.readUVarint();
    const componentValue = buffer.readBigIntVarint();
    components.push([componentId, componentValue]);
  }
  const statesLength = buffer.readUVarint();
  const states: Array<[number, Uint8Array]> = [];
  for (let i = 0; i < statesLength; i++) {
    const stateId = buffer.readUVarint();
    const stateValue = buffer.readUVarintPrefixedBytes();
    states.push([stateId, stateValue]);
  }
  return {
    type: "setUserComponents",
    components,
    states,
  };
}
