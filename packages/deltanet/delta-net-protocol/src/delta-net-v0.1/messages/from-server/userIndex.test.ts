import { BufferReader } from "../../../BufferReader";
import { BufferWriter } from "../../../BufferWriter";
import { UserIndexMessageType } from "../../messageTypes";

import { decodeUserIndex, DeltaNetV01UserIndexMessage, encodeUserIndex } from "./userIndex";

const cases: Array<[string, DeltaNetV01UserIndexMessage, Array<number>]> = [
  [
    "userIndex message",
    {
      type: "userIndex",
      index: 123,
    },
    [3, 123],
  ],
  [
    "userIndex message with large userIndex",
    {
      type: "userIndex",
      index: 1234567890,
    },
    [3, 210, 133, 216, 204, 4],
  ],
];

describe("encode/decode userIndex", () => {
  test.each(cases)("%p", (name, message, expectedResult) => {
    const writer = new BufferWriter(16);
    encodeUserIndex(message, writer);
    const encoded = writer.getBuffer();
    expect(Array.from(encoded)).toEqual(expectedResult);
    const reader = new BufferReader(encoded);
    expect(reader.readUInt8()).toEqual(UserIndexMessageType);
    const decoded = decodeUserIndex(reader);
    expect(decoded).toEqual(message);
  });
});
