import {
  DeltaNetClientWebsocketInitialCheckout,
  DeltaNetClientWebsocketTick,
} from "./DeltaNetClientWebsocket";

export type EntityStateUpdate = { stableId: number; stateId: number; state: Uint8Array };

export type EntityInfo = {
  stableId: number;
  components: Map<number, bigint>;
  states: Map<number, Uint8Array>;
};

export type DeltaNetClientComponent = {
  values: BigInt64Array;
  deltas: BigInt64Array;
  deltaDeltas: BigInt64Array;
};

export class DeltaNetClientState {
  private componentValues = new Map<number, DeltaNetClientComponent>();
  private allStates = new Map<number, Array<Uint8Array>>();

  public byStableId: Map<number, EntityInfo> = new Map();

  private localClientIndex: number = -1;

  private indicesCount: number = 0;

  private stableIdToIndex = new Map<number, number>();
  private stableIds: Array<number> = [];
  private stableIdCounter = 1000; // Start at 1000 to avoid confusion with indices

  constructor() {
    this.reset();
  }

  /**
   * Reset all state to initial values. This should be called when reconnecting
   * to ensure that stale data from previous connections doesn't interfere.
   */
  public reset() {
    this.componentValues.clear();
    this.allStates.clear();
    this.byStableId.clear();
    this.localClientIndex = -1;
    this.indicesCount = 0;
    this.stableIdToIndex.clear();
    this.stableIds.length = 0;
    this.stableIdCounter = 1000;
  }

  public getComponentValues(): Map<number, DeltaNetClientComponent> {
    return this.componentValues;
  }

  public getStateById(stateId: number): Array<Uint8Array | null> | null {
    return this.allStates.get(stateId) ?? null;
  }

  public getAllStates(): Map<number, Array<Uint8Array | null>> {
    return this.allStates;
  }

  public getLocalClientIndex(): number {
    return this.localClientIndex;
  }

  public getIndicesCount(): number {
    return this.indicesCount;
  }

  public getStableIds(): Array<number> {
    return this.stableIds;
  }

  public getComponentValueForStableId(stableId: number, componentId: number): bigint | null {
    const index = this.stableIdToIndex.get(stableId);
    if (index === undefined) {
      return null;
    }
    const componentValue = this.componentValues.get(componentId);
    if (!componentValue) {
      return null;
    }
    return componentValue.values[index] ?? null;
  }

  public getComponentsForStableId(stableId: number): Map<number, bigint> | null {
    const index = this.stableIdToIndex.get(stableId);
    if (index === undefined) {
      return null;
    }
    const componentMap = new Map<number, bigint>();
    for (const [key, componentValue] of this.componentValues) {
      if (componentValue === undefined) {
        throw new Error(`Component value for key ${key} is undefined`);
      }
      componentMap.set(key, componentValue.values[index]);
    }
    return componentMap;
  }

  public handleInitialCheckout(initialCheckout: DeltaNetClientWebsocketInitialCheckout): {
    addedStableIds: Array<number>;
  } {
    const { indicesCount, initialComponents, initialStates } = initialCheckout;
    const addedStableIds: Array<number> = [];
    for (let i = 0; i < indicesCount; i++) {
      const stableId = this.stableIdCounter++;
      this.stableIds.push(stableId);
      this.stableIdToIndex.set(stableId, i);
      const entityInfo: EntityInfo = {
        stableId,
        components: new Map(),
        states: new Map(),
      };
      this.byStableId.set(stableId, entityInfo);
      addedStableIds.push(stableId);
    }
    this.indicesCount = indicesCount;

    const deltaDeltas = new BigInt64Array(indicesCount);
    for (let i = 0; i < deltaDeltas.length; i++) {
      deltaDeltas[i] = BigInt(0);
    }

    for (const [key, value] of initialComponents) {
      this.componentValues.set(key, {
        values: value.values,
        deltas: value.deltas,
        deltaDeltas,
      });

      for (let i = 0; i < this.stableIds.length; i++) {
        const stableId = this.stableIds[i];
        const entityInfo = this.byStableId.get(stableId);
        if (entityInfo) {
          entityInfo.components.set(key, value.values[i]);
        }
      }
    }

    for (const [stateId, values] of initialStates) {
      this.allStates.set(stateId, values);

      for (let i = 0; i < this.stableIds.length; i++) {
        const stableId = this.stableIds[i];
        const entityInfo = this.byStableId.get(stableId);
        const stateValue = values[i];
        if (entityInfo) {
          entityInfo.states.set(stateId, stateValue);
        }
      }
    }

    return { addedStableIds };
  }

  public handleTick(tick: DeltaNetClientWebsocketTick): {
    stateUpdates: Array<EntityStateUpdate>;
    removedStableIds: Array<number>;
    addedStableIds: Array<number>;
  } {
    const { unoccupying, indicesCount, componentDeltaDeltas, stateChanges } = tick;

    let removedStableIds: Array<number> = [];

    if (unoccupying.length > 0) {
      // Collect stableIds to remove before mutating stableIds
      const stableIdsToRemove = unoccupying.map((index) => this.stableIds[index]);
      removedStableIds = stableIdsToRemove.filter((stableId) => stableId !== undefined);

      // Remove unoccupying indices from component values
      for (const [componentId, component] of this.componentValues) {
        this.removeIndicesFromBigInt64Array(unoccupying, component.values);
        this.removeIndicesFromBigInt64Array(unoccupying, component.deltas);
      }

      // Remove unoccupying indices from states
      for (const [stateId, state] of this.allStates) {
        this.removeIndicesFromState(unoccupying, state);
      }

      // Update localClientIndex
      let decrementIndex = 0;
      for (const index of unoccupying) {
        if (index <= this.localClientIndex) {
          decrementIndex++;
        }
      }
      this.localClientIndex -= decrementIndex;

      // Update indices count
      this.indicesCount -= unoccupying.length;

      // Update stable indices and stableIds array
      this.removeIndices(unoccupying);

      // Remove unoccupied stables from byStableId
      for (const stableId of stableIdsToRemove) {
        if (stableId === undefined) {
          throw new Error(`stableId is undefined`);
        }
        this.byStableId.delete(stableId);
      }
    }

    const addedStableIds: Array<number> = [];

    if (indicesCount > this.indicesCount) {
      const addedIndices = indicesCount - this.indicesCount;

      for (let i = 0; i < addedIndices; i++) {
        const stableId = this.stableIdCounter++;
        this.stableIds.push(stableId);
        this.stableIdToIndex.set(stableId, this.stableIds.length - 1);
        const entityInfo: EntityInfo = {
          stableId,
          components: new Map(),
          states: new Map(),
        };
        this.byStableId.set(stableId, entityInfo);
        addedStableIds.push(stableId);
      }
    }

    this.indicesCount = indicesCount;

    // Update component values
    for (const [key, deltaDeltas] of componentDeltaDeltas) {
      if (deltaDeltas.length !== indicesCount) {
        throw new Error(
          `DeltaDeltas length (${deltaDeltas.length}) does not match indices count (${indicesCount})`,
        );
      }
      const existingComponent = this.componentValues.get(key);
      if (!existingComponent) {
        const values = new BigInt64Array(deltaDeltas);
        const deltas = new BigInt64Array(deltaDeltas);
        this.componentValues.set(key, { values, deltas, deltaDeltas });
      } else {
        if (existingComponent.values.length < deltaDeltas.length) {
          // Resize the arrays
          const newValues = new BigInt64Array(deltaDeltas.length);
          newValues.set(existingComponent.values);
          const newDeltas = new BigInt64Array(deltaDeltas.length);
          newDeltas.set(existingComponent.deltas);
          const newDeltaDelta = new BigInt64Array(deltaDeltas.length);
          newDeltaDelta.set(existingComponent.deltaDeltas);
          for (let i = existingComponent.values.length; i < deltaDeltas.length; i++) {
            newValues[i] = BigInt(0);
            newDeltas[i] = BigInt(0);
            newDeltaDelta[i] = BigInt(0);
          }
          existingComponent.values = newValues;
          existingComponent.deltas = newDeltas;
          existingComponent.deltaDeltas = newDeltaDelta;
        }

        for (let i = 0; i < deltaDeltas.length; i++) {
          const deltaDelta = deltaDeltas[i];
          const stableId = this.stableIds[i];

          existingComponent.deltaDeltas[i] = deltaDelta;
          existingComponent.deltas[i] += deltaDelta;
          existingComponent.values[i] += existingComponent.deltas[i];

          // Update byStableId map with new component values
          const entityInfo = this.byStableId.get(stableId);
          if (entityInfo) {
            entityInfo.components.set(key, existingComponent.values[i]);
          }
        }
      }
    }

    const stateUpdates: Array<EntityStateUpdate> = [];

    // Update states
    for (const [stateId, states] of stateChanges) {
      let state = this.allStates.get(stateId);
      if (!state) {
        state = [];
        this.allStates.set(stateId, state);
      }

      for (const [index, value] of states) {
        const stableId = this.stableIds[index];

        if (stableId === undefined) {
          throw new Error(`Stable ID is undefined for index ${index} in state ${stateId}`);
        }

        stateUpdates.push({
          stableId,
          stateId,
          state: value,
        });
        state[index] = value;

        // Update byStableId map with new state values
        const entityInfo = this.byStableId.get(stableId);
        if (entityInfo) {
          entityInfo.states.set(stateId, value);
        }
      }
    }

    return { stateUpdates, removedStableIds, addedStableIds };
  }

  public setLocalIndex(index: number) {
    this.localClientIndex = index;
  }

  private removeIndices(removing: Array<number>) {
    if (removing.length === 0) {
      return;
    }

    let writeIndex = 0;
    let skipIndex = 0;

    for (let readIndex = 0; readIndex < this.stableIds.length; readIndex++) {
      if (skipIndex < removing.length && readIndex === removing[skipIndex]) {
        skipIndex++;
        continue;
      }

      const stableId = this.stableIds[readIndex];
      if (writeIndex !== readIndex) {
        this.stableIds[writeIndex] = this.stableIds[readIndex];
      }
      // Update the mapping for all remaining elements to their new indices
      this.stableIdToIndex.set(stableId, writeIndex);

      writeIndex++;
    }

    // Actually shrink the array to the correct size
    this.stableIds.length = writeIndex;
  }

  private removeIndicesFromBigInt64Array(removing: Array<number>, array: BigInt64Array) {
    if (removing.length === 0) {
      return;
    }

    let writeIndex = 0;
    let skipIndex = 0;

    for (let readIndex = 0; readIndex < array.length; readIndex++) {
      if (skipIndex < removing.length && readIndex === removing[skipIndex]) {
        skipIndex++;
        continue;
      }

      if (writeIndex !== readIndex) {
        array[writeIndex] = array[readIndex];
      }

      writeIndex++;
    }
    for (let i = writeIndex; i < array.length; i++) {
      array[i] = BigInt(0);
    }
  }

  private removeIndicesFromState(removing: Array<number>, state: Array<Uint8Array | null>) {
    if (removing.length === 0) {
      return;
    }

    let writeIndex = 0;
    let skipIndex = 0;

    for (let readIndex = 0; readIndex < state.length; readIndex++) {
      if (skipIndex < removing.length && readIndex === removing[skipIndex]) {
        skipIndex++;
        continue;
      }

      if (writeIndex !== readIndex) {
        state[writeIndex] = state[readIndex];
      }

      writeIndex++;
    }
  }
}
