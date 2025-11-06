import { deflate, inflate } from "pako";

let nodeZlibFunctions: {
  deflateSync: (data: Uint8Array) => Uint8Array;
  inflateSync: (data: Uint8Array) => Uint8Array;
} | null = null;
try {
  const isNode =
    typeof process !== "undefined" && process.versions && typeof process.versions.node === "string";

  if (isNode) {
    (async () => {
      try {
        const nodeZlib = await import("node:zlib");
        nodeZlibFunctions = {
          deflateSync: (data: Uint8Array) => {
            const result = nodeZlib.deflateSync(data);
            return new Uint8Array(result);
          },
          inflateSync: (data: Uint8Array) => {
            const result = nodeZlib.inflateSync(data);
            return new Uint8Array(result);
          },
        };
      } catch (e) {
        console.log("nodeZlib not available - sync", e);
      }
    })();
  }
} catch (e) {
  console.log("nodeZlib not available - sync", e);
}

export enum CompressionLibraryChoice {
  PAKO = "PAKO",
  NODE_ZLIB = "NODE_ZLIB",
  NO_PREFERENCE = "NO_PREFERENCE",
  NONE = "NONE",
}

import { BufferReader } from "./BufferReader";
import { BufferWriter } from "./BufferWriter";

function getCompressFunction(compressionLibrary: CompressionLibraryChoice) {
  switch (compressionLibrary) {
    case CompressionLibraryChoice.PAKO:
      return deflate;
    case CompressionLibraryChoice.NODE_ZLIB:
      if (nodeZlibFunctions) {
        return nodeZlibFunctions.deflateSync;
      } else {
        throw new Error("node:zlib not available");
      }
    case CompressionLibraryChoice.NO_PREFERENCE:
      if (nodeZlibFunctions) {
        return nodeZlibFunctions.deflateSync;
      } else {
        return deflate;
      }
    case CompressionLibraryChoice.NONE:
      return (data: Uint8Array) => {
        return new Uint8Array(data);
      };
  }
}

function getDecompressFunction(compressionLibrary: CompressionLibraryChoice) {
  switch (compressionLibrary) {
    case CompressionLibraryChoice.PAKO:
      return inflate;
    case CompressionLibraryChoice.NODE_ZLIB:
      if (nodeZlibFunctions) {
        return nodeZlibFunctions.inflateSync;
      } else {
        throw new Error("node:zlib not available");
      }
    case CompressionLibraryChoice.NO_PREFERENCE:
      if (nodeZlibFunctions) {
        return nodeZlibFunctions.inflateSync;
      } else {
        return inflate;
      }
    case CompressionLibraryChoice.NONE:
      return (data: Uint8Array) => {
        return new Uint8Array(data);
      };
  }
}

export class DeflateCompressor {
  public static compress(
    data: Uint8Array,
    compressionLibrary: CompressionLibraryChoice = CompressionLibraryChoice.NO_PREFERENCE,
  ): Uint8Array {
    return getCompressFunction(compressionLibrary)(data);
  }

  public static decompress(
    compressed: Uint8Array,
    compressionLibrary: CompressionLibraryChoice = CompressionLibraryChoice.NO_PREFERENCE,
  ): Uint8Array {
    return getDecompressFunction(compressionLibrary)(compressed);
  }

  public static varIntCompress(
    data: BigInt64Array,
    length: number,
    compressionLibrary: CompressionLibraryChoice = CompressionLibraryChoice.NO_PREFERENCE,
  ): [Uint8Array, Uint8Array] {
    if (length > data.length) {
      throw new Error("length is greater than the data length");
    }
    const writer = new BufferWriter(length);
    for (let i = 0; i < length; i++) {
      writer.writeBigIntVarint(data[i]);
    }
    const uint8Array = writer.getBuffer();
    return [uint8Array, DeflateCompressor.compress(uint8Array, compressionLibrary)];
  }

  public static varIntDecompress(
    compressed: Uint8Array,
    length: number,
    compressionLibrary: CompressionLibraryChoice = CompressionLibraryChoice.NO_PREFERENCE,
  ): BigInt64Array {
    const data = DeflateCompressor.decompress(compressed, compressionLibrary);
    const buffer = new BigInt64Array(length);
    const reader = new BufferReader(data);
    for (let i = 0; i < length; i++) {
      buffer[i] = reader.readBigIntVarint();
    }
    return buffer;
  }

  public static varIntBytesCompress(
    data: Array<Uint8Array | null>,
    length: number,
    compressionLibrary: CompressionLibraryChoice = CompressionLibraryChoice.NO_PREFERENCE,
  ): [Uint8Array, Uint8Array] {
    if (length > data.length) {
      throw new Error("length is greater than the data length");
    }
    const writer = new BufferWriter(length);
    for (let i = 0; i < length; i++) {
      const value = data[i];
      if (value === null || value === undefined) {
        writer.writeUVarintLengthPrefixedBytes(new Uint8Array(0));
      } else {
        writer.writeUVarintLengthPrefixedBytes(value);
      }
    }
    const uint8Array = writer.getBuffer();
    return [uint8Array, DeflateCompressor.compress(uint8Array, compressionLibrary)];
  }

  public static varIntBytesDecompress(
    compressed: Uint8Array,
    length: number,
    compressionLibrary: CompressionLibraryChoice = CompressionLibraryChoice.NO_PREFERENCE,
  ): Array<Uint8Array> {
    const data = DeflateCompressor.decompress(compressed, compressionLibrary);
    const buffer = new Array<Uint8Array>(length);
    const reader = new BufferReader(data);
    for (let i = 0; i < length; i++) {
      buffer[i] = reader.readUVarintPrefixedBytes();
    }
    return buffer;
  }
}
