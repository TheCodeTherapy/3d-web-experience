export class ComponentCollection {
  // Internal storage using bigint arrays for unlimited precision
  private targetValues: bigint[];
  private pendingDeltas: bigint[];
  private previousEmittedDeltas: bigint[];
  // Track the current observable value (what existing connections see)
  private currentObservableValues: bigint[];

  // Constants for int64 range
  private static readonly MIN_INT64 = -9223372036854775808n;
  private static readonly MAX_INT64 = 9223372036854775807n;

  public constructor(initialLength: number = 128) {
    this.targetValues = new Array(initialLength).fill(BigInt(0));
    this.pendingDeltas = new Array(initialLength).fill(BigInt(0));
    this.previousEmittedDeltas = new Array(initialLength).fill(BigInt(0));
    this.currentObservableValues = new Array(initialLength).fill(BigInt(0));
  }

  public setLength(length: number): void {
    if (length > this.targetValues.length) {
      // Expand arrays
      while (this.targetValues.length < length) {
        this.targetValues.push(BigInt(0));
        this.pendingDeltas.push(BigInt(0));
        this.previousEmittedDeltas.push(BigInt(0));
        this.currentObservableValues.push(BigInt(0));
      }
    } else if (length < this.targetValues.length) {
      // Truncate arrays
      this.targetValues = this.targetValues.slice(0, length);
      this.pendingDeltas = this.pendingDeltas.slice(0, length);
      this.previousEmittedDeltas = this.previousEmittedDeltas.slice(0, length);
      this.currentObservableValues = this.currentObservableValues.slice(0, length);
    }
  }

  public setValue(index: number, value: bigint): void {
    if (index >= this.targetValues.length) {
      // Work out which power of two would contain the index
      const newLength = Math.pow(2, Math.ceil(Math.log2(index + 1)));
      this.setLength(newLength);
    }

    // Clamp the target value to int64 range for consistency
    const clampedValue = this.clampToInt64(value);

    // Calculate the total delta needed to reach the target value
    const currentValue = this.targetValues[index];
    const totalDelta = clampedValue - currentValue;

    // Add this delta to pending deltas
    this.pendingDeltas[index] += totalDelta;

    // Update target value
    this.targetValues[index] = clampedValue;
  }

  private clampToInt64(value: bigint): bigint {
    if (value > ComponentCollection.MAX_INT64) {
      return ComponentCollection.MAX_INT64;
    }
    if (value < ComponentCollection.MIN_INT64) {
      return ComponentCollection.MIN_INT64;
    }
    return value;
  }

  public tick(): { delta: BigInt64Array; deltaDeltas: BigInt64Array } {
    const length = this.targetValues.length;
    const delta = new BigInt64Array(length);
    const deltaDeltas = new BigInt64Array(length);

    for (let i = 0; i < length; i++) {
      // Determine how much delta we can emit this tick (clamped to int64 range)
      const pendingDelta = this.pendingDeltas[i];
      const emittableDelta = this.clampToInt64(pendingDelta);

      // Store the emitted delta
      delta[i] = emittableDelta;

      // Calculate delta delta (change in delta from previous tick)
      // We need to be careful here to avoid overflow in BigInt64Array
      const deltaDelta = emittableDelta - this.previousEmittedDeltas[i];
      const clampedDeltaDelta = this.clampToInt64(deltaDelta);
      deltaDeltas[i] = clampedDeltaDelta;

      // Update previous emitted delta
      this.previousEmittedDeltas[i] = emittableDelta;

      // Update current observable value (what existing connections see)
      // Clamp to int64 range to ensure consistency with serialization
      this.currentObservableValues[i] = this.clampToInt64(
        this.currentObservableValues[i] + emittableDelta,
      );

      // Reduce pending delta by what we emitted
      this.pendingDeltas[i] -= emittableDelta;
    }

    return { delta, deltaDeltas };
  }

  public removeIndices(sortedUnoccupyingIndices: Array<number>) {
    // If there are no indices to remove, return early
    if (sortedUnoccupyingIndices.length === 0) {
      return;
    }

    let writeIndex = 0;
    let skipIndex = 0;

    // Process each element in the array
    for (let readIndex = 0; readIndex < this.targetValues.length; readIndex++) {
      // Skip indices that should be removed
      if (
        skipIndex < sortedUnoccupyingIndices.length &&
        readIndex === sortedUnoccupyingIndices[skipIndex]
      ) {
        skipIndex++;
        continue;
      }

      // Shift values to the left (in-place)
      if (writeIndex !== readIndex) {
        this.targetValues[writeIndex] = this.targetValues[readIndex];
        this.pendingDeltas[writeIndex] = this.pendingDeltas[readIndex];
        this.previousEmittedDeltas[writeIndex] = this.previousEmittedDeltas[readIndex];
        this.currentObservableValues[writeIndex] = this.currentObservableValues[readIndex];
      }

      writeIndex++;
    }

    // Zero out the remaining elements
    for (let i = writeIndex; i < this.targetValues.length; i++) {
      this.targetValues[i] = BigInt(0);
      this.pendingDeltas[i] = BigInt(0);
      this.previousEmittedDeltas[i] = BigInt(0);
      this.currentObservableValues[i] = BigInt(0);
    }
  }

  // Getter for current target values (for testing)
  public getTargetValue(index: number): bigint {
    return this.targetValues[index] || BigInt(0);
  }

  // Getter for pending deltas (for testing)
  public getPendingDelta(index: number): bigint {
    return this.pendingDeltas[index] || BigInt(0);
  }

  // Getter for length (for testing)
  public get length(): number {
    return this.targetValues.length;
  }

  // Get target values as BigInt64Array for serialization
  public getCurrentValuesArray(): BigInt64Array {
    const result = new BigInt64Array(this.targetValues.length);
    for (let i = 0; i < this.targetValues.length; i++) {
      // Clamp to int64 range for BigInt64Array compatibility
      result[i] = this.currentObservableValues[i];
    }
    return result;
  }

  // Get previous emitted deltas as BigInt64Array for serialization
  public getPreviousEmittedDeltasArray(): BigInt64Array {
    const result = new BigInt64Array(this.previousEmittedDeltas.length);
    for (let i = 0; i < this.previousEmittedDeltas.length; i++) {
      result[i] = this.previousEmittedDeltas[i];
    }
    return result;
  }
}
