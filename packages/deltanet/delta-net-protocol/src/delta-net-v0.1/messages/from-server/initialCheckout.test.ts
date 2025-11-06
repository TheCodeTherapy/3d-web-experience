import { BufferReader } from "../../../BufferReader";
import { BufferWriter } from "../../../BufferWriter";
import { InitialCheckoutMessageType } from "../../messageTypes";

import {
  decodeInitialCheckout,
  DeltaNetV01InitialCheckoutMessage,
  encodeInitialCheckout,
} from "./initialCheckout";

const cases: Array<[string, DeltaNetV01InitialCheckoutMessage, Array<number>]> = [
  [
    "basic",
    {
      type: "initialCheckout",
      serverTime: 0,
      indicesCount: 3,
      components: [
        {
          componentId: 1,
          values: new BigInt64Array([1n, 2n, 3n]),
          deltas: new BigInt64Array([11n, 22n, 33n]),
        },
        {
          componentId: 2,
          values: new BigInt64Array([4n, 5n, 6n]),
          deltas: new BigInt64Array([14n, 25n, 36n]),
        },
      ],
      states: [
        { stateId: 1, values: [new Uint8Array([7]), new Uint8Array([8]), new Uint8Array([9])] },
        { stateId: 2, values: [new Uint8Array([10]), new Uint8Array([11]), new Uint8Array([12])] },
      ],
    },
    [
      1, 0, 3, 2, 1, 11, 120, 156, 99, 98, 97, 3, 0, 0, 23, 0, 13, 11, 120, 156, 19, 211, 113, 2, 0,
      0, 223, 0, 133, 2, 11, 120, 156, 227, 224, 226, 1, 0, 0, 59, 0, 31, 11, 120, 156, 147, 49,
      242, 0, 0, 1, 3, 0, 151, 2, 1, 14, 120, 156, 99, 100, 103, 228, 96, 228, 4, 0, 0, 86, 0, 28,
      2, 14, 120, 156, 99, 228, 98, 228, 102, 228, 1, 0, 0, 113, 0, 37,
    ],
  ],
];

describe("encode/decode initialCheckout", () => {
  test.each(cases)("%p", (name, message, expectedResult) => {
    const writer = new BufferWriter(16);
    encodeInitialCheckout(message, writer);
    const encoded = writer.getBuffer();
    expect(Array.from(encoded)).toEqual(expectedResult);
    const reader = new BufferReader(encoded);
    expect(reader.readUInt8()).toEqual(InitialCheckoutMessageType);
    const decoded = decodeInitialCheckout(reader);
    expect(decoded).toEqual(message);
  });
});
