import { BufferReader } from "../../../BufferReader";
import { BufferWriter } from "../../../BufferWriter";
import { ErrorMessageType } from "../../messageTypes";

import { decodeError, DeltaNetV01ErrorMessage, encodeError } from "./error";

const cases: Array<[string, DeltaNetV01ErrorMessage, Array<number>]> = [
  [
    "empty",
    {
      type: "error",
      errorType: "USER_NETWORKING_UNKNOWN_ERROR",
      message: "",
      retryable: false,
    },
    [
      7, 29, 85, 83, 69, 82, 95, 78, 69, 84, 87, 79, 82, 75, 73, 78, 71, 95, 85, 78, 75, 78, 79, 87,
      78, 95, 69, 82, 82, 79, 82, 0, 0,
    ],
  ],
  [
    "with a long message",
    {
      type: "error",
      errorType: "USER_NETWORKING_UNKNOWN_ERROR",
      message:
        "Some reasonably long error message with some pointless extra words like these that ends up being quite long and causes the uvarint representing the message length to be greater than 128",
      retryable: false,
    },
    [
      7, 29, 85, 83, 69, 82, 95, 78, 69, 84, 87, 79, 82, 75, 73, 78, 71, 95, 85, 78, 75, 78, 79, 87,
      78, 95, 69, 82, 82, 79, 82, 185, 1, 83, 111, 109, 101, 32, 114, 101, 97, 115, 111, 110, 97,
      98, 108, 121, 32, 108, 111, 110, 103, 32, 101, 114, 114, 111, 114, 32, 109, 101, 115, 115, 97,
      103, 101, 32, 119, 105, 116, 104, 32, 115, 111, 109, 101, 32, 112, 111, 105, 110, 116, 108,
      101, 115, 115, 32, 101, 120, 116, 114, 97, 32, 119, 111, 114, 100, 115, 32, 108, 105, 107,
      101, 32, 116, 104, 101, 115, 101, 32, 116, 104, 97, 116, 32, 101, 110, 100, 115, 32, 117, 112,
      32, 98, 101, 105, 110, 103, 32, 113, 117, 105, 116, 101, 32, 108, 111, 110, 103, 32, 97, 110,
      100, 32, 99, 97, 117, 115, 101, 115, 32, 116, 104, 101, 32, 117, 118, 97, 114, 105, 110, 116,
      32, 114, 101, 112, 114, 101, 115, 101, 110, 116, 105, 110, 103, 32, 116, 104, 101, 32, 109,
      101, 115, 115, 97, 103, 101, 32, 108, 101, 110, 103, 116, 104, 32, 116, 111, 32, 98, 101, 32,
      103, 114, 101, 97, 116, 101, 114, 32, 116, 104, 97, 110, 32, 49, 50, 56, 0,
    ],
  ],
];

describe("encode/decode error", () => {
  test.each(cases)("%p", (name, message, expectedResult) => {
    const writer = new BufferWriter(16);
    encodeError(message, writer);
    const encoded = writer.getBuffer();
    expect(Array.from(encoded)).toEqual(expectedResult);
    const reader = new BufferReader(encoded);
    expect(reader.readUInt8()).toEqual(ErrorMessageType);
    const decoded = decodeError(reader);
    expect(decoded).toEqual(message);
  });
});
