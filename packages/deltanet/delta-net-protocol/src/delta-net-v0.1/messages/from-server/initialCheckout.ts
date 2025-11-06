import { BufferReader } from "../../../BufferReader";
import { BufferWriter } from "../../../BufferWriter";
import { DeflateCompressor } from "../../../DeflateCompressor";
import { DecodeServerMessageOptions } from "../../decodeServerMessages";
import { InitialCheckoutMessageType } from "../../messageTypes";

/**
 * Represents a component in the initial checkout message.
 * Contains both the initial values and the delta values that will be used for subsequent ticks.
 */
export type DeltaNetV01InitialCheckoutComponent = {
  /** Unique identifier for the component */
  componentId: number;
  /** The delta values from the tick this initial checkout is from which will be referred to in subsequent ticks */
  deltas: BigInt64Array;
  /** The initial values for all users */
  values: BigInt64Array;
};

export type DeltaNetV01InitialCheckoutState = {
  /** Unique identifier for the state */
  stateId: number;
  /** The initial values for all users */
  values: Array<Uint8Array>;
};

/**
 * Initial checkout message sent when a client first connects.
 * Contains the complete initial state of the game, including all components and states.
 */
export type DeltaNetV01InitialCheckoutMessage = {
  /** Message type identifier */
  type: "initialCheckout";
  /** Current server time */
  serverTime: number;
  /** Number of user indices in the system */
  indicesCount: number;
  /** Array of components with their initial values and deltas */
  components: Array<DeltaNetV01InitialCheckoutComponent>;
  /** Array of state values, each containing [stateId, stateValue] */
  states: Array<DeltaNetV01InitialCheckoutState>;
};

/**
 * Encodes an initial checkout message into a binary buffer.
 * @param msg - The message to encode
 * @param writer - Optional BufferWriter instance to use (creates a new one if not provided)
 * @returns The BufferWriter containing the encoded message
 */
export function encodeInitialCheckout(
  msg: DeltaNetV01InitialCheckoutMessage,
  writer: BufferWriter = new BufferWriter(64),
): BufferWriter {
  writer.writeUint8(InitialCheckoutMessageType);
  writer.writeUVarint(msg.serverTime);
  writer.writeUVarint(msg.indicesCount);
  writer.writeUVarint(msg.components.length);
  for (const { componentId, deltas, values } of msg.components) {
    writer.writeUVarint(componentId);
    const [, valuesBytes] = DeflateCompressor.varIntCompress(values, msg.indicesCount);
    writer.writeUVarintLengthPrefixedBytes(valuesBytes);
    const [, deltaBytes] = DeflateCompressor.varIntCompress(deltas, msg.indicesCount);
    writer.writeUVarintLengthPrefixedBytes(deltaBytes);
  }
  writer.writeUVarint(msg.states.length);
  for (const { stateId, values } of msg.states) {
    writer.writeUVarint(stateId);
    const [, stateBytes] = DeflateCompressor.varIntBytesCompress(values, msg.indicesCount);
    writer.writeUVarintLengthPrefixedBytes(stateBytes);
  }
  return writer;
}

export const lastInitialCheckoutDebugData: {
  componentsByteLength: number;
  statesByteLength: number;
} = {
  componentsByteLength: 0,
  statesByteLength: 0,
};

/**
 * Decodes an initial checkout message from a binary buffer.
 * Assumes that the first byte (message type) has already been read.
 * @param buffer - The BufferReader containing the message data
 * @param opts - Optional options for decoding, such as ignoring data
 * @returns The decoded initial checkout message
 */
export function decodeInitialCheckout(
  buffer: BufferReader,
  opts?: DecodeServerMessageOptions,
): DeltaNetV01InitialCheckoutMessage {
  let componentsByteLength = 0;
  let statesByteLength = 0;

  const serverTime = buffer.readUVarint();
  const indicesLength = buffer.readUVarint();
  const componentsLength = buffer.readUVarint();
  const components: Array<DeltaNetV01InitialCheckoutComponent> = [];
  for (let i = 0; i < componentsLength; i++) {
    const componentId = buffer.readUVarint();
    const valuesBytes = buffer.readUVarintPrefixedBytes();
    const values = DeflateCompressor.varIntDecompress(valuesBytes, indicesLength);
    const deltaBytes = buffer.readUVarintPrefixedBytes();
    componentsByteLength += valuesBytes.length + deltaBytes.length;
    if (opts?.ignoreData) {
      components.push({ componentId, deltas: new BigInt64Array(indicesLength), values });
    } else {
      const deltas = DeflateCompressor.varIntDecompress(deltaBytes, indicesLength);
      components.push({ componentId, deltas, values });
    }
  }
  const statesLength = buffer.readUVarint();
  const states: Array<DeltaNetV01InitialCheckoutState> = [];
  for (let i = 0; i < statesLength; i++) {
    const stateId = buffer.readUVarint();
    const valuesBytes = buffer.readUVarintPrefixedBytes();
    statesByteLength += valuesBytes.length;
    if (opts?.ignoreData) {
      const emptyValues = new Array<Uint8Array>(indicesLength).fill(new Uint8Array(0));
      states.push({ stateId, values: emptyValues });
    } else {
      const values = DeflateCompressor.varIntBytesDecompress(valuesBytes, indicesLength);
      states.push({ stateId, values });
    }
  }
  lastInitialCheckoutDebugData.componentsByteLength = componentsByteLength;
  lastInitialCheckoutDebugData.statesByteLength = statesByteLength;
  return {
    type: "initialCheckout",
    serverTime,
    indicesCount: indicesLength,
    components,
    states,
  };
}
