import { DeflateCompressor, CompressionLibraryChoice } from "./DeflateCompressor";

function toNumberArray(uint8Array: Uint8Array): number[] {
  return Array.from(uint8Array).map((byte) => byte);
}

describe("DeflateCompressor", () => {
  it("should compress and decompress BigInt64Array correctly", () => {
    const testData = new BigInt64Array([
      0n,
      1n,
      -1n,
      42n,
      -42n,
      9223372036854775807n,
      -9223372036854775808n,
    ]);

    const [uncompressed, compressed] = DeflateCompressor.varIntCompress(testData, testData.length);
    const decompressed = DeflateCompressor.varIntDecompress(compressed, testData.length);

    expect(decompressed).toEqual(testData);
    expect(compressed.length).toBeLessThan(uncompressed.length);
  });

  it("should compress and decompress byte arrays correctly", () => {
    const testData = [
      new Uint8Array([1, 2, 3]),
      null,
      new Uint8Array([255, 0, 128]),
      new Uint8Array([]),
      new Uint8Array([42]),
    ];

    const expectedData = [
      new Uint8Array([1, 2, 3]),
      new Uint8Array([]),
      new Uint8Array([255, 0, 128]),
      new Uint8Array([]),
      new Uint8Array([42]),
    ];

    expect(testData.length).toBe(expectedData.length);

    const [, compressed] = DeflateCompressor.varIntBytesCompress(testData, testData.length);
    const decompressed = DeflateCompressor.varIntBytesDecompress(compressed, testData.length);

    for (let i = 0; i < testData.length; i++) {
      expect(toNumberArray(decompressed[i])).toEqual(toNumberArray(expectedData[i]));
    }
  });

  it("should provide reasonable compression ratios", () => {
    const repetitiveData = new BigInt64Array(100);
    for (let i = 0; i < 100; i++) {
      repetitiveData[i] = BigInt(i % 10);
    }

    const [uncompressed, compressed] = DeflateCompressor.varIntCompress(
      repetitiveData,
      repetitiveData.length,
    );

    const compressionRatio = compressed.length / uncompressed.length;
    expect(compressionRatio).toBeLessThan(0.3);
  });

  describe("Compression Library Compatibility", () => {
    const testData = new BigInt64Array([
      0n,
      1n,
      -1n,
      42n,
      -42n,
      9223372036854775807n,
      -9223372036854775808n,
      100n,
      200n,
      -100n,
      -200n,
    ]);

    const testBytesData = [
      new Uint8Array([1, 2, 3, 4, 5]),
      null,
      new Uint8Array([255, 0, 128, 64]),
      new Uint8Array([]),
      new Uint8Array([42, 43, 44]),
      new Uint8Array([100, 200]),
    ];

    it("should compress with pako and decompress with node zlib for BigInt64Array", () => {
      const [, pakoCompressed] = DeflateCompressor.varIntCompress(
        testData,
        testData.length,
        CompressionLibraryChoice.PAKO,
      );

      const nodeDecompressed = DeflateCompressor.varIntDecompress(
        pakoCompressed,
        testData.length,
        CompressionLibraryChoice.NODE_ZLIB,
      );

      expect(nodeDecompressed).toEqual(testData);
    });

    it("should compress with node zlib and decompress with pako for BigInt64Array", () => {
      const [, nodeCompressed] = DeflateCompressor.varIntCompress(
        testData,
        testData.length,
        CompressionLibraryChoice.NODE_ZLIB,
      );

      const pakoDecompressed = DeflateCompressor.varIntDecompress(
        nodeCompressed,
        testData.length,
        CompressionLibraryChoice.PAKO,
      );

      expect(pakoDecompressed).toEqual(testData);
    });

    it("should compress with pako and decompress with node zlib for byte arrays", () => {
      const expectedData = [
        new Uint8Array([1, 2, 3, 4, 5]),
        new Uint8Array([]),
        new Uint8Array([255, 0, 128, 64]),
        new Uint8Array([]),
        new Uint8Array([42, 43, 44]),
        new Uint8Array([100, 200]),
      ];

      const [, pakoCompressed] = DeflateCompressor.varIntBytesCompress(
        testBytesData,
        testBytesData.length,
        CompressionLibraryChoice.PAKO,
      );

      const nodeDecompressed = DeflateCompressor.varIntBytesDecompress(
        pakoCompressed,
        testBytesData.length,
        CompressionLibraryChoice.NODE_ZLIB,
      );

      for (let i = 0; i < testBytesData.length; i++) {
        expect(toNumberArray(nodeDecompressed[i])).toEqual(toNumberArray(expectedData[i]));
      }
    });

    it("should compress with node zlib and decompress with pako for byte arrays", () => {
      const expectedData = [
        new Uint8Array([1, 2, 3, 4, 5]),
        new Uint8Array([]),
        new Uint8Array([255, 0, 128, 64]),
        new Uint8Array([]),
        new Uint8Array([42, 43, 44]),
        new Uint8Array([100, 200]),
      ];

      const [, nodeCompressed] = DeflateCompressor.varIntBytesCompress(
        testBytesData,
        testBytesData.length,
        CompressionLibraryChoice.NODE_ZLIB,
      );

      const pakoDecompressed = DeflateCompressor.varIntBytesDecompress(
        nodeCompressed,
        testBytesData.length,
        CompressionLibraryChoice.PAKO,
      );

      for (let i = 0; i < testBytesData.length; i++) {
        expect(toNumberArray(pakoDecompressed[i])).toEqual(toNumberArray(expectedData[i]));
      }
    });

    it("should produce identical results when using the same library for compression and decompression", () => {
      // Test pako consistency
      const [, pakoCompressed] = DeflateCompressor.varIntCompress(
        testData,
        testData.length,
        CompressionLibraryChoice.PAKO,
      );
      const pakoDecompressed = DeflateCompressor.varIntDecompress(
        pakoCompressed,
        testData.length,
        CompressionLibraryChoice.PAKO,
      );

      // Test node zlib consistency
      const [, nodeCompressed] = DeflateCompressor.varIntCompress(
        testData,
        testData.length,
        CompressionLibraryChoice.NODE_ZLIB,
      );
      const nodeDecompressed = DeflateCompressor.varIntDecompress(
        nodeCompressed,
        testData.length,
        CompressionLibraryChoice.NODE_ZLIB,
      );

      expect(pakoDecompressed).toEqual(testData);
      expect(nodeDecompressed).toEqual(testData);
      expect(pakoDecompressed).toEqual(nodeDecompressed);
    });

    it("should handle edge cases with both compression libraries", () => {
      const edgeCases = [
        new BigInt64Array([]), // Empty array
        new BigInt64Array([0n]), // Single zero
        new BigInt64Array([1n]), // Single positive
        new BigInt64Array([-1n]), // Single negative
        new BigInt64Array([9223372036854775807n]), // Max value
        new BigInt64Array([-9223372036854775808n]), // Min value
      ];

      for (const edgeCase of edgeCases) {
        if (edgeCase.length === 0) continue; // Skip empty arrays for this test

        // Test pako -> node zlib
        const [, pakoCompressed] = DeflateCompressor.varIntCompress(
          edgeCase,
          edgeCase.length,
          CompressionLibraryChoice.PAKO,
        );
        const nodeDecompressed = DeflateCompressor.varIntDecompress(
          pakoCompressed,
          edgeCase.length,
          CompressionLibraryChoice.NODE_ZLIB,
        );

        // Test node zlib -> pako
        const [, nodeCompressed] = DeflateCompressor.varIntCompress(
          edgeCase,
          edgeCase.length,
          CompressionLibraryChoice.NODE_ZLIB,
        );
        const pakoDecompressed = DeflateCompressor.varIntDecompress(
          nodeCompressed,
          edgeCase.length,
          CompressionLibraryChoice.PAKO,
        );

        expect(nodeDecompressed).toEqual(edgeCase);
        expect(pakoDecompressed).toEqual(edgeCase);
      }
    });

    it("should handle large datasets with both compression libraries", () => {
      // Create a large dataset with repetitive patterns (should compress well)
      const largeData = new BigInt64Array(1000);
      for (let i = 0; i < 1000; i++) {
        largeData[i] = BigInt(i % 100); // Create repeating pattern
      }

      // Test cross-compatibility with large data
      const [, pakoCompressed] = DeflateCompressor.varIntCompress(
        largeData,
        largeData.length,
        CompressionLibraryChoice.PAKO,
      );
      const nodeDecompressed = DeflateCompressor.varIntDecompress(
        pakoCompressed,
        largeData.length,
        CompressionLibraryChoice.NODE_ZLIB,
      );

      const [, nodeCompressed] = DeflateCompressor.varIntCompress(
        largeData,
        largeData.length,
        CompressionLibraryChoice.NODE_ZLIB,
      );
      const pakoDecompressed = DeflateCompressor.varIntDecompress(
        nodeCompressed,
        largeData.length,
        CompressionLibraryChoice.PAKO,
      );

      expect(nodeDecompressed).toEqual(largeData);
      expect(pakoDecompressed).toEqual(largeData);

      // Both should achieve reasonable compression
      const originalSize = largeData.length * 8; // 8 bytes per BigInt64
      expect(pakoCompressed.length).toBeLessThan(originalSize * 0.5);
      expect(nodeCompressed.length).toBeLessThan(originalSize * 0.5);
    });
  });
});
