import { BufferReader } from "../../../BufferReader";
import { BufferWriter } from "../../../BufferWriter";
import { ConnectUserMessageType } from "../../messageTypes";

/**
 * Initial connection request message from client to server.
 * Contains authentication token and initial state of the connecting user.
 */
export type DeltaNetV01ConnectUserMessage = {
  /** Message type identifier */
  type: "connectUser";
  /** Authentication token for the user */
  token: string;
  /** Whether the client is an observer-only client */
  observer: boolean;
  /** Array of [componentId, value] pairs for the user's initial component values */
  components: Array<[number, bigint]>;
  /** Array of [stateId, value] pairs for the user's initial state values */
  states: Array<[number, Uint8Array]>;
};

/**
 * Encodes a connect user message into a binary buffer.
 * @param connectUserMessage - The message to encode
 * @param writer - The BufferWriter to write to
 */
export function encodeConnectUser(
  connectUserMessage: DeltaNetV01ConnectUserMessage,
  writer: BufferWriter,
) {
  writer.writeUint8(ConnectUserMessageType);
  writer.writeLengthPrefixedString(connectUserMessage.token);
  writer.writeBoolean(connectUserMessage.observer ?? false);
  writer.writeUVarint(connectUserMessage.components.length);
  for (const [componentId, componentValue] of connectUserMessage.components) {
    writer.writeUVarint(componentId);
    writer.writeBigIntVarint(componentValue);
  }
  writer.writeUVarint(connectUserMessage.states.length);
  for (const [stateId, stateValue] of connectUserMessage.states) {
    writer.writeUVarint(stateId);
    writer.writeUVarintLengthPrefixedBytes(stateValue);
  }
}

/**
 * Decodes a connect user message from a binary buffer.
 * Assumes that the first byte (message type) has already been read.
 * @param buffer - The BufferReader containing the message data
 * @returns The decoded connect user message
 */
export function decodeConnectUser(buffer: BufferReader): DeltaNetV01ConnectUserMessage {
  const token = buffer.readUVarintPrefixedString();
  const observer = buffer.readBoolean();
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
    type: "connectUser",
    token,
    observer,
    components,
    states,
  };
}
