import { BufferReader } from "../../../BufferReader";
import { BufferWriter } from "../../../BufferWriter";
import { PongMessageType } from "../../messageTypes";

import { decodePong, DeltaNetV01PongMessage, encodePong } from "./pong";

const cases: Array<[string, DeltaNetV01PongMessage, Array<number>]> = [
  [
    "pong message",
    {
      type: "pong",
      pong: 123,
    },
    [68, 123],
  ],
  [
    "pong message with large pong",
    {
      type: "pong",
      pong: 1234567890,
    },
    [68, 210, 133, 216, 204, 4],
  ],
];

describe("encode/decode pong", () => {
  test.each(cases)("%p", (name, message, expectedResult) => {
    const writer = new BufferWriter(16);
    encodePong(message, writer);
    const encoded = writer.getBuffer();
    expect(Array.from(encoded)).toEqual(expectedResult);
    const reader = new BufferReader(encoded);
    expect(reader.readUInt8()).toEqual(PongMessageType);
    const decoded = decodePong(reader);
    expect(decoded).toEqual(message);
  });
});
