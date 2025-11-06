import { BufferWriter, encodeServerMessage } from "@mml-io/delta-net-protocol";
import Benchmark from "benchmark";

import { prepareData } from "./prepare-data";

export function runEncodingBenchmark(): Promise<void> {
  return new Promise((resolve, reject) => {
    let totalBinaryLength = 0;
    let totalJSONLength = 0;

    const data = prepareData(1000);
    const jsonData = prepareData(1000, true);
    const suite = new Benchmark.Suite();
    suite
      .add("Binary", function () {
        let totalLength = 0;
        for (const message of data) {
          const writer = new BufferWriter(256);
          encodeServerMessage(message, writer);
          const encoded = writer.getBuffer();
          totalLength += encoded.length;
        }
        if (totalLength <= 0) {
          throw new Error("Invalid total length");
        }
        totalBinaryLength = totalLength;
      })
      .add("JSON", function () {
        let totalLength = 0;
        for (const message of jsonData) {
          const encoded = JSON.stringify(message);
          totalLength += encoded.length;
        }
        if (totalLength <= 0) {
          throw new Error("Invalid total length");
        }
        totalJSONLength = totalLength;
      })
      // add listeners
      .on("cycle", (event: Benchmark.Event) => {
        console.log(String(event.target));
      })
      .on("complete", () => {
        console.log(`Fastest is ${suite.filter("fastest").map("name")}`);

        console.log(`Binary byte length : ${totalBinaryLength}`);
        console.log(`JSON byte length   : ${totalJSONLength}`);
        console.log(
          `Binary is ${(totalBinaryLength / totalJSONLength).toFixed(4)} the length of JSON`,
        );
        console.log(
          `JSON is ${(totalJSONLength / totalBinaryLength).toFixed(4)} the length of Binary`,
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
