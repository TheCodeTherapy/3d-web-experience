import {
  deflateSync as nodeDeflate,
  inflateSync as nodeInflate,
  zstdCompressSync,
  zstdDecompressSync,
} from "node:zlib";

import { BufferReader, BufferWriter } from "@mml-io/delta-net-protocol";
import Benchmark from "benchmark";

import { seededRandom } from "./seededRandom";

export function runDecodingIntegersBenchmark(): Promise<void> {
  return new Promise((resolve, reject) => {
    const rng = seededRandom(789, 123, 456, 110112);

    const data: number[] = [];
    const plusMinusRange = 1024;
    const totalValues = 8192;
    for (let i = 0; i < totalValues; i++) {
      data.push(Math.floor(rng() * plusMinusRange * 2) - plusMinusRange);
    }

    const varintWriter = new BufferWriter(4096);
    for (const value of data) {
      varintWriter.writeVarint(value);
    }
    const varintEncoded = varintWriter.getBuffer();
    const varintCompressed = nodeDeflate(varintEncoded, { level: 1 });
    const varintZstdCompressed = zstdCompressSync(varintEncoded);

    const jsonEncoded = JSON.stringify(data);
    const jsonCompressed = nodeDeflate(jsonEncoded, { level: 1 });

    const totalVarintLength = varintEncoded.length;
    const totalJSONLength = jsonEncoded.length;

    console.log(`Varint byte length : ${varintEncoded.length}`);
    console.log(`JSON byte length   : ${jsonEncoded.length}`);

    let totalVarint = 0;
    let totalVarintZstd = 0;
    let totalJSON = 0;
    const suite = new Benchmark.Suite();
    suite
      .add("Varint", function () {
        const reader = new BufferReader(nodeInflate(varintCompressed));
        totalVarint = 0;
        for (let i = 0; i < totalValues; i++) {
          const value = reader.readVarint();
          // if (value !== data[i]) {
          //   throw new Error("Value mismatch");
          // }
          totalVarint += value;
        }
      })
      .add("Varint+zstd", function () {
        const reader = new BufferReader(zstdDecompressSync(varintZstdCompressed));
        totalVarintZstd = 0;
        for (let i = 0; i < totalValues; i++) {
          const value = reader.readVarint();
          // if (value !== data[i]) {
          //   throw new Error("Value mismatch");
          // }
          totalVarintZstd += value;
        }
      })
      .add("JSON", function () {
        const decoded = JSON.parse(nodeInflate(jsonCompressed).toString("utf8"));
        totalJSON = 0;
        for (let i = 0; i < totalValues; i++) {
          const value = decoded[i];
          // if (value !== data[i]) {
          //   throw new Error("Value mismatch");
          // }
          totalJSON += value;
        }
      })
      // add listeners
      .on("cycle", (event: Benchmark.Event) => {
        console.log(String(event.target));
      })
      .on("complete", () => {
        if (totalJSON !== totalVarint || totalVarint !== totalVarintZstd) {
          throw new Error(
            `Totals do not match: JSON=${totalJSON}, Varint=${totalVarint}, Varint+zstd=${totalVarintZstd}`,
          );
        }
        console.log(`Fastest is ${suite.filter("fastest").map("name")}`);
        console.log(
          `Varint is ${(totalVarintLength / totalJSONLength).toFixed(4)} the length of JSON`,
        );
        console.log(
          `JSON is ${(totalJSONLength / totalVarintLength).toFixed(4)} the length of Varint`,
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
