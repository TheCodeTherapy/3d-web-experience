const textDecoder = new TextDecoder();

/**
 * A class for reading binary data from a Uint8Array buffer.
 * Supports various data types including varints, strings, and boolean arrays.
 * All numeric values are read using varint encoding for efficiency.
 */
export class BufferReader {
  private buffer: Uint8Array;
  private offset: number;

  /**
   * Creates a new BufferReader instance.
   * @param buffer - The Uint8Array to read from
   */
  constructor(buffer: Uint8Array) {
    this.buffer = buffer;
    this.offset = 0;
  }

  /**
   * Reads a single unsigned 8-bit integer from the buffer.
   * @returns The read value
   */
  public readUInt8(): number {
    return this.buffer[this.offset++];
  }

  /**
   * Reads a boolean value from the buffer.
   * @returns true if the read byte is 1, false otherwise
   */
  public readBoolean(): boolean {
    return this.readUInt8() === 1;
  }

  /**
   * Reads a specified number of bytes from the buffer.
   * @param length - The number of bytes to read
   * @returns A new Uint8Array containing the read bytes
   */
  public readBytes(length: number): Uint8Array {
    const bytes = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return bytes;
  }

  /**
   * Reads a length-prefixed byte array from the buffer.
   * The length is encoded as a varint.
   * @returns A new Uint8Array containing the read bytes
   */
  public readUVarintPrefixedBytes(): Uint8Array {
    const length = this.readUVarint();
    return this.readBytes(length);
  }

  /**
   * Reads a varint-encoded integer from the buffer.
   * Varints are variable-length integers that use the high bit of each byte to indicate if more bytes follow.
   * @param signed - Whether to interpret the value as a signed integer
   * @returns The decoded integer value
   * @throws Error if the varint encoding is invalid
   */
  public readUVarint(signed = false): number {
    let lo = 0;
    let hi = 0;
    let i = 0;
    for (; i < 4; ++i) {
      lo = (lo | ((this.buffer[this.offset] & 127) << (i * 7))) >>> 0;
      if (this.buffer[this.offset++] < 128) {
        return signed ? loAndHiAsSigned(lo, hi) : loAndHiAsUnsigned(lo, hi);
      }
    }
    lo = (lo | ((this.buffer[this.offset] & 127) << 28)) >>> 0;
    hi = (hi | ((this.buffer[this.offset] & 127) >> 4)) >>> 0;
    if (this.buffer[this.offset++] < 128) {
      return signed ? loAndHiAsSigned(lo, hi) : loAndHiAsUnsigned(lo, hi);
    }
    i = 0;
    for (; i < 5; ++i) {
      hi = (hi | ((this.buffer[this.offset] & 127) << (i * 7 + 3))) >>> 0;
      if (this.buffer[this.offset++] < 128) {
        return signed ? loAndHiAsSigned(lo, hi) : loAndHiAsUnsigned(lo, hi);
      }
    }

    throw Error("invalid varint encoding");
  }

  /**
   * Reads a string from the buffer with a specified byte length.
   * Optimized for ASCII strings, falls back to TextDecoder for non-ASCII.
   * @param byteLength - The number of bytes to read
   * @returns The decoded string
   */
  private readStringBytes(byteLength: number): string {
    let string = "";
    let hasNonAscii = false;
    for (let i = 0; i < byteLength; i++) {
      const charValue = this.buffer[this.offset + i];
      if (charValue < 0x80) {
        string += String.fromCharCode(charValue);
      } else {
        hasNonAscii = true;
        break;
      }
    }
    if (!hasNonAscii) {
      this.offset += byteLength;
      return string;
    }

    // Slow path - decode the string using TextDecoder
    const result = textDecoder.decode(this.buffer.subarray(this.offset, this.offset + byteLength));
    this.offset += byteLength;
    return result;
  }

  /**
   * Reads a length-prefixed string from the buffer.
   * The length is encoded as an unsigned varint.
   * @returns The decoded string
   */
  public readUVarintPrefixedString(): string {
    const readLength = this.readUVarint();
    return this.readStringBytes(readLength);
  }

  /**
   * Reads a length-prefixed string from the buffer.
   * The length is encoded as a signed varint.
   * @returns A tuple containing the decoded string and a boolean indicating if the length was negative
   */
  public readVarintPrefixedString(): [string, boolean] {
    const length = this.readVarint();
    const negativeLength = length < 0;
    const readLength = negativeLength ? -length : length;
    const result = this.readStringBytes(readLength);
    return [result, negativeLength];
  }

  /**
   * Reads a signed varint-encoded integer from the buffer.
   * @returns The decoded signed integer value
   */
  public readVarint(): number {
    return this.readUVarint(true);
  }

  /**
   * Reads a varint-encoded bigint from the buffer.
   * Varints are variable-length integers that use the high bit of each byte to indicate if more bytes follow.
   * @param signed - Whether to interpret the value as a signed integer
   * @returns The decoded bigint value
   * @throws Error if the varint encoding is invalid
   */
  public readUVarintBigInt(signed = false): bigint {
    let result = 0n;
    let shift = 0n;
    let byte: number;
    let bytesRead = 0;

    do {
      if (bytesRead >= 10) {
        throw Error("invalid varint encoding");
      }
      byte = this.buffer[this.offset++];
      result |= BigInt(byte & 0x7f) << shift;
      shift += 7n;
      bytesRead++;
    } while (byte >= 0x80);

    if (signed) {
      // Convert from zigzag encoding
      return result & 1n ? -(result + 1n) / 2n : result / 2n;
    }

    return result;
  }

  /**
   * Reads a signed varint-encoded integer from the buffer.
   * @returns The decoded signed integer value
   */
  public readBigIntVarint(): bigint {
    return this.readUVarintBigInt(true);
  }

  /**
   * Reads an array of boolean values from the buffer.
   * The booleans are packed into bytes (8 booleans per byte).
   * @returns An array of boolean values
   */
  public readLengthPrefixedBoolArray(): boolean[] {
    // The length is the number of bools/bits to allow the reader to determine a non-multiple of 8 length and to allocate
    const length = this.readUVarint();
    // The booleans are packed into a single byte
    const numBytes = Math.ceil(length / 8);
    const result = new Array<boolean>(length);
    for (let i = 0; i < length; i++) {
      const byteIndex = Math.floor(i / 8);
      const bitPosition = i % 8;
      result[i] = !!(this.buffer[this.offset + byteIndex] & (1 << bitPosition));
    }
    this.offset += numBytes;
    return result;
  }

  /**
   * Checks if the reader has reached the end of the buffer.
   * @returns true if all bytes have been read, false otherwise
   */
  public isEnd() {
    return this.offset >= this.buffer.length;
  }
}

/**
 * Converts a low and high 32-bit integer pair to a signed 64-bit integer.
 * @param lo - The low 32 bits
 * @param hi - The high 32 bits
 * @returns The signed 64-bit integer value
 */
function loAndHiAsSigned(lo: number, hi: number) {
  const value = lo + hi * 4294967296;
  if (value & 1) {
    return -(value + 1) / 2;
  }
  return value / 2;
}

/**
 * Converts a low and high 32-bit integer pair to an unsigned 64-bit integer.
 * @param lo - The low 32 bits
 * @param hi - The high 32 bits
 * @returns The unsigned 64-bit integer value
 */
function loAndHiAsUnsigned(lo: number, hi: number) {
  return lo + hi * 4294967296;
}
