# DeltaNet Protocol Benchmarks

A comprehensive benchmark suite for testing the performance and efficiency of the DeltaNet protocol encoding and decoding operations.

## Overview

This package contains benchmarks that compare DeltaNet's binary protocol with JSON in various scenarios:

- **Message Benchmarks**: Full protocol message encoding/decoding
- **Integer Benchmarks**: Integer-specific encoding/decoding with compression
- **String Benchmarks**: String-specific encoding/decoding with compression

Each benchmark category tests both encoding and decoding operations, with and without compression (zlib and zstd).

## Structure

```
src/
├── index.ts                 # Main benchmark runner
├── encoding.ts              # Message encoding benchmarks
├── decoding.ts              # Message decoding benchmarks
├── encodingIntegers.ts      # Integer encoding benchmarks
├── decodingIntegers.ts      # Integer decoding benchmarks
├── encodingStrings.ts       # String encoding benchmarks
├── decodingStrings.ts       # String decoding benchmarks
├── prepare-data.ts          # Test data generation
└── seededRandom.ts          # Deterministic random number generator
```

## Features

### Symmetric Benchmarks
- **Encoding/Decoding Pairs**: Each encoding benchmark has a corresponding decoding benchmark
- **Consistent Compression**: Both encoding and decoding use the same compression libraries (Node.js built-in zlib and zstd)
- **Uniform Data Generation**: All related benchmarks use the same seeded random data for consistency

### Compression Support
- **Raw Binary**: DeltaNet protocol without compression
- **Zlib Compression**: Fast compression with reasonable ratios
- **Zstd Compression**: Modern compression with better ratios
- **JSON Baselines**: For comparison with traditional approaches

### Performance Metrics
- **Throughput**: Operations per second for encoding/decoding
- **Size Efficiency**: Byte length comparisons between formats
- **Compression Ratios**: Effectiveness of different compression methods

## Usage

### Running Benchmarks

```bash
# Run all benchmarks
npm run bench all

# Run specific benchmark categories
npm run bench encoding      # Message encoding only
npm run bench decoding      # Message decoding only
npm run bench integers      # Both integer encoding and decoding
npm run bench strings       # Both string encoding and decoding

# Run individual benchmarks
npm run bench encoding-integers
npm run bench decoding-integers
npm run bench encoding-strings
npm run bench decoding-strings
```

### Example Output

```
================================================================================
DeltaNet Protocol Benchmarks
================================================================================

========================================
Running Message Encoding Benchmark
========================================

Binary x 12,345 ops/sec ±1.23% (89 runs sampled)
Binary+zlib x 8,765 ops/sec ±0.98% (92 runs sampled)
Binary+zstd x 9,876 ops/sec ±1.45% (87 runs sampled)
JSON x 6,543 ops/sec ±2.01% (85 runs sampled)
JSON+zlib x 4,321 ops/sec ±1.67% (88 runs sampled)

Fastest is Binary

Binary byte length       : 89012
Binary+zlib byte length  : 34567
Binary+zstd byte length  : 32109
JSON byte length         : 156789
JSON+zlib byte length    : 45678
Binary is 0.5677 the length of JSON
Binary+zlib is 0.7567 the length of JSON+zlib
Binary+zstd is 0.7030 the length of JSON+zlib
```

## Benchmark Details

### Message Benchmarks (`encoding.ts` / `decoding.ts`)
- Tests full DeltaNet protocol messages (ticks with component deltas)
- Compares binary protocol vs JSON serialization
- Includes compression variants (zlib, zstd)
- Uses realistic game state data

### Integer Benchmarks (`encodingIntegers.ts` / `decodingIntegers.ts`)
- Tests varint encoding vs traditional integer arrays
- Uses signed integers in range ±1024
- Compares with JSON number arrays
- Demonstrates varint efficiency for small numbers

## Contributing

When adding new benchmarks:

1. Follow the naming convention: `encoding*.ts` and `decoding*.ts`
2. Use the same test data for corresponding encode/decode pairs
3. Include both raw and compressed variants
4. Add comprehensive output metrics
5. Update the CLI interface in `index.ts`
6. Document the benchmark purpose and methodology

## Dependencies

- `@mml-io/delta-net-protocol`: Core protocol implementation
- `benchmark`: Performance testing framework
- Node.js built-in `zlib`: Compression support
- TypeScript: Type safety and development experience
