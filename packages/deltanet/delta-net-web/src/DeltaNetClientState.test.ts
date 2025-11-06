import { DeltaNetClientState } from "./DeltaNetClientState";
import {
  DeltaNetClientWebsocketInitialCheckout,
  DeltaNetClientWebsocketTick,
} from "./DeltaNetClientWebsocket";

describe("DeltaNetClientState", () => {
  let clientState: DeltaNetClientState;

  beforeEach(() => {
    clientState = new DeltaNetClientState();
  });

  describe("Initial State", () => {
    it("should initialize with empty state", () => {
      expect(clientState.getComponentValues()).toEqual(new Map());
      expect(clientState.getAllStates()).toEqual(new Map());
      expect(clientState.getLocalClientIndex()).toBe(-1);
      expect(clientState.getIndicesCount()).toBe(0);
      expect(clientState.getStableIds()).toEqual([]);
    });
  });

  describe("Initial Checkout", () => {
    it("should handle initial checkout", () => {
      const initialCheckout: DeltaNetClientWebsocketInitialCheckout = {
        indicesCount: 2,
        initialComponents: new Map([
          [
            1,
            {
              values: new BigInt64Array([BigInt(100), BigInt(200)]),
              deltas: new BigInt64Array([BigInt(0), BigInt(0)]),
            },
          ],
        ]),
        initialStates: new Map([
          [
            1,
            [
              new Uint8Array([115, 116, 97, 116, 101, 49]),
              new Uint8Array([115, 116, 97, 116, 101, 50]),
            ],
          ],
        ]),
      };

      const { addedStableIds } = clientState.handleInitialCheckout(initialCheckout);

      expect(clientState.getIndicesCount()).toBe(2);
      expect(clientState.getStableIds().length).toBe(2);
      expect(addedStableIds.length).toBe(2);

      const componentValues = clientState.getComponentValues();
      expect(componentValues.get(1)?.values[0]).toBe(BigInt(100));
      expect(componentValues.get(1)?.values[1]).toBe(BigInt(200));

      const states = clientState.getStateById(1);
      expect(states).toEqual([
        new Uint8Array([115, 116, 97, 116, 101, 49]),
        new Uint8Array([115, 116, 97, 116, 101, 50]),
      ]);

      const stableIds = clientState.getStableIds();
      expect(clientState.byStableId.size).toBe(2);

      const user1 = clientState.byStableId.get(stableIds[0]);
      expect(user1).toBeDefined();
      expect(user1?.components.get(1)).toBe(BigInt(100));
      expect(user1?.states.get(1)).toStrictEqual(new Uint8Array([115, 116, 97, 116, 101, 49]));

      const user2 = clientState.byStableId.get(stableIds[1]);
      expect(user2).toBeDefined();
      expect(user2?.components.get(1)).toBe(BigInt(200));
      expect(user2?.states.get(1)).toStrictEqual(new Uint8Array([115, 116, 97, 116, 101, 50]));
    });
  });

  describe("Tick Updates", () => {
    beforeEach(() => {
      const initialCheckout: DeltaNetClientWebsocketInitialCheckout = {
        indicesCount: 3,
        initialComponents: new Map([
          [
            1,
            {
              values: new BigInt64Array([BigInt(100), BigInt(200), BigInt(300)]),
              deltas: new BigInt64Array([BigInt(0), BigInt(0), BigInt(0)]),
            },
          ],
        ]),
        initialStates: new Map(),
      };
      clientState.handleInitialCheckout(initialCheckout);
    });

    it("should handle component updates", () => {
      const tick: DeltaNetClientWebsocketTick = {
        indicesCount: 3,
        unoccupying: [],
        componentDeltaDeltas: new Map([
          [1, new BigInt64Array([BigInt(10), BigInt(20), BigInt(30)])],
        ]),
        stateChanges: new Map(),
      };

      const { stateUpdates } = clientState.handleTick(tick);
      expect(stateUpdates.length).toBe(0);

      const componentValues = clientState.getComponentValues();
      expect(componentValues.get(1)?.values[0]).toBe(BigInt(110));
      expect(componentValues.get(1)?.values[1]).toBe(BigInt(220));
      expect(componentValues.get(1)?.values[2]).toBe(BigInt(330));

      const stableIds = clientState.getStableIds();
      expect(clientState.byStableId.size).toBe(3);

      const user1 = clientState.byStableId.get(stableIds[0]);
      expect(user1?.components.get(1)).toBe(BigInt(110));

      const user2 = clientState.byStableId.get(stableIds[1]);
      expect(user2?.components.get(1)).toBe(BigInt(220));

      const user3 = clientState.byStableId.get(stableIds[2]);
      expect(user3?.components.get(1)).toBe(BigInt(330));
    });

    it("should handle state changes", () => {
      const tick: DeltaNetClientWebsocketTick = {
        indicesCount: 3,
        unoccupying: [],
        componentDeltaDeltas: new Map(),
        stateChanges: new Map([
          [
            1,
            new Map([
              [0, new Uint8Array([110, 101, 119, 83, 116, 97, 116, 101, 49])],
              [1, new Uint8Array([])],
            ]),
          ],
        ]),
      };

      const { stateUpdates } = clientState.handleTick(tick);

      expect(stateUpdates.length).toBe(2);
      expect(stateUpdates[0].state).toStrictEqual(
        new Uint8Array([110, 101, 119, 83, 116, 97, 116, 101, 49]),
      );
      expect(stateUpdates[1].state).toStrictEqual(new Uint8Array([]));

      const states = clientState.getStateById(1);
      expect(states?.[0]).toStrictEqual(new Uint8Array([110, 101, 119, 83, 116, 97, 116, 101, 49]));
      expect(states?.[1]).toStrictEqual(new Uint8Array([]));

      const stableIds = clientState.getStableIds();
      expect(clientState.byStableId.size).toBe(3);

      const user1 = clientState.byStableId.get(stableIds[0]);
      expect(user1?.states.get(1)).toStrictEqual(
        new Uint8Array([110, 101, 119, 83, 116, 97, 116, 101, 49]),
      );

      const user2 = clientState.byStableId.get(stableIds[1]);
      expect(user2?.states.get(1)).toStrictEqual(new Uint8Array([]));

      const user3 = clientState.byStableId.get(stableIds[2]);
      expect(user3?.states.get(1)).toBeUndefined();
    });

    it("should handle unoccupying indices", () => {
      const tick: DeltaNetClientWebsocketTick = {
        indicesCount: 2,
        unoccupying: [1],
        componentDeltaDeltas: new Map(),
        stateChanges: new Map(),
      };

      clientState.handleTick(tick);

      expect(clientState.getIndicesCount()).toBe(2);
      expect(clientState.getStableIds().length).toBe(2);

      expect(clientState.byStableId.size).toBe(2);
      const stableIds = clientState.getStableIds();

      const user1 = clientState.byStableId.get(stableIds[0]);
      expect(user1).toBeDefined();

      const user2 = clientState.byStableId.get(stableIds[1]);
      expect(user2).toBeDefined();
      expect(user2?.stableId).toBe(stableIds[1]);
    });
  });

  describe("User Management", () => {
    beforeEach(() => {
      const initialCheckout: DeltaNetClientWebsocketInitialCheckout = {
        indicesCount: 2,
        initialComponents: new Map([
          [
            1,
            {
              values: new BigInt64Array([BigInt(100), BigInt(200)]),
              deltas: new BigInt64Array([BigInt(0), BigInt(0)]),
            },
          ],
        ]),
        initialStates: new Map(),
      };
      clientState.handleInitialCheckout(initialCheckout);
    });

    it("should set and get local client index", () => {
      clientState.setLocalIndex(5);
      expect(clientState.getLocalClientIndex()).toBe(5);
    });

    it("should get component value for stable ID", () => {
      const stableId = clientState.getStableIds()[0];
      const value = clientState.getComponentValueForStableId(stableId, 1);
      expect(value).toBe(BigInt(100));
    });

    it("should get all components for stable ID", () => {
      const stableId = clientState.getStableIds()[0];
      const components = clientState.getComponentsForStableId(stableId);
      expect(components?.get(1)).toBe(BigInt(100));
    });
  });

  describe("Reset", () => {
    it("should reset to initial state", () => {
      const initialCheckout: DeltaNetClientWebsocketInitialCheckout = {
        indicesCount: 2,
        initialComponents: new Map([
          [
            1,
            {
              values: new BigInt64Array([BigInt(100), BigInt(200)]),
              deltas: new BigInt64Array([BigInt(0), BigInt(0)]),
            },
          ],
        ]),
        initialStates: new Map([
          [
            1,
            [
              new Uint8Array([115, 116, 97, 116, 101, 49]),
              new Uint8Array([115, 116, 97, 116, 101, 50]),
            ],
          ],
        ]),
      };
      clientState.handleInitialCheckout(initialCheckout);

      expect(clientState.getIndicesCount()).toBe(2);
      expect(clientState.getStableIds().length).toBe(2);
      expect(clientState.getComponentValues().size).toBe(1);
      expect(clientState.getAllStates().size).toBe(1);
      expect(clientState.byStableId.size).toBe(2);

      clientState.reset();

      expect(clientState.getComponentValues()).toEqual(new Map());
      expect(clientState.getAllStates()).toEqual(new Map());
      expect(clientState.getLocalClientIndex()).toBe(-1);
      expect(clientState.getIndicesCount()).toBe(0);
      expect(clientState.getStableIds()).toEqual([]);
      expect(clientState.byStableId.size).toBe(0);
    });

    it("should handle reconnection with deterministic stable IDs", () => {
      const initialCheckout1: DeltaNetClientWebsocketInitialCheckout = {
        indicesCount: 2,
        initialComponents: new Map([
          [
            1,
            {
              values: new BigInt64Array([BigInt(100), BigInt(200)]),
              deltas: new BigInt64Array([BigInt(0), BigInt(0)]),
            },
          ],
        ]),
        initialStates: new Map([
          [
            1,
            [
              new Uint8Array([115, 116, 97, 116, 101, 49]),
              new Uint8Array([115, 116, 97, 116, 101, 50]),
            ],
          ],
        ]),
      };
      clientState.handleInitialCheckout(initialCheckout1);
      const stableIds1 = clientState.getStableIds();

      expect(clientState.getComponentValues().size).toBe(1);
      expect(clientState.getAllStates().size).toBe(1);
      expect(clientState.byStableId.size).toBe(2);

      clientState.reset();

      expect(clientState.getComponentValues().size).toBe(0);
      expect(clientState.getAllStates().size).toBe(0);
      expect(clientState.byStableId.size).toBe(0);

      const initialCheckout2: DeltaNetClientWebsocketInitialCheckout = {
        indicesCount: 2,
        initialComponents: new Map(),
        initialStates: new Map(),
      };
      clientState.handleInitialCheckout(initialCheckout2);
      const stableIds2 = clientState.getStableIds();

      expect(stableIds2[0]).toBe(1000);
      expect(stableIds2[1]).toBe(1001);
      expect(stableIds2.length).toBe(2);
      expect(clientState.byStableId.size).toBe(2);

      expect(stableIds2[0]).toBe(stableIds1[0]);
      expect(stableIds2[1]).toBe(stableIds1[1]);

      expect(clientState.getComponentValues().size).toBe(0);
      expect(clientState.getAllStates().size).toBe(0);
    });
  });

  describe("Stable ID Management", () => {
    it("should compact stable IDs array after removal", () => {
      const initialCheckout: DeltaNetClientWebsocketInitialCheckout = {
        indicesCount: 4,
        initialComponents: new Map([
          [
            1,
            {
              values: new BigInt64Array([BigInt(100), BigInt(200), BigInt(300), BigInt(400)]),
              deltas: new BigInt64Array([BigInt(0), BigInt(0), BigInt(0), BigInt(0)]),
            },
          ],
        ]),
        initialStates: new Map(),
      };
      clientState.handleInitialCheckout(initialCheckout);

      const initialStableIds = [...clientState.getStableIds()];
      expect(initialStableIds).toEqual([1000, 1001, 1002, 1003]);

      const tick: DeltaNetClientWebsocketTick = {
        indicesCount: 3,
        unoccupying: [1],
        componentDeltaDeltas: new Map(),
        stateChanges: new Map(),
      };

      clientState.handleTick(tick);

      const finalStableIds = clientState.getStableIds();

      expect(finalStableIds).toEqual([1000, 1002, 1003]);
      expect(finalStableIds.length).toBe(3);
      expect(new Set(finalStableIds).size).toBe(3);
    });

    it("should maintain unique stable IDs with simultaneous removal and addition", () => {
      const initialCheckout: DeltaNetClientWebsocketInitialCheckout = {
        indicesCount: 4,
        initialComponents: new Map([
          [
            1,
            {
              values: new BigInt64Array([BigInt(100), BigInt(200), BigInt(300), BigInt(400)]),
              deltas: new BigInt64Array([BigInt(0), BigInt(0), BigInt(0), BigInt(0)]),
            },
          ],
        ]),
        initialStates: new Map(),
      };
      clientState.handleInitialCheckout(initialCheckout);

      const initialStableIds = [...clientState.getStableIds()];
      expect(initialStableIds).toEqual([1000, 1001, 1002, 1003]);

      const tick: DeltaNetClientWebsocketTick = {
        indicesCount: 4,
        unoccupying: [1],
        componentDeltaDeltas: new Map(),
        stateChanges: new Map(),
      };

      clientState.handleTick(tick);

      const finalStableIds = clientState.getStableIds();

      expect(finalStableIds.length).toBe(4);
      expect(new Set(finalStableIds).size).toBe(4);

      const duplicates = finalStableIds.filter((id, index) => finalStableIds.indexOf(id) !== index);
      expect(duplicates).toEqual([]);
    });

    it("should handle multiple simultaneous removals and additions", () => {
      const initialCheckout: DeltaNetClientWebsocketInitialCheckout = {
        indicesCount: 5,
        initialComponents: new Map([
          [
            1,
            {
              values: new BigInt64Array([
                BigInt(100),
                BigInt(200),
                BigInt(300),
                BigInt(400),
                BigInt(500),
              ]),
              deltas: new BigInt64Array([BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0)]),
            },
          ],
        ]),
        initialStates: new Map(),
      };
      clientState.reset();
      clientState.handleInitialCheckout(initialCheckout);

      const tick: DeltaNetClientWebsocketTick = {
        indicesCount: 6,
        unoccupying: [1, 3],
        componentDeltaDeltas: new Map([
          [
            1,
            new BigInt64Array([
              BigInt(10),
              BigInt(20),
              BigInt(30),
              BigInt(40),
              BigInt(50),
              BigInt(60),
            ]),
          ],
        ]),
        stateChanges: new Map(),
      };

      const result = clientState.handleTick(tick);

      expect(result.removedStableIds.length).toBe(2);
      expect(result.addedStableIds.length).toBe(3);

      const finalStableIds = clientState.getStableIds();
      expect(finalStableIds.length).toBe(6);
      expect(new Set(finalStableIds).size).toBe(6);
      expect(clientState.byStableId.size).toBe(6);

      const duplicates = finalStableIds.filter((id, index) => finalStableIds.indexOf(id) !== index);
      expect(duplicates).toEqual([]);
    });
  });

  describe("Complex Scenarios", () => {
    beforeEach(() => {
      const initialCheckout: DeltaNetClientWebsocketInitialCheckout = {
        indicesCount: 4,
        initialComponents: new Map([
          [
            1,
            {
              values: new BigInt64Array([BigInt(100), BigInt(200), BigInt(300), BigInt(400)]),
              deltas: new BigInt64Array([BigInt(0), BigInt(0), BigInt(0), BigInt(0)]),
            },
          ],
        ]),
        initialStates: new Map([
          [
            1,
            [
              new Uint8Array([1, 2, 3]),
              new Uint8Array([4, 5, 6]),
              new Uint8Array([7, 8, 9]),
              new Uint8Array([10, 11, 12]),
            ],
          ],
        ]),
      };
      clientState.handleInitialCheckout(initialCheckout);
    });

    it("should maintain data integrity during simultaneous operations", () => {
      const initialStableIds = [...clientState.getStableIds()];
      expect(initialStableIds.length).toBe(4);
      expect(new Set(initialStableIds).size).toBe(4);

      const tick: DeltaNetClientWebsocketTick = {
        indicesCount: 4,
        unoccupying: [1],
        componentDeltaDeltas: new Map([
          [1, new BigInt64Array([BigInt(10), BigInt(20), BigInt(30), BigInt(40)])],
        ]),
        stateChanges: new Map([[1, new Map([[3, new Uint8Array([13, 14, 15])]])]]),
      };

      const result = clientState.handleTick(tick);

      expect(result.removedStableIds.length).toBe(1);
      expect(result.addedStableIds.length).toBe(1);

      const finalStableIds = clientState.getStableIds();

      expect(finalStableIds.length).toBe(4);
      expect(new Set(finalStableIds).size).toBe(4);

      const duplicates = finalStableIds.filter((id, index) => finalStableIds.indexOf(id) !== index);
      expect(duplicates).toEqual([]);
    });

    it("should correctly map indices to stable IDs", () => {
      const tick: DeltaNetClientWebsocketTick = {
        indicesCount: 4,
        unoccupying: [1],
        componentDeltaDeltas: new Map([
          [1, new BigInt64Array([BigInt(10), BigInt(20), BigInt(30), BigInt(40)])],
        ]),
        stateChanges: new Map([[1, new Map([[3, new Uint8Array([13, 14, 15])]])]]),
      };

      const result = clientState.handleTick(tick);
      const finalStableIds = clientState.getStableIds();

      const indexToStableIdMap = new Map<number, number>();
      for (let i = 0; i < finalStableIds.length; i++) {
        const stableId = finalStableIds[i];
        expect(indexToStableIdMap.has(i)).toBe(false);
        indexToStableIdMap.set(i, stableId);
      }

      const newStableId = result.addedStableIds[0];
      expect(finalStableIds[3]).toBe(newStableId);

      const stateUpdate = result.stateUpdates.find((update) => update.stableId === newStableId);
      expect(stateUpdate).toBeDefined();
      expect(stateUpdate?.stateId).toBe(1);
    });

    it("should maintain correct array lengths", () => {
      expect(clientState.getIndicesCount()).toBe(4);
      expect(clientState.getStableIds().length).toBe(4);

      const tick: DeltaNetClientWebsocketTick = {
        indicesCount: 4,
        unoccupying: [1],
        componentDeltaDeltas: new Map([
          [1, new BigInt64Array([BigInt(10), BigInt(20), BigInt(30), BigInt(40)])],
        ]),
        stateChanges: new Map(),
      };

      clientState.handleTick(tick);

      expect(clientState.getIndicesCount()).toBe(4);
      expect(clientState.getStableIds().length).toBe(4);
      expect(clientState.byStableId.size).toBe(4);
    });
  });
});
