import { BufferReader } from "./BufferReader";
import { BufferWriter } from "./BufferWriter";

describe("BufferReader and BufferWriter", () => {
  describe("basic operations", () => {
    it("should read uint8 values correctly", () => {
      const buffer = new Uint8Array([42, 255, 0, 127]);
      const reader = new BufferReader(buffer);

      expect(reader.readUInt8()).toBe(42);
      expect(reader.readUInt8()).toBe(255);
      expect(reader.readUInt8()).toBe(0);
      expect(reader.readUInt8()).toBe(127);
    });

    it("should read boolean values correctly", () => {
      const buffer = new Uint8Array([1, 0, 1, 0]);
      const reader = new BufferReader(buffer);

      expect(reader.readBoolean()).toBe(true);
      expect(reader.readBoolean()).toBe(false);
      expect(reader.readBoolean()).toBe(true);
      expect(reader.readBoolean()).toBe(false);
    });

    it("should read bytes correctly", () => {
      const buffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const reader = new BufferReader(buffer);

      const firstPart = reader.readBytes(3);
      expect([...firstPart]).toEqual([1, 2, 3]);

      const secondPart = reader.readBytes(2);
      expect([...secondPart]).toEqual([4, 5]);

      const thirdPart = reader.readBytes(3);
      expect([...thirdPart]).toEqual([6, 7, 8]);
    });

    it("should detect end of buffer", () => {
      const buffer = new Uint8Array([1, 2, 3]);
      const reader = new BufferReader(buffer);

      expect(reader.isEnd()).toBe(false);
      reader.readBytes(3);
      expect(reader.isEnd()).toBe(true);
    });
  });

  describe("varint operations", () => {
    it("should read unsigned varints correctly", () => {
      // Create a buffer with various sizes of varints
      const writer = new BufferWriter(100);
      const values = [0, 1, 127, 128, 16383, 16384, 2097151, 2097152, 268435455];
      for (const value of values) {
        writer.writeUVarint(value);
      }

      const buffer = writer.getBuffer();
      const reader = new BufferReader(buffer);

      for (const expected of values) {
        expect(reader.readUVarint()).toBe(expected);
      }
    });

    it("should read very large unsigned varints", () => {
      const writer = new BufferWriter(100);
      const values = [
        Math.pow(2, 31) - 1, // Max 32-bit signed int
        Math.pow(2, 31), // First value that requires 32-bit unsigned
        Math.pow(2, 32) - 1, // Max 32-bit unsigned int
        Math.pow(2, 32), // First value needing more than 32 bits
        Math.pow(2, 53) - 1, // Largest precise integer in JavaScript
      ];

      for (const value of values) {
        writer.writeUVarint(value);
      }

      const buffer = writer.getBuffer();
      const reader = new BufferReader(buffer);

      for (const expected of values) {
        expect(reader.readUVarint()).toBe(expected);
      }
    });

    it("should read signed varints correctly", () => {
      const writer = new BufferWriter(50);
      const values = [
        0,
        1,
        -1,
        63,
        -64,
        8191,
        -8192,
        1048575,
        -1048576,
        Math.pow(2, 31) - 1, // Max 32-bit signed int
        Math.pow(2, 31), // First value that requires 32-bit unsigned
        Math.pow(2, 32) - 1, // Max 32-bit unsigned int
        Math.pow(2, 32), // First value needing more than 32 bits
        Math.pow(2, 53) - 1, // Largest precise integer in JavaScript
      ];

      for (const value of values) {
        writer.writeVarint(value);
      }

      const buffer = writer.getBuffer();
      const reader = new BufferReader(buffer);

      for (const expected of values) {
        expect(reader.readVarint()).toBe(expected);
      }
    });

    it("should correctly convert between signed and unsigned", () => {
      // Test the special-case signed varint encoding where odd numbers are negative
      const writer = new BufferWriter(20);
      const pairs = [
        [0, 0], // Value 0 encoded as 0
        [1, 2], // Value 1 encoded as 2
        [-1, 1], // Value -1 encoded as 1
        [10, 20], // Value 10 encoded as 20
        [-10, 19], // Value -10 encoded as 19
      ];

      // Write using the public API
      for (const [value] of pairs) {
        writer.writeVarint(value);
      }

      const buffer = writer.getBuffer();
      const reader = new BufferReader(buffer);

      for (const [expected] of pairs) {
        expect(reader.readVarint()).toBe(expected);
      }
    });

    it("should read unsigned bigint varints correctly", () => {
      const writer = new BufferWriter(100);
      const values = [
        0n,
        1n,
        127n,
        128n,
        16383n,
        16384n,
        2097151n,
        2097152n,
        268435455n,
        2n ** 31n - 1n, // Max 32-bit signed int
        2n ** 31n, // First value that requires 32-bit unsigned
        2n ** 32n - 1n, // Max 32-bit unsigned int
        2n ** 32n, // First value needing more than 32 bits
        2n ** 53n - 1n, // Largest precise integer in JavaScript
        2n ** 63n - 1n, // Max 64-bit signed int
      ];

      for (const value of values) {
        writer.writeUVarintBigInt(value);
      }

      const buffer = writer.getBuffer();
      const reader = new BufferReader(buffer);

      for (const expected of values) {
        expect(reader.readUVarintBigInt()).toBe(expected);
      }
    });

    it("should read signed bigint varints correctly", () => {
      const writer = new BufferWriter(100);
      const values = [
        0n,
        1n,
        -1n,
        63n,
        -64n,
        8191n,
        -8192n,
        1048575n,
        -1048576n,
        2n ** 31n - 1n, // Max 32-bit signed int
        2n ** 31n, // First value that requires 32-bit unsigned
        2n ** 32n - 1n, // Max 32-bit unsigned int
        2n ** 32n, // First value needing more than 32 bits
        2n ** 53n - 1n, // Largest precise integer in JavaScript
        2n ** 63n - 1n, // Max 64-bit signed int
        -(2n ** 63n), // Min 64-bit signed int
      ];

      for (const value of values) {
        writer.writeBigIntVarint(value);
      }

      const buffer = writer.getBuffer();
      const reader = new BufferReader(buffer);

      for (const expected of values) {
        expect(reader.readBigIntVarint()).toBe(expected);
      }
    });

    it("should correctly convert between signed and unsigned bigints", () => {
      const writer = new BufferWriter(20);
      const pairs = [
        [0n, 0n], // Value 0 encoded as 0
        [1n, 2n], // Value 1 encoded as 2
        [-1n, 1n], // Value -1 encoded as 1
        [10n, 20n], // Value 10 encoded as 20
        [-10n, 19n], // Value -10 encoded as 19
        [2n ** 63n - 1n, 2n ** 64n - 2n], // Max 64-bit signed int
        [-(2n ** 63n), 2n ** 64n - 1n], // Min 64-bit signed int
      ];

      // Write using the public API
      for (const [value] of pairs) {
        writer.writeBigIntVarint(value);
      }

      const buffer = writer.getBuffer();
      const reader = new BufferReader(buffer);

      for (const [expected] of pairs) {
        expect(reader.readBigIntVarint()).toBe(expected);
      }
    });

    it("should throw error for invalid bigint varint encoding", () => {
      // Create a buffer with an invalid varint (all bytes have continuation bit set)
      const invalidBuffer = new Uint8Array([
        0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80,
      ]);
      const reader = new BufferReader(invalidBuffer);

      expect(() => {
        reader.readUVarintBigInt();
      }).toThrow("invalid varint encoding");
    });

    it("should have consistent encoding between number and bigint for unsigned values", () => {
      const testValues = [
        0,
        1,
        127,
        128,
        16383,
        16384,
        2097151,
        2097152,
        268435455,
        Number.MAX_SAFE_INTEGER,
      ];

      for (const value of testValues) {
        // Write using number version
        const writer1 = new BufferWriter(20);
        writer1.writeUVarint(value);
        const buffer1 = writer1.getBuffer();

        // Write using bigint version
        const writer2 = new BufferWriter(20);
        writer2.writeUVarintBigInt(BigInt(value));
        const buffer2 = writer2.getBuffer();

        // Buffers should be identical
        expect(buffer1).toEqual(buffer2);

        // Read back using both methods
        const reader1 = new BufferReader(buffer1);
        const reader2 = new BufferReader(buffer2);

        expect(reader1.readUVarint()).toBe(value);
        expect(Number(reader2.readUVarintBigInt())).toBe(value);
      }
    });

    it("should have consistent encoding between number and bigint for signed values", () => {
      const testValues = [
        0,
        1,
        -1,
        63,
        -64,
        8191,
        -8192,
        1048575,
        -1048576,
        2147483647, // Max 32-bit signed int
        -2147483648, // Min 32-bit signed int
      ];

      for (const value of testValues) {
        // Write using number version
        const writer1 = new BufferWriter(20);
        writer1.writeVarint(value);
        const buffer1 = writer1.getBuffer();

        // Write using bigint version
        const writer2 = new BufferWriter(20);
        writer2.writeBigIntVarint(BigInt(value));
        const buffer2 = writer2.getBuffer();

        // Buffers should be identical
        expect(buffer1).toEqual(buffer2);

        // Read back using both methods
        const reader1 = new BufferReader(buffer1);
        const reader2 = new BufferReader(buffer2);

        expect(reader1.readVarint()).toBe(value);
        expect(Number(reader2.readBigIntVarint())).toBe(value);
      }
    });

    it("should handle edge cases around Number.MAX_SAFE_INTEGER", () => {
      const testValues = [
        Number.MAX_SAFE_INTEGER - 1,
        Number.MAX_SAFE_INTEGER,
        Number.MIN_SAFE_INTEGER + 1,
        Number.MIN_SAFE_INTEGER,
      ];

      for (const value of testValues) {
        // Write using bigint version
        const writer = new BufferWriter(20);
        writer.writeBigIntVarint(BigInt(value));
        const buffer = writer.getBuffer();

        // Read back using bigint version
        const reader = new BufferReader(buffer);
        const result = reader.readBigIntVarint();

        // Verify the value is preserved exactly
        expect(result).toBe(BigInt(value));
      }
    });

    describe("known uvarint cases", () => {
      const uvarintCases: Array<[number, Array<number>]> = [
        [0, [0]],
        [1, [1]],
        [127, [127]],
        [128, [128, 1]],
        [129, [129, 1]],
        [255, [255, 1]],
        [256, [128, 2]],
        [257, [129, 2]],
        [320, [192, 2]],
        [382, [254, 2]],
        [383, [255, 2]],
        [384, [128, 3]],
        [385, [129, 3]],
        [509, [253, 3]],
        [510, [254, 3]],
        [511, [255, 3]],
        [512, [128, 4]],
        [513, [129, 4]],
        [173573, [133, 204, 10]],
        [17357327, [143, 180, 163, 8]],
        [268435454, [254, 255, 255, 127]],
        [268435455, [255, 255, 255, 127]],
        [268435456, [128, 128, 128, 128, 1]],
        [268435457, [129, 128, 128, 128, 1]],
        [1735732759, [151, 220, 212, 187, 6]],
        [2147483647, [255, 255, 255, 255, 7]],
        [2147483648, [128, 128, 128, 128, 8]],
        [1735732759569, [145, 152, 240, 141, 194, 50]],
      ];

      test.each(uvarintCases)("uvarint: %p", (value, expectedResult) => {
        const writer = new BufferWriter(4);
        writer.writeUVarint(value);
        const encoded = writer.getBuffer();
        expect(Array.from(encoded)).toEqual(expectedResult);
        const reader = new BufferReader(encoded);
        expect(reader.readUVarint()).toEqual(value);
      });

      test("uvarint 0 to +100000000", () => {
        for (let i = 0; i < 100000000; i += 10383) {
          const writer = new BufferWriter(4);
          writer.writeUVarint(i);
          const encoded = writer.getBuffer();
          const reader = new BufferReader(encoded);
          expect(reader.readUVarint()).toEqual(i);
        }
      });

      test("uvarint 0 to +10000", () => {
        for (let i = 0; i < 10000; i++) {
          const writer = new BufferWriter(4);
          writer.writeUVarint(i);
          const encoded = writer.getBuffer();
          const reader = new BufferReader(encoded);
          expect(reader.readUVarint()).toEqual(i);
        }
      });
    });

    describe("known varint cases", () => {
      const varintCases: Array<[number, Array<number>]> = [
        [0, [0]],
        [1, [2]],
        [-1, [1]],
        [2, [4]],
        [-2, [3]],
        [123, [246, 1]],
        [-123, [245, 1]],
        [2147483647, [254, 255, 255, 255, 15]],
        [-2147483648, [255, 255, 255, 255, 15]],
        [1735732759569, [162, 176, 224, 155, 132, 101]],
        [-1735732759569, [161, 176, 224, 155, 132, 101]],
        [1735732759570, [164, 176, 224, 155, 132, 101]],
        [-1735732759570, [163, 176, 224, 155, 132, 101]],
      ];

      test.each(varintCases)("varint: %p", (value, expectedResult) => {
        const writer = new BufferWriter(4);
        writer.writeVarint(value);
        const encoded = writer.getBuffer();
        expect(Array.from(encoded)).toEqual(expectedResult);
        const reader = new BufferReader(encoded);
        expect(reader.readVarint()).toEqual(value);
      });

      test("varint -100000000 to +100000000", () => {
        for (let i = -100000000; i < 100000000; i += 1583) {
          const writer = new BufferWriter(4);
          writer.writeVarint(i);
          const encoded = writer.getBuffer();
          const reader = new BufferReader(encoded);
          expect(reader.readVarint()).toEqual(i);
        }
      });
    });
  });

  describe("array operations", () => {
    it("should read boolean arrays correctly", () => {
      const testArrays = [
        [],
        [true],
        [false],
        [true, false, true],
        [...Array(8)].map((_, i) => i % 2 === 0), // 8 alternating booleans
        [...Array(16)].map((_, i) => i % 3 === 0), // 16 booleans with a pattern
      ];

      for (const array of testArrays) {
        const writer = new BufferWriter(50);
        writer.writeLengthPrefixedBoolArray(array);

        const buffer = writer.getBuffer();
        const reader = new BufferReader(buffer);
        const result = reader.readLengthPrefixedBoolArray();

        expect(result).toEqual(array);
      }
    });

    it("should correctly handle boolean arrays with odd sizes", () => {
      // Test arrays that don't fill complete bytes
      const testSizes = [1, 3, 7, 9, 15, 17];

      for (const size of testSizes) {
        const boolArray = Array(size)
          .fill(false)
          .map((_, i) => i % 2 === 0);

        const writer = new BufferWriter(50);
        writer.writeLengthPrefixedBoolArray(boolArray);

        const buffer = writer.getBuffer();
        const reader = new BufferReader(buffer);
        const result = reader.readLengthPrefixedBoolArray();

        expect(result).toEqual(boolArray);
        expect(result.length).toBe(size);
      }
    });
  });

  describe("string operations", () => {
    it("should read uvarint-prefixed strings correctly", () => {
      const testStrings = ["", "hello", "world", "BufferReader test"];

      const writer = new BufferWriter(100);
      for (const str of testStrings) {
        writer.writeLengthPrefixedString(str);
      }

      const buffer = writer.getBuffer();
      const reader = new BufferReader(buffer);

      for (const expected of testStrings) {
        expect(reader.readUVarintPrefixedString()).toBe(expected);
      }
    });

    it("should read strings with multi-byte characters", () => {
      const testStrings = [
        "こんにちは",
        "你好",
        "🚀🔥💯",
        "café",
        "über",
        "a\u0300", // "à" composed with combining diacritical mark
      ];

      const writer = new BufferWriter(100);
      for (const str of testStrings) {
        writer.writeLengthPrefixedString(str);
      }

      const buffer = writer.getBuffer();
      const reader = new BufferReader(buffer);

      for (const expected of testStrings) {
        expect(reader.readUVarintPrefixedString()).toBe(expected);
      }
    });

    it("should read varint-prefixed strings correctly", () => {
      const testStrings = ["first", "second", "third"];

      const writer = new BufferWriter(100);
      for (const str of testStrings) {
        writer.writeLengthPrefixedString(str, true); // use varint encoding
      }

      const buffer = writer.getBuffer();
      const reader = new BufferReader(buffer);

      for (const expected of testStrings) {
        const [str, negative] = reader.readVarintPrefixedString();
        expect(str).toBe(expected);
        expect(negative).toBe(false);
      }
    });

    it("should handle negative length indicator for strings", () => {
      const testStrings = ["first", "second", "third"];

      const writer = new BufferWriter(100);
      for (const str of testStrings) {
        writer.writeLengthPrefixedString(str, true, true); // use negative varint length
      }

      const buffer = writer.getBuffer();
      const reader = new BufferReader(buffer);

      for (const expected of testStrings) {
        const [str, negative] = reader.readVarintPrefixedString();
        expect(str).toBe(expected);
        expect(negative).toBe(true);
      }
    });
  });

  describe("error handling", () => {
    it("should throw error for invalid varint encoding", () => {
      // Create a buffer with an invalid varint (all bytes have continuation bit set)
      const invalidBuffer = new Uint8Array([
        0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80,
      ]);
      const reader = new BufferReader(invalidBuffer);

      expect(() => {
        reader.readUVarint();
      }).toThrow("invalid varint encoding");
    });
  });
});
