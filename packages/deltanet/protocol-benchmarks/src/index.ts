#!/usr/bin/env node

console.log("=".repeat(80));
console.log("DeltaNet Protocol Benchmarks");
console.log("=".repeat(80));

const benchmarks = [
  { name: "Message Encoding", module: "./encoding.js", func: "runEncodingBenchmark" },
  { name: "Message Decoding", module: "./decoding.js", func: "runDecodingBenchmark" },
  {
    name: "Integer Encoding",
    module: "./encodingIntegers.js",
    func: "runEncodingIntegersBenchmark",
  },
  {
    name: "Integer Decoding",
    module: "./decodingIntegers.js",
    func: "runDecodingIntegersBenchmark",
  },
];

async function runBenchmark(name: string, module: string, func: string) {
  console.log(`\n${"=".repeat(40)}`);
  console.log(`Running ${name} Benchmark`);
  console.log(`${"=".repeat(40)}`);

  try {
    const benchmarkModule = await import(module);
    await benchmarkModule[func]();
  } catch (error) {
    console.error(`Error running ${name}:`, error);
  }
}

async function runAllBenchmarks() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Available benchmarks:");
    benchmarks.forEach((bench, index) => {
      console.log(`  ${index + 1}. ${bench.name}`);
    });
    console.log("\nUsage: npm run bench [benchmark-name]");
    console.log("       npm run bench all");
    console.log("\nExamples:");
    console.log("  npm run bench encoding");
    console.log("  npm run bench decoding");
    console.log("  npm run bench integers");
    console.log("  npm run bench all");
    return;
  }

  const benchmarkArg = args[0].toLowerCase();

  if (benchmarkArg === "all") {
    for (const benchmark of benchmarks) {
      await runBenchmark(benchmark.name, benchmark.module, benchmark.func);
    }
  } else if (benchmarkArg === "encoding" || benchmarkArg === "encode") {
    await runBenchmark("Message Encoding", "./encoding.js", "runEncodingBenchmark");
  } else if (benchmarkArg === "decoding" || benchmarkArg === "decode") {
    await runBenchmark("Message Decoding", "./decoding.js", "runDecodingBenchmark");
  } else if (benchmarkArg === "integers" || benchmarkArg === "int") {
    await runBenchmark("Integer Encoding", "./encodingIntegers.js", "runEncodingIntegersBenchmark");
    await runBenchmark("Integer Decoding", "./decodingIntegers.js", "runDecodingIntegersBenchmark");
  } else if (benchmarkArg === "encoding-integers") {
    await runBenchmark("Integer Encoding", "./encodingIntegers.js", "runEncodingIntegersBenchmark");
  } else if (benchmarkArg === "decoding-integers") {
    await runBenchmark("Integer Decoding", "./decodingIntegers.js", "runDecodingIntegersBenchmark");
  } else {
    console.log(`Unknown benchmark: ${benchmarkArg}`);
    console.log("Available options: all, encoding, decoding, integers");
  }
}

runAllBenchmarks().catch(console.error);
