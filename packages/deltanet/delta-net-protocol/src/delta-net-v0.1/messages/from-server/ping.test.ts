import { BufferReader } from "../../../BufferReader";
import { BufferWriter } from "../../../BufferWriter";
import { PingMessageType } from "../../messageTypes";

import { decodePing, DeltaNetV01PingMessage, encodePing } from "./ping";

const cases: Array<[string, DeltaNetV01PingMessage, Array<number>]> = [
  [
    "ping message",
    {
      type: "ping",
      ping: 123,
    },
    [5, 123],
  ],
  [
    "ping message with large ping",
    {
      type: "ping",
      ping: 1234567890,
    },
    [5, 210, 133, 216, 204, 4],
  ],
];

describe("encode/decode ping", () => {
  test.each(cases)("%p", (name, message, expectedResult) => {
    const writer = new BufferWriter(16);
    encodePing(message, writer);
    const encoded = writer.getBuffer();
    expect(Array.from(encoded)).toEqual(expectedResult);
    const reader = new BufferReader(encoded);
    expect(reader.readUInt8()).toEqual(PingMessageType);
    const decoded = decodePing(reader);
    expect(decoded).toEqual(message);
  });
});
