import { BufferReader } from "../../../BufferReader";
import { BufferWriter } from "../../../BufferWriter";
import { ConnectUserMessageType } from "../../messageTypes";

import { decodeConnectUser, DeltaNetV01ConnectUserMessage, encodeConnectUser } from "./connectUser";

const cases: Array<[string, DeltaNetV01ConnectUserMessage, Array<number>]> = [
  [
    "basic",
    {
      type: "connectUser",
      token: "some-token",
      observer: false,
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
      64, 10, 115, 111, 109, 101, 45, 116, 111, 107, 101, 110, 0, 2, 1, 222, 1, 2, 188, 3, 2, 1, 6,
      115, 116, 97, 116, 101, 49, 2, 6, 115, 116, 97, 116, 101, 50,
    ],
  ],
];

describe("encode/decode connectUser", () => {
  test.each(cases)("%p", (name, message, expectedResult) => {
    const writer = new BufferWriter(16);
    encodeConnectUser(message, writer);
    const encoded = writer.getBuffer();
    expect(Array.from(encoded)).toEqual(expectedResult);
    const reader = new BufferReader(encoded);
    expect(reader.readUInt8()).toEqual(ConnectUserMessageType);
    const decoded = decodeConnectUser(reader);
    expect(decoded).toEqual(message);
  });
});
