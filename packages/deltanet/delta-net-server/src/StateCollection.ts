const emptyUint8Array = new Uint8Array(0);

export class StateCollection {
  public values: Array<Uint8Array>;
  private modifiedIndices = new Set<number>();

  public constructor() {
    this.values = new Array<Uint8Array>();
  }

  public setValue(index: number, value: Uint8Array | null): void {
    if (value === null) {
      value = emptyUint8Array;
    }
    this.modifiedIndices.add(index);
    this.values[index] = value;
  }

  public tick(): Array<[number, Uint8Array]> {
    const states: Array<[number, Uint8Array]> = [];
    for (const index of this.modifiedIndices) {
      const value = this.values[index];
      if (value === null) {
        states.push([index, new Uint8Array(0)]);
      } else {
        states.push([index, value]);
      }
    }
    this.modifiedIndices.clear();
    return states;
  }

  public removeIndices(sortedUnoccupyingIndices: Array<number>) {
    // If there are no indices to remove, return early
    if (sortedUnoccupyingIndices.length === 0) {
      return;
    }

    let writeIndex = 0;
    let skipIndex = 0;

    // Process each element in the array
    for (let readIndex = 0; readIndex < this.values.length; readIndex++) {
      // Skip indices that should be removed
      if (
        skipIndex < sortedUnoccupyingIndices.length &&
        readIndex === sortedUnoccupyingIndices[skipIndex]
      ) {
        // Remove from modified indices if present
        this.modifiedIndices.delete(readIndex);
        skipIndex++;
        continue;
      }

      // If we're going to shift this element, update the modified indices
      if (writeIndex !== readIndex && this.modifiedIndices.has(readIndex)) {
        this.modifiedIndices.delete(readIndex);
        this.modifiedIndices.add(writeIndex);
      }

      // Shift values to the left (in-place)
      if (writeIndex !== readIndex) {
        this.values[writeIndex] = this.values[readIndex];
      }

      writeIndex++;
    }

    // Clear the remaining elements
    for (let i = writeIndex; i < this.values.length; i++) {
      this.values[i] = emptyUint8Array;
      this.modifiedIndices.delete(i);
    }
  }
}
