import { BufferReader } from "../../../BufferReader";
import { BufferWriter } from "../../../BufferWriter";
import { TickMessageType } from "../../messageTypes";

import { decodeTick, DeltaNetV01Tick, encodeTick } from "./tick";

const cases: Array<[string, DeltaNetV01Tick, Array<number>]> = [
  [
    "empty",
    {
      type: "tick",
      serverTime: 0,
      removedIndices: [],
      indicesCount: 0,
      componentDeltaDeltas: [],
      states: [],
    },
    [4, 0, 0, 0, 0, 0],
  ],
  [
    "with contents",
    {
      type: "tick",
      serverTime: 123,
      removedIndices: [1, 2, 3],
      indicesCount: 5,
      componentDeltaDeltas: [
        { componentId: 1, deltaDeltas: new BigInt64Array([1n, 2n, 3n, 4n, 5n]) },
        { componentId: 2, deltaDeltas: new BigInt64Array([4n, 5n, 6n, 7n, 8n]) },
        { componentId: 3, deltaDeltas: new BigInt64Array([7n, 8n, 9n, 10n, 11n]) },
      ],
      states: [
        {
          stateId: 1,
          updatedStates: [
            [1, new Uint8Array([118, 97, 108, 117, 101, 49])], // "value1"
            [2, new Uint8Array([118, 97, 108, 117, 101, 50])], // "value2"
          ],
        },
        {
          stateId: 2,
          updatedStates: [
            [3, new Uint8Array([118, 97, 108, 117, 101, 51])], // "value3"
            [4, new Uint8Array([118, 97, 108, 117, 101, 52])], // "value4"
          ],
        },
      ],
    },
    [
      4, 123, 3, 1, 2, 3, 5, 3, 1, 13, 120, 156, 99, 98, 97, 227, 224, 2, 0, 0, 75, 0, 31, 2, 13,
      120, 156, 227, 224, 226, 225, 19, 0, 0, 0, 165, 0, 61, 3, 13, 120, 156, 227, 19, 16, 18, 17,
      3, 0, 0, 255, 0, 91, 2, 1, 2, 10, 120, 156, 99, 98, 1, 0, 0, 10, 0, 7, 18, 120, 156, 99, 43,
      75, 204, 41, 77, 53, 100, 3, 83, 70, 0, 34, 21, 4, 170, 2, 2, 10, 120, 156, 99, 227, 0, 0, 0,
      22, 0, 15, 18, 120, 156, 99, 43, 75, 204, 41, 77, 53, 102, 3, 83, 38, 0, 34, 39, 4, 174,
    ],
  ],
];

describe("encode/decode tick", () => {
  test.each(cases)("%p", (name, message, expectedResult) => {
    const writer = new BufferWriter(16);
    encodeTick(message, writer);
    const encoded = writer.getBuffer();
    expect(Array.from(encoded)).toEqual(expectedResult);
    const reader = new BufferReader(encoded);
    expect(reader.readUInt8()).toEqual(TickMessageType);
    const decoded = decodeTick(reader);
    expect(decoded).toEqual(message);
  });
});
