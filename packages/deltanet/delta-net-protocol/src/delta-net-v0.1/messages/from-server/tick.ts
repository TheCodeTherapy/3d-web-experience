import { BufferReader } from "../../../BufferReader";
import { BufferWriter } from "../../../BufferWriter";
import { DeflateCompressor } from "../../../DeflateCompressor";
import { DecodeServerMessageOptions } from "../../decodeServerMessages";
import { TickMessageType } from "../../messageTypes";

/**
 * Represents state updates in a tick message.
 * States are not updated every tick, so they are specified as indices that have changed and their new values.
 */
export type DeltaNetV01StateUpdates = {
  /** Unique identifier for the state */
  stateId: number;
  /** Array of [index, value] pairs for updated states */
  updatedStates: Array<[number, Uint8Array]>; //index to state
};

/**
 * Represents component updates in a tick message.
 * Uses second-order delta compression (deltas of deltas) for efficient updates.
 */
export type DeltaNetV01ComponentTick = {
  /** Unique identifier for the component */
  componentId: number;
  /** The second-order delta values (deltas of deltas) from the previous tick */
  deltaDeltas: BigInt64Array;
};

/**
 * Regular state update message sent at configurable intervals (typically 5-20Hz).
 * Contains updates to components and states, as well as information about user indices.
 */
export type DeltaNetV01Tick = {
  /** Message type identifier */
  type: "tick";
  /** Current server time */
  serverTime: number;
  /** Indices of users that have been removed since the last tick */
  removedIndices: Array<number>;
  /** Current number of user indices in the system */
  indicesCount: number;
  /** Array of component updates using second-order delta compression */
  componentDeltaDeltas: Array<DeltaNetV01ComponentTick>;
  /** Array of state updates */
  states: Array<DeltaNetV01StateUpdates>;
};

/**
 * Encodes a tick message into a binary buffer.
 * @param msg - The message to encode
 * @param writer - Optional BufferWriter instance to use (creates a new one if not provided)
 * @returns The BufferWriter containing the encoded message
 */
export function encodeTick(
  msg: DeltaNetV01Tick,
  writer: BufferWriter = new BufferWriter(64),
): BufferWriter {
  writer.writeUint8(TickMessageType);

  writer.writeUVarint(msg.serverTime);

  writer.writeUVarint(msg.removedIndices.length);
  for (const index of msg.removedIndices) {
    writer.writeUVarint(index);
  }
  writer.writeUVarint(msg.indicesCount);
  writer.writeUVarint(msg.componentDeltaDeltas.length);
  for (const componentTick of msg.componentDeltaDeltas) {
    writer.writeUVarint(componentTick.componentId);
    const [, deltaDeltasBytes] = DeflateCompressor.varIntCompress(
      componentTick.deltaDeltas,
      msg.indicesCount,
    );
    writer.writeUVarintLengthPrefixedBytes(deltaDeltasBytes);
  }
  writer.writeUVarint(msg.states.length);
  for (const state of msg.states) {
    writer.writeUVarint(state.stateId);
    writer.writeUVarint(state.updatedStates.length);

    // Separate indices and values for compression
    const indices = new BigInt64Array(state.updatedStates.length);
    const values = new Array<Uint8Array>(state.updatedStates.length);

    for (let i = 0; i < state.updatedStates.length; i++) {
      const [index, value] = state.updatedStates[i];
      indices[i] = BigInt(index);
      values[i] = value;
    }

    // Compress and write indices
    const [, compressedIndices] = DeflateCompressor.varIntCompress(indices, indices.length);
    writer.writeUVarintLengthPrefixedBytes(compressedIndices);

    // Compress and write values
    const [, compressedValues] = DeflateCompressor.varIntBytesCompress(values, values.length);
    writer.writeUVarintLengthPrefixedBytes(compressedValues);
  }
  return writer;
}

export const lastTickDebugData: {
  componentsByteLength: number;
  statesByteLength: number;
} = {
  componentsByteLength: 0,
  statesByteLength: 0,
};

/**
 * Decodes a tick message from a binary buffer.
 * Assumes that the first byte (message type) has already been read.
 * @param buffer - The BufferReader containing the message data
 * @param opts - Optional options for decoding, such as ignoring data
 * @returns The decoded tick message
 */
export function decodeTick(
  buffer: BufferReader,
  opts?: DecodeServerMessageOptions,
): DeltaNetV01Tick {
  let componentsByteLength = 0;
  let statesByteLength = 0;

  const serverTime = buffer.readUVarint();
  const removedIndicesLength = buffer.readUVarint();
  const removedIndices: Array<number> = [];
  for (let i = 0; i < removedIndicesLength; i++) {
    removedIndices.push(buffer.readUVarint());
  }
  const indicesCount = buffer.readUVarint();
  const componentsLength = buffer.readUVarint();
  const components: Array<DeltaNetV01ComponentTick> = [];
  for (let i = 0; i < componentsLength; i++) {
    const componentId = buffer.readUVarint();
    const deltaDeltaBytes = buffer.readUVarintPrefixedBytes();
    componentsByteLength += deltaDeltaBytes.byteLength;
    if (opts?.ignoreData) {
      components.push({ componentId, deltaDeltas: new BigInt64Array(indicesCount) });
    } else {
      const deltaDeltas = DeflateCompressor.varIntDecompress(deltaDeltaBytes, indicesCount);
      components.push({ componentId, deltaDeltas });
    }
  }
  const statesLength = buffer.readUVarint();
  const states: Array<DeltaNetV01StateUpdates> = [];
  for (let i = 0; i < statesLength; i++) {
    const stateId = buffer.readUVarint();
    const stateCount = buffer.readUVarint();
    const state: DeltaNetV01StateUpdates = {
      stateId,
      updatedStates: [],
    };

    const compressedIndices = buffer.readUVarintPrefixedBytes();
    const compressedValues = buffer.readUVarintPrefixedBytes();
    statesByteLength += compressedIndices.byteLength;
    statesByteLength += compressedValues.byteLength;

    if (stateCount > 0) {
      // Read and decompress indices
      const indices = DeflateCompressor.varIntDecompress(compressedIndices, stateCount);
      const values = DeflateCompressor.varIntBytesDecompress(compressedValues, stateCount);

      // Recombine indices and values
      for (let j = 0; j < stateCount; j++) {
        const index = Number(indices[j]);
        const value = values[j];
        state.updatedStates.push([index, value]);
      }
    }

    states.push(state);
  }
  lastTickDebugData.componentsByteLength = componentsByteLength;
  lastTickDebugData.statesByteLength = statesByteLength;
  return {
    type: "tick",
    serverTime,
    removedIndices,
    indicesCount,
    componentDeltaDeltas: components,
    states,
  };
}
