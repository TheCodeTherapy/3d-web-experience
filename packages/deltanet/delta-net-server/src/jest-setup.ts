// Custom BigInt serializer for Jest
expect.addSnapshotSerializer({
  test: (val: any): val is bigint => typeof val === "bigint",
  print: (val: bigint): string => `${val}n`,
});

// Also handle BigInt values in regular matchers
expect.extend({
  toBeBigInt(received: any, expected: bigint) {
    const pass = typeof received === "bigint" && received === expected;
    if (pass) {
      return {
        message: () => `expected ${received} not to be ${expected}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be ${expected}`,
        pass: false,
      };
    }
  },
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toBeBigInt(expected: bigint): R;
    }
  }
}

export {};
