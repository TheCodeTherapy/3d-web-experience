import { StateCollection } from "./StateCollection";

describe("StateCollection", () => {
  it("should initialize with an empty array", () => {
    const collection = new StateCollection();
    expect(collection.values.length).toBe(0);
  });

  it("should set value correctly", () => {
    const collection = new StateCollection();
    collection.setValue(0, new Uint8Array([118, 97, 108, 117, 101, 48]));
    collection.setValue(2, new Uint8Array([118, 97, 108, 117, 101, 49]));
    expect(collection.values[0]).toStrictEqual(new Uint8Array([118, 97, 108, 117, 101, 48]));
    expect(collection.values[2]).toStrictEqual(new Uint8Array([118, 97, 108, 117, 101, 49]));
  });

  it("should tick and provide modified states", () => {
    const collection = new StateCollection();
    collection.setValue(0, new Uint8Array([118, 97, 108, 117, 101, 48]));
    collection.setValue(2, new Uint8Array([118, 97, 108, 117, 101, 49]));

    const states = collection.tick();

    expect(states.length).toStrictEqual(2);
    expect(states).toContainEqual([0, new Uint8Array([118, 97, 108, 117, 101, 48])]);
    expect(states).toContainEqual([2, new Uint8Array([118, 97, 108, 117, 101, 49])]);

    // After tick, should return empty array since nothing was modified
    const emptyStates = collection.tick();
    expect(emptyStates.length).toBe(0);

    // Set new value after tick
    collection.setValue(1, new Uint8Array([118, 97, 108, 117, 101, 49]));
    const newStates = collection.tick();
    expect(newStates.length).toStrictEqual(1);
    expect(newStates).toContainEqual([1, new Uint8Array([118, 97, 108, 117, 101, 49])]);
  });

  it("should handle null values", () => {
    const collection = new StateCollection();
    collection.setValue(0, null);

    const states = collection.tick();

    expect(states.length).toStrictEqual(1);
    expect(states).toContainEqual([0, new Uint8Array([])]);
  });

  it("should remove indices and shift values correctly", () => {
    const collection = new StateCollection();
    collection.setValue(0, new Uint8Array([118, 97, 108, 117, 101, 48]));
    collection.setValue(1, new Uint8Array([118, 97, 108, 117, 101, 49]));
    collection.setValue(2, new Uint8Array([118, 97, 108, 117, 101, 50]));
    collection.setValue(3, new Uint8Array([118, 97, 108, 117, 101, 51]));
    collection.setValue(4, new Uint8Array([118, 97, 108, 117, 101, 52]));
    collection.setValue(5, new Uint8Array([118, 97, 108, 117, 101, 53]));

    // Tick to clear modified indices
    collection.tick();

    // Modify some values to populate modified indices
    collection.setValue(1, new Uint8Array([117, 112, 100, 97, 116, 101, 100, 49]));
    collection.setValue(3, new Uint8Array([117, 112, 100, 97, 116, 101, 100, 51]));
    collection.setValue(5, new Uint8Array([117, 112, 100, 97, 116, 101, 100, 53]));

    // Remove indices 0, 2, 4
    collection.removeIndices([0, 2, 4]);

    // Check that values are shifted correctly
    // Original: ["value0", "updated1", "value2", "updated3", "value4", "updated5"]
    // After removing 0, 2, 4: ["updated1", "updated3", "updated5", null, null, null]
    expect(collection.values[0]).toStrictEqual(
      new Uint8Array([117, 112, 100, 97, 116, 101, 100, 49]),
    );
    expect(collection.values[1]).toStrictEqual(
      new Uint8Array([117, 112, 100, 97, 116, 101, 100, 51]),
    );
    expect(collection.values[2]).toStrictEqual(
      new Uint8Array([117, 112, 100, 97, 116, 101, 100, 53]),
    );
    expect(collection.values[3]).toStrictEqual(new Uint8Array([]));
    expect(collection.values[4]).toStrictEqual(new Uint8Array([]));
    expect(collection.values[5]).toStrictEqual(new Uint8Array([]));

    // Check that the modified indices are updated correctly
    const states = collection.tick();
    expect(states.length).toStrictEqual(3);
    expect(states).toContainEqual([0, new Uint8Array([117, 112, 100, 97, 116, 101, 100, 49])]);
    expect(states).toContainEqual([1, new Uint8Array([117, 112, 100, 97, 116, 101, 100, 51])]);
    expect(states).toContainEqual([2, new Uint8Array([117, 112, 100, 97, 116, 101, 100, 53])]);

    // After tick, should be no modified indices
    const emptyStates = collection.tick();
    expect(emptyStates.length).toBe(0);
  });

  it("should handle empty array when removing indices", () => {
    const collection = new StateCollection();
    collection.removeIndices([]);
    expect(collection.values.length).toBe(0);
  });

  it("should handle removing all indices", () => {
    const collection = new StateCollection();
    collection.setValue(0, new Uint8Array([118, 97, 108, 117, 101, 48]));
    collection.setValue(1, new Uint8Array([118, 97, 108, 117, 101, 49]));

    collection.removeIndices([0, 1]);

    expect(collection.values[0]).toStrictEqual(new Uint8Array([]));
    expect(collection.values[1]).toStrictEqual(new Uint8Array([]));

    const states = collection.tick();
    expect(states.length).toBe(0);
  });

  it("should return updated indices after values are modified and indices are shifted", () => {
    const collection = new StateCollection();

    // Set initial values
    collection.setValue(0, new Uint8Array([118, 97, 108, 117, 101, 48])); // "value0"
    collection.setValue(1, new Uint8Array([118, 97, 108, 117, 101, 49])); // "value1"
    collection.setValue(2, new Uint8Array([118, 97, 108, 117, 101, 50])); // "value2"
    collection.setValue(3, new Uint8Array([118, 97, 108, 117, 101, 51])); // "value3"
    collection.setValue(4, new Uint8Array([118, 97, 108, 117, 101, 52])); // "value4"

    // Tick to clear modified indices
    collection.tick();

    // Modify values at indices 1 and 3
    collection.setValue(1, new Uint8Array([109, 111, 100, 105, 102, 105, 101, 100, 49])); // "modified1"
    collection.setValue(3, new Uint8Array([109, 111, 100, 105, 102, 105, 101, 100, 51])); // "modified3"

    // Remove index 0 (this should shift all subsequent indices down by 1)
    collection.removeIndices([0, 2]);

    // After removing index 0:
    // - Original index 1 (with "modified1") should now be at index 0
    // - Original index 3 (with "modified3") should now be at index 1
    const states = collection.tick();

    expect(states.length).toBe(2);
    expect(states).toContainEqual([
      0,
      new Uint8Array([109, 111, 100, 105, 102, 105, 101, 100, 49]),
    ]); // "modified1" now at index 0
    expect(states).toContainEqual([
      1,
      new Uint8Array([109, 111, 100, 105, 102, 105, 101, 100, 51]),
    ]); // "modified3" now at index 2
  });
});
