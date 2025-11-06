import { deflateSync as nodeDeflate, zstdCompressSync } from "node:zlib";

import { BufferWriter, zigzagEncode } from "@mml-io/delta-net-protocol";
import Benchmark from "benchmark";

import { seededRandom } from "./seededRandom";

export function runEncodingIntegersBenchmark(): Promise<void> {
  return new Promise((resolve, reject) => {
    let totalVarintLength = 0;
    let totalVarintZlibLength = 0;
    let totalVarintZstdLength = 0;
    let totalInt32ArrayLength = 0;
    let totalJSONLength = 0;
    let totalJSONZlibLength = 0;

    const rng = seededRandom(789, 123, 456, 110112);

    const data: number[] = [];
    const plusMinusRange = 1024;
    for (let i = 0; i < 8192; i++) {
      data.push(Math.floor(rng() * plusMinusRange * 2) - plusMinusRange);
    }

    const suite = new Benchmark.Suite();
    suite
      .add("Varint", function () {
        let totalLength = 0;
        const writer = new BufferWriter(4096);
        for (const value of data) {
          writer.writeVarint(value);
        }
        const encoded = writer.getBuffer();
        totalLength = encoded.byteLength;
        if (totalLength <= 0) {
          throw new Error("Invalid total length");
        }
        totalVarintLength = totalLength;
      })
      .add("Varint+zlib", function () {
        let totalLength = 0;
        const writer = new BufferWriter(4096);
        for (const value of data) {
          writer.writeVarint(value);
        }
        const encoded = writer.getBuffer();
        totalLength = encoded.byteLength;
        if (totalLength <= 0) {
          throw new Error("Invalid total length");
        }
        const compressed = nodeDeflate(encoded, { level: 1 });
        const compressedLength = compressed.byteLength;
        totalVarintZlibLength = compressedLength;
      })
      .add("Varint+zstd", function () {
        let totalLength = 0;
        const writer = new BufferWriter(4096);
        for (const value of data) {
          writer.writeVarint(value);
        }
        const encoded = writer.getBuffer();
        totalLength = encoded.byteLength;
        if (totalLength <= 0) {
          throw new Error("Invalid total length");
        }
        const compressed = zstdCompressSync(encoded);
        const compressedLength = compressed.byteLength;
        totalVarintZstdLength = compressedLength;
      })
      .add("Int32Array", function () {
        let totalLength = 0;
        const writer = new BufferWriter(4096);
        const int32Array = new Int32Array(data.length);
        for (const value of data) {
          int32Array[totalLength++] = zigzagEncode(value);
        }
        writer.writeUnprefixedBytes(new Uint8Array(int32Array.buffer));
        const encoded = writer.getBuffer();
        totalLength = encoded.byteLength;
        if (totalLength <= 0) {
          throw new Error("Invalid total length");
        }
        const compressed = nodeDeflate(encoded);
        const compressedLength = compressed.byteLength;
        totalInt32ArrayLength = compressedLength;
      })
      .add("JSON", function () {
        let totalLength = 0;
        const encoded = JSON.stringify(data);
        totalLength = encoded.length; // ~ basically utf8 length
        if (totalLength <= 0) {
          throw new Error("Invalid total length");
        }
        totalJSONLength = totalLength;
        const compressed = nodeDeflate(encoded);
        const compressedLength = compressed.byteLength;
        totalJSONZlibLength = compressedLength;
      })
      // add listeners
      .on("cycle", (event: Benchmark.Event) => {
        console.log(String(event.target));
      })
      .on("complete", () => {
        console.log(`Fastest is ${suite.filter("fastest").map("name")}`);

        console.log(`Varint byte length : ${totalVarintLength}`);
        console.log(`Varint+zlib byte length : ${totalVarintZlibLength}`);
        console.log(`Varint+zstd byte length : ${totalVarintZstdLength}`);
        console.log(`JSON+zlib byte length   : ${totalJSONZlibLength}`);
        console.log(`JSON byte length   : ${totalJSONLength}`);
        console.log(`Int32Array byte length   : ${totalInt32ArrayLength}`);
        console.log(
          `Varint+zlib is ${(totalVarintZlibLength / totalVarintZstdLength).toFixed(4)} the length of Varint+zstd`,
        );
        console.log(
          `Varint+zlib is ${(totalVarintZlibLength / totalJSONLength).toFixed(4)} the length of JSON`,
        );
        console.log(
          `JSON is ${(totalJSONLength / totalVarintZlibLength).toFixed(4)} the length of Varint`,
        );
        resolve();
      })
      .on("error", (error: Error) => {
        reject(error);
      })
      // run async
      .run({ async: true });
  });
}
