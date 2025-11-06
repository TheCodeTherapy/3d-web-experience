import { DeltaNetV01ServerMessage, DeltaNetV01Tick } from "@mml-io/delta-net-protocol";

/**
 * Generates test data for DeltaNet protocol benchmarks.
 * Creates realistic tick messages with component deltas and state updates.
 *
 * @param size - Number of messages to generate
 * @returns Array of DeltaNetV01ServerMessage (specifically tick messages)
 */
export function prepareData(size: number, jsonCompatible = false): Array<DeltaNetV01ServerMessage> {
  const data: Array<DeltaNetV01Tick> = [];
  for (let i = 0; i < size; i++) {
    data.push({
      type: "tick",
      serverTime: 123 + i, // Incremental server time
      removedIndices: [1, 2, 3],
      indicesCount: 3,
      componentDeltaDeltas: [
        {
          componentId: 123,
          deltaDeltas: jsonCompatible
            ? ([1, 2, 3] as unknown as BigInt64Array)
            : new BigInt64Array([1n, 2n, 3n]),
        },
        {
          componentId: 456,
          deltaDeltas: jsonCompatible
            ? ([4, 5, 6] as unknown as BigInt64Array)
            : new BigInt64Array([4n, 5n, 6n]),
        },
      ],
      states: [
        {
          stateId: 1,
          updatedStates: [
            [0, jsonCompatible ? ([1, 2, 3] as unknown as Uint8Array) : new Uint8Array([1, 2, 3])],
            [1, jsonCompatible ? ([4, 5, 6] as unknown as Uint8Array) : new Uint8Array([4, 5, 6])],
          ],
        },
        {
          stateId: 2,
          updatedStates: [
            [0, jsonCompatible ? ([1, 2, 3] as unknown as Uint8Array) : new Uint8Array([7, 8, 9])],
            [
              1,
              jsonCompatible ? ([4, 5, 6] as unknown as Uint8Array) : new Uint8Array([10, 11, 12]),
            ],
          ],
        },
      ],
    } satisfies DeltaNetV01Tick);
  }
  return data;
}
