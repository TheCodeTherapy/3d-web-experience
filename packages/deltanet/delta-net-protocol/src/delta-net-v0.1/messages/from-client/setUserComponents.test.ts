import { BufferReader } from "../../../BufferReader";
import { BufferWriter } from "../../../BufferWriter";
import { SetUserComponentsMessageType } from "../../messageTypes";

import {
  decodeSetUserComponents,
  DeltaNetV01SetUserComponentsMessage,
  encodeSetUserComponents,
} from "./setUserComponents";

const cases: Array<[string, DeltaNetV01SetUserComponentsMessage, Array<number>]> = [
  [
    "basic",
    {
      type: "setUserComponents",
      components: [
        [1, 111n],
        [2, 222n],
      ],
      states: [
        [1, new Uint8Array([115, 116, 97, 116, 101, 49])], // "state1"
        [2, new Uint8Array([115, 116, 97, 116, 101, 50])], // "state2"
      ],
    },
    [
      66, 2, 1, 222, 1, 2, 188, 3, 2, 1, 6, 115, 116, 97, 116, 101, 49, 2, 6, 115, 116, 97, 116,
      101, 50,
    ],
  ],
];

describe("encode/decode setUserComponents", () => {
  test.each(cases)("%p", (name, message, expectedResult) => {
    const writer = new BufferWriter(16);
    encodeSetUserComponents(message, writer);
    const encoded = writer.getBuffer();
    expect(Array.from(encoded)).toEqual(expectedResult);
    const reader = new BufferReader(encoded);
    expect(reader.readUInt8()).toEqual(SetUserComponentsMessageType);
    const decoded = decodeSetUserComponents(reader);
    expect(decoded).toEqual(message);
  });
});
