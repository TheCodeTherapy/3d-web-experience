import { ComponentCollection } from "./ComponentCollection";

describe("ComponentCollection", () => {
  it("should initialize with the correct length", () => {
    const collection = new ComponentCollection(5);
    expect(collection.length).toBe(5);
  });

  it("should set length correctly", () => {
    const collection = new ComponentCollection(5);
    collection.setLength(10);
    expect(collection.length).toBe(10);
    collection.setLength(3);
    expect(collection.length).toBe(3);
  });

  it("should set value correctly", () => {
    const collection = new ComponentCollection(5);
    collection.setValue(0, BigInt(7));
    collection.setValue(2, BigInt(4));
    expect(collection.getTargetValue(0)).toBe(BigInt(7));
    expect(collection.getTargetValue(2)).toBe(BigInt(4));
    expect(collection.getPendingDelta(0)).toBe(BigInt(7));
    expect(collection.getPendingDelta(2)).toBe(BigInt(4));
  });

  it("should tick and provide delta", () => {
    const collection = new ComponentCollection(5);
    collection.setValue(0, BigInt(7));
    collection.setValue(2, BigInt(4));
    expect(collection.getTargetValue(0)).toBe(BigInt(7));
    expect(collection.getTargetValue(2)).toBe(BigInt(4));

    const { delta, deltaDeltas } = collection.tick();
    expect(delta[0]).toBe(BigInt(7));
    expect(delta[2]).toBe(BigInt(4));
    expect(deltaDeltas[0]).toBe(BigInt(7));
    expect(deltaDeltas[2]).toBe(BigInt(4));

    // Check that pending deltas are reset after emission
    expect(collection.getPendingDelta(0)).toBe(BigInt(0));
    expect(collection.getPendingDelta(2)).toBe(BigInt(0));

    // Set new values
    collection.setValue(0, BigInt(10));
    collection.setValue(2, BigInt(8));
    expect(collection.getTargetValue(0)).toBe(BigInt(10));
    expect(collection.getTargetValue(2)).toBe(BigInt(8));
    expect(collection.getPendingDelta(0)).toBe(BigInt(3)); // 10 - 7
    expect(collection.getPendingDelta(2)).toBe(BigInt(4)); // 8 - 4

    // Set a value again before ticking
    collection.setValue(0, BigInt(12));
    expect(collection.getTargetValue(0)).toBe(BigInt(12));
    expect(collection.getPendingDelta(0)).toBe(BigInt(5)); // 12 - 7

    const { delta: secondDelta, deltaDeltas: secondDeltaDeltas } = collection.tick();
    expect(secondDelta[0]).toBe(BigInt(5)); // 12 - 7
    expect(secondDelta[2]).toBe(BigInt(4)); // 8 - 4
    expect(secondDeltaDeltas[0]).toBe(BigInt(-2)); // 5 - 7 (change from previous emission)
    expect(secondDeltaDeltas[2]).toBe(BigInt(0)); // 4 - 4 (no change)
  });

  it("should automatically resize when index is out of bounds", () => {
    const collection = new ComponentCollection(5);
    // Instead of throwing an error, it should automatically resize
    collection.setValue(5, BigInt(10));
    // Check that the array was resized to fit the new index
    expect(collection.length).toBeGreaterThanOrEqual(6);
    expect(collection.getTargetValue(5)).toBe(BigInt(10));
  });

  it("should remove indices and shift values correctly", () => {
    const collection = new ComponentCollection(6);
    collection.setValue(0, BigInt(100));
    collection.setValue(1, BigInt(200));
    collection.setValue(2, BigInt(300));
    collection.setValue(3, BigInt(400));
    collection.setValue(4, BigInt(500));
    collection.setValue(5, BigInt(600));

    // Apply some new values to create deltas
    collection.tick(); // Reset deltas
    collection.setValue(0, BigInt(101)); // Delta: +1
    collection.setValue(1, BigInt(202)); // Delta: +2
    collection.setValue(2, BigInt(303)); // Delta: +3
    collection.setValue(3, BigInt(404)); // Delta: +4
    collection.setValue(4, BigInt(505)); // Delta: +5
    collection.setValue(5, BigInt(606)); // Delta: +6

    collection.removeIndices([0, 2, 5]);

    // Original values: [101, 202, 303, 404, 505, 606]
    // Original deltas: [1, 2, 3, 4, 5, 6]
    // After removing indices 0, 2, 5:
    // Values: [202, 404, 505, 0, 0, 0]
    // Deltas: [2, 4, 5, 0, 0, 0]
    expect(collection.getTargetValue(0)).toBe(BigInt(202));
    expect(collection.getTargetValue(1)).toBe(BigInt(404));
    expect(collection.getTargetValue(2)).toBe(BigInt(505));
    expect(collection.getTargetValue(3)).toBe(BigInt(0));
    expect(collection.getTargetValue(4)).toBe(BigInt(0));
    expect(collection.getTargetValue(5)).toBe(BigInt(0));

    expect(collection.getPendingDelta(0)).toBe(BigInt(2));
    expect(collection.getPendingDelta(1)).toBe(BigInt(4));
    expect(collection.getPendingDelta(2)).toBe(BigInt(5));
    expect(collection.getPendingDelta(3)).toBe(BigInt(0));
    expect(collection.getPendingDelta(4)).toBe(BigInt(0));
    expect(collection.getPendingDelta(5)).toBe(BigInt(0));
  });

  it("should handle value going from minimum int64 to maximum int64", () => {
    const minInt64 = -9223372036854775808n;
    const maxInt64 = 9223372036854775807n;
    const collection = new ComponentCollection(1);

    collection.setValue(0, minInt64);
    collection.tick(); // Reset deltas

    collection.setValue(0, maxInt64);

    // The total delta would be maxInt64 - minInt64 = 18446744073709551615n
    // This exceeds max int64, so it should be applied gradually

    // First tick should apply the maximum possible delta
    const { delta: firstDelta, deltaDeltas: firstDeltaDeltas } = collection.tick();
    expect(firstDelta[0]).toBe(9223372036854775807n); // max int64
    expect(firstDeltaDeltas[0]).toBe(9223372036854775807n);

    // There should still be pending delta
    expect(collection.getPendingDelta(0)).toBe(9223372036854775808n); // remaining delta

    // Second tick should apply the remaining delta, but clamped to max int64
    const { delta: secondDelta, deltaDeltas: secondDeltaDeltas } = collection.tick();
    expect(secondDelta[0]).toBe(9223372036854775807n); // max int64 (clamped)
    expect(secondDeltaDeltas[0]).toBe(0n); // no change in emitted delta

    // There should still be a tiny bit of pending delta
    expect(collection.getPendingDelta(0)).toBe(1n); // final bit

    // Third tick should apply the final remaining bit
    const { delta: thirdDelta, deltaDeltas: thirdDeltaDeltas } = collection.tick();
    expect(thirdDelta[0]).toBe(1n); // the final bit
    expect(thirdDeltaDeltas[0]).toBe(-9223372036854775806n); // large negative change

    // Fourth tick should have no more pending deltas
    expect(collection.getPendingDelta(0)).toBe(0n);
    const { delta: fourthDelta, deltaDeltas: fourthDeltaDeltas } = collection.tick();
    expect(fourthDelta[0]).toBe(0n);
    expect(fourthDeltaDeltas[0]).toBe(-1n); // change from 1n to 0n

    // The target value should be correctly set
    expect(collection.getTargetValue(0)).toBe(maxInt64);
  });

  it("should handle near extreme int64 values with large delta", () => {
    const nearMaxInt64 = 8000000000000000000n; // Close to max but not max
    const nearMinInt64 = -8000000000000000000n; // Close to min but not min
    const collection = new ComponentCollection(1);

    collection.setValue(0, nearMinInt64);
    collection.tick(); // Reset deltas

    collection.setValue(0, nearMaxInt64);

    // The total delta would be 16000000000000000000n
    // This exceeds max int64 (9223372036854775807n), so it should be applied gradually

    // First tick should apply the maximum possible delta
    const { delta: firstDelta, deltaDeltas: firstDeltaDeltas } = collection.tick();
    expect(firstDelta[0]).toBe(9223372036854775807n); // max int64
    expect(firstDeltaDeltas[0]).toBe(9223372036854775807n);

    // Check remaining pending delta
    const remainingDelta = 16000000000000000000n - 9223372036854775807n;
    expect(collection.getPendingDelta(0)).toBe(remainingDelta);

    // Second tick should apply the remaining delta
    const { delta: secondDelta, deltaDeltas: secondDeltaDeltas } = collection.tick();
    expect(secondDelta[0]).toBe(remainingDelta);
    expect(secondDeltaDeltas[0]).toBe(remainingDelta - 9223372036854775807n);

    // Third tick should have no more pending deltas
    expect(collection.getPendingDelta(0)).toBe(0n);
    const { delta: thirdDelta, deltaDeltas: thirdDeltaDeltas } = collection.tick();
    expect(thirdDelta[0]).toBe(0n);
    expect(thirdDeltaDeltas[0]).toBe(-remainingDelta);

    // The target value should be correctly set
    expect(collection.getTargetValue(0)).toBe(nearMaxInt64);
  });

  it("should handle negative deltas that exceed int64 minimum", () => {
    const collection = new ComponentCollection(1);

    collection.setValue(0, 5000000000000000000n);
    collection.tick(); // Reset deltas

    collection.setValue(0, -5000000000000000000n);

    // The total delta would be -10000000000000000000n
    // This is less than min int64 (-9223372036854775808n), so it should be applied gradually

    // First tick should apply the minimum possible delta
    const { delta: firstDelta, deltaDeltas: firstDeltaDeltas } = collection.tick();
    expect(firstDelta[0]).toBe(-9223372036854775808n); // min int64
    expect(firstDeltaDeltas[0]).toBe(-9223372036854775808n);

    // Check remaining pending delta
    const remainingDelta = -10000000000000000000n - -9223372036854775808n;
    expect(collection.getPendingDelta(0)).toBe(remainingDelta);

    // Second tick should apply the remaining delta
    const { delta: secondDelta, deltaDeltas: secondDeltaDeltas } = collection.tick();
    expect(secondDelta[0]).toBe(remainingDelta);
    expect(secondDeltaDeltas[0]).toBe(remainingDelta - -9223372036854775808n);

    // Third tick should have no more pending deltas
    expect(collection.getPendingDelta(0)).toBe(0n);

    // The target value should be correctly set
    expect(collection.getTargetValue(0)).toBe(-5000000000000000000n);
  });

  it("should provide consistent values for initial checkout vs existing connections with large deltas", () => {
    const collection = new ComponentCollection(1);

    // Set to negative max int64 value
    const minInt64 = -9223372036854775808n;
    const maxInt64 = 9223372036854775807n;

    collection.setValue(0, minInt64);
    collection.tick(); // Apply the initial value, now existing connections see minInt64

    // Now set to positive max int64 value
    // The delta needed: maxInt64 - minInt64 = 18446744073709551615n
    // This exceeds max int64, so it will be applied over multiple ticks
    collection.setValue(0, maxInt64);

    // Simulate existing connections applying the first tick of the large delta
    let currentObservedValue = minInt64;
    const { delta: firstDelta } = collection.tick();
    const firstDeltaValue = firstDelta[0];

    expect(firstDeltaValue).toBe(maxInt64); // First tick applies max int64 delta

    currentObservedValue += firstDeltaValue;
    // Existing connections see the intermediate value of -1n
    expect(currentObservedValue).toBe(-1n);

    // At this point, existing connections see an intermediate value
    const pendingDeltaRemaining = collection.getPendingDelta(0);
    expect(pendingDeltaRemaining).toBe(9223372036854775808n);

    // NOW a new connection joins and wants to check out
    // They should get the same intermediate value that existing connections see
    const newConnectionCheckoutValue = collection.getCurrentValuesArray()[0];
    expect(newConnectionCheckoutValue).toBe(-1n);
    expect(newConnectionCheckoutValue).toBe(currentObservedValue);
    expect(collection.getPendingDelta(0)).toBe(9223372036854775808n);

    const { delta: secondDelta } = collection.tick();
    const secondDeltaValue = secondDelta[0];
    expect(secondDeltaValue).toBe(9223372036854775807n); // Second tick applies remaining delta

    const secondCheckoutValue = collection.getCurrentValuesArray()[0];
    expect(secondCheckoutValue).toBe(9223372036854775806n); // Still not max int64
    currentObservedValue += secondDeltaValue;
    expect(currentObservedValue).toBe(9223372036854775806n); // Existing connections see the same as checkout value

    expect(collection.getPendingDelta(0)).toBe(1n);

    const { delta: thirdDelta } = collection.tick();
    const thirdDeltaValue = thirdDelta[0];
    expect(thirdDeltaValue).toBe(1n); // Third tick applies remaining delta

    const thirdCheckoutValue = collection.getCurrentValuesArray()[0];
    expect(thirdCheckoutValue).toBe(9223372036854775807n);
    currentObservedValue += thirdDeltaValue;
    expect(currentObservedValue).toBe(9223372036854775807n); // Existing connections see desired value

    expect(collection.getPendingDelta(0)).toBe(0n); // No more pending deltas
  });
});
