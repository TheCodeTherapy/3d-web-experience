const textEncoder = new TextEncoder();

/**
 * A class for writing binary data to a Uint8Array buffer.
 * Supports various data types including varints, strings, and boolean arrays.
 * All numeric values are written using varint encoding for efficiency.
 * The buffer automatically expands as needed.
 */
export class BufferWriter {
  private buffer: Uint8Array;
  private offset: number;

  /**
   * Creates a new BufferWriter instance.
   * @param initialLength - The initial size of the buffer in bytes
   */
  constructor(initialLength: number) {
    this.buffer = new Uint8Array(initialLength);
    this.offset = 0;
  }

  /**
   * Writes an unsigned 8-bit integer to the buffer.
   * @param value - The value to write (will be truncated to 8 bits)
   */
  public writeUint8(value: number): void {
    this.ensureCapacity(1);
    this.buffer[this.offset] = value & 0xff;
    this.offset += 1;
  }

  /**
   * Writes a boolean value to the buffer.
   * @param bool - The boolean value to write (true = 1, false = 0)
   */
  public writeBoolean(bool: boolean) {
    this.writeUint8(bool ? 1 : 0);
  }

  /**
   * Writes an array of bytes to the buffer without a length prefix.
   * @param bytes - The bytes to write
   */
  public writeUnprefixedBytes(bytes: Uint8Array): void {
    this.ensureCapacity(bytes.byteLength);
    this.buffer.set(bytes, this.offset);
    this.offset += bytes.byteLength;
  }

  /**
   * Writes a length-prefixed array of bytes to the buffer.
   * The length is encoded as an unsigned varint.
   * @param bytes - The bytes to write
   */
  public writeUVarintLengthPrefixedBytes(bytes: Uint8Array): void {
    if (!(bytes instanceof Uint8Array)) {
      throw new Error("bytes must be a Uint8Array");
    }
    this.writeUVarint(bytes.byteLength);
    this.writeUnprefixedBytes(bytes);
  }

  /**
   * Gets the written bytes as a Uint8Array.
   * @returns A new Uint8Array containing only the written bytes
   */
  public getBuffer(): Uint8Array {
    return this.buffer.subarray(0, this.offset);
  }

  /**
   * Gets the number of bytes written so far.
   * @returns The current write offset
   */
  public getWrittenLength(): number {
    return this.offset;
  }

  /**
   * Ensures the buffer has enough capacity for the required space.
   * @param neededSpace - The number of additional bytes needed
   */
  private ensureCapacity(neededSpace: number): void {
    while (this.offset + neededSpace > this.buffer.length) {
      this.expandBuffer();
    }
  }

  /**
   * Expands the buffer by doubling its current length.
   */
  private expandBuffer(): void {
    const newBuffer = new Uint8Array(this.buffer.length * 2);
    newBuffer.set(this.buffer);
    this.buffer = newBuffer;
  }

  /**
   * Writes an unsigned varint to the buffer.
   * Varints are variable-length integers that use the high bit of each byte to indicate if more bytes follow.
   * @param x - The value to write
   */
  public writeUVarint(x: number) {
    if (x <= 268435455) {
      // Simple case that can be handled without hi and lo
      this.ensureCapacity(4);
      while (x >= 0x80) {
        this.buffer[this.offset] = (x & 0x7f) | 0x80; // Extract least significant 7 bits and set continuation bit
        this.offset++;
        x >>>= 7; // Use unsigned shift here
      }
      this.buffer[this.offset] = x & 0x7f; // No need for 0xff here since we're limiting it to 7 bits
      this.offset++;
      return;
    }
    this.ensureCapacity(10);

    let lo = 0;
    let hi = 0;
    if (x !== 0) {
      lo = x >>> 0;
      hi = ((x - lo) / 4294967296) >>> 0;
    }

    while (hi) {
      this.buffer[this.offset++] = (lo & 127) | 128;
      lo = ((lo >>> 7) | (hi << 25)) >>> 0;
      hi >>>= 7;
    }
    while (lo > 127) {
      this.buffer[this.offset++] = (lo & 127) | 128;
      lo = lo >>> 7;
    }
    this.buffer[this.offset++] = lo;
  }

  /**
   * Writes an unsigned varint to the buffer.
   * Varints are variable-length integers that use the high bit of each byte to indicate if more bytes follow.
   * @param x - The value to write
   */
  public writeUVarintBigInt(x: bigint) {
    this.ensureCapacity(10);

    while (x >= 0x80n) {
      this.buffer[this.offset] = Number(x & 0x7fn) | 0x80;
      this.offset++;
      x >>= 7n;
    }
    this.buffer[this.offset] = Number(x & 0x7fn);
    this.offset++;
  }

  /**
   * Writes a signed varint to the buffer using zigzag encoding.
   * @param x - The signed value to write
   */
  public writeVarint(x: number) {
    if (x >= 0) {
      this.writeUVarint(x * 2);
    } else {
      this.writeUVarint(-x * 2 - 1);
    }
  }

  /**
   * Writes a signed varint to the buffer using zigzag encoding.
   * @param x - The signed value to write
   */
  public writeBigIntVarint(x: bigint) {
    if (x >= 0n) {
      this.writeUVarintBigInt(x * 2n);
    } else {
      this.writeUVarintBigInt(-x * 2n - 1n);
    }
  }

  /**
   * Writes an array of boolean values to the buffer.
   * The booleans are packed into bytes (8 booleans per byte).
   * @param data - The array of boolean values to write
   */
  public writeLengthPrefixedBoolArray(data: boolean[]) {
    // The length is the number of bools/bits to allow the reader to determine a non-multiple of 8 length and to allocate
    this.writeUVarint(data.length);
    // Pack the booleans into a single byte
    const numBytes = Math.ceil(data.length / 8);
    this.ensureCapacity(numBytes + 4);

    // Pack booleans into bits
    for (let i = 0; i < data.length; i++) {
      if (data[i]) {
        // Set the bit at position i
        const byteIndex = Math.floor(i / 8);
        const bitPosition = i % 8;
        this.buffer[this.offset + byteIndex] |= 1 << bitPosition;
      }
    }
    this.offset += numBytes;
  }

  /**
   * Writes a length-prefixed string to the buffer.
   * Optimized for ASCII strings, falls back to TextEncoder for non-ASCII.
   * @param value - The string to write
   * @param varint - Whether to use signed varint for length (default: false)
   * @param negativeLength - Whether the length should be negative (only used if varint is true)
   */
  public writeLengthPrefixedString(value: string, varint = false, negativeLength = false) {
    /*
     Try fast case first - no non-ascii characters and byte length is string length.

     Even if this case fails (non-ascii character found) the data will always be
     shorter so it can be overwritten
    */
    const originalOffset = this.offset; // store this in case we need to overwrite from here
    // Just write the length of the string (not the known encoded length)
    if (varint) {
      this.writeVarint(negativeLength ? -value.length : value.length);
    } else {
      this.writeUVarint(value.length);
    }
    this.ensureCapacity(value.length); // Ensure we have enough space for the string
    let nonAscii = false;
    for (let i = 0; i < value.length; i++) {
      const charCode = value.charCodeAt(i);
      if (charCode > 0x7f) {
        nonAscii = true;
        break;
      }
      this.buffer[this.offset++] = charCode;
    }

    if (!nonAscii) {
      return;
    }

    /*
     If we have non-ascii characters, we need to encode the string respecting
     utf-8 and overwrite the buffer from the original offset
    */
    this.offset = originalOffset; // overwrite the length
    let encodedLength = value.length; // This will be overwritten once we know the actual length
    this.ensureCapacity(encodedLength); // This will be at least the required length, but it gives the chance of initially creating a large enough buffer
    while (true) {
      this.offset = originalOffset;
      if (varint) {
        this.writeVarint(negativeLength ? -encodedLength : encodedLength);
      } else {
        this.writeUVarint(encodedLength);
      }
      const offsetAfterVarint = this.offset;
      const varintLength = offsetAfterVarint - originalOffset;

      const writeBuffer = new Uint8Array(this.buffer.buffer, this.offset);
      const { read, written } = textEncoder.encodeInto(value, writeBuffer);
      if (read !== value.length) {
        // Need more space and try again
        this.expandBuffer();
        continue;
      }
      if (written !== encodedLength) {
        encodedLength = written;
        // We need to overwrite the varint with the correct length
        this.offset = originalOffset;
        if (varint) {
          this.writeVarint(negativeLength ? -encodedLength : encodedLength);
        } else {
          this.writeUVarint(encodedLength);
        }
        const newOffsetAfterVarint = this.offset;
        const actualVarintLength = newOffsetAfterVarint - originalOffset;
        if (actualVarintLength !== varintLength) {
          // The varint length changed and it has overwritten the string
          // We need to write the string again
          continue;
        } else {
          // The varint length is the same so the string is intact
        }
      }
      // String written successfully - update the offset
      this.offset += written;
      return;
    }
  }
}

/**
 * Encodes a signed integer using zigzag encoding.
 * Zigzag encoding maps signed integers to unsigned integers in a way that preserves ordering.
 * @param value - The signed value to encode
 * @returns The zigzag-encoded value
 */
export function zigzagEncode(value: number): number {
  // Positive numbers: 2*n
  // Negative numbers: 2*|n|-1
  return value >= 0 ? value * 2 : -value * 2 - 1;
}
