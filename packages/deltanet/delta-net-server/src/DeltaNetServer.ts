import {
  BufferWriter,
  DeltaNetV01ComponentTick,
  DeltaNetV01InitialCheckoutComponent,
  DeltaNetV01InitialCheckoutMessage,
  DeltaNetV01InitialCheckoutState,
  DeltaNetV01PingMessage,
  DeltaNetV01ServerErrorType,
  DeltaNetV01StateUpdates,
  DeltaNetV01Tick,
  encodeInitialCheckout,
  encodePing,
  encodeTick,
  encodeServerMessage,
} from "@mml-io/delta-net-protocol";

import { ComponentCollection } from "./ComponentCollection";
import {
  createDeltaNetServerConnectionForWebsocket,
  SupportedWebsocketSubProtocolsPreferenceOrder,
} from "./createDeltaNetServerConnectionForWebsocket";
import { DeltaNetV01Connection } from "./DeltaNetV01Connection";
import { StateCollection } from "./StateCollection";

export type onJoinerOptions = {
  deltaNetV01Connection: DeltaNetV01Connection;
  components: Array<[number, bigint]>;
  states: Array<[number, Uint8Array]>;
  token: string;
  internalConnectionId: number;
};

export type onComponentsUpdateOptions = {
  deltaNetV01Connection: DeltaNetV01Connection;
  internalConnectionId: number;
  components: Array<[number, bigint]>;
};

export type onStatesUpdateOptions = {
  deltaNetV01Connection: DeltaNetV01Connection;
  internalConnectionId: number;
  states: Array<[number, Uint8Array]>;
};

export type onLeaveOptions = {
  deltaNetV01Connection: DeltaNetV01Connection;
  internalConnectionId: number;
  components: Array<[number, number]>;
  states: Array<[number, Uint8Array]>;
};

export type onCustomMessageOptions = {
  deltaNetV01Connection: DeltaNetV01Connection;
  internalConnectionId: number;
  customType: number;
  contents: string;
};

export class DeltaNetServerError extends Error {
  constructor(
    public errorType: DeltaNetV01ServerErrorType,
    message: string,
    public retryable: boolean,
  ) {
    super(message);
  }
}

export type DeltaNetServerOptions = {
  onJoiner?: (
    opts: onJoinerOptions,
  ) =>
    | true
    | void
    | Error
    | DeltaNetServerError
    | { success: true; stateOverrides?: Array<[number, Uint8Array]> }
    | Promise<
        | true
        | void
        | Error
        | DeltaNetServerError
        | { success: true; stateOverrides?: Array<[number, Uint8Array]> }
      >;
  onComponentsUpdate?: (
    opts: onComponentsUpdateOptions,
  ) => true | void | Error | DeltaNetServerError;
  onStatesUpdate?: (
    opts: onStatesUpdateOptions,
  ) =>
    | true
    | void
    | Error
    | DeltaNetServerError
    | { success: true; stateOverrides?: Array<[number, Uint8Array]> }
    | Promise<
        | true
        | void
        | Error
        | DeltaNetServerError
        | { success: true; stateOverrides?: Array<[number, Uint8Array]> }
      >;
  onLeave?: (opts: onLeaveOptions) => void;
  onCustomMessage?: (opts: onCustomMessageOptions) => void;
  // If provided, the server will create a state for each user that contains their connection id
  serverConnectionIdStateId?: number;
  // Maximum size in bytes for individual state values (default: 1MB)
  maxStateValueSize?: number;
  // Maximum total size in bytes for a single message (default: 10MB)
  maxMessageSize?: number;
};

export class DeltaNetServer {
  private currentConnectionId = 1;

  private nextIndex = 0;

  private preTickData = {
    // This is state that will be flushed to clients in the next tick, but messages handled before the tick could change it
    unoccupyingIndices: new Set<number>(),
    newJoinerConnections: new Set<DeltaNetV01Connection>(),
    // Allows for arbitrary processes to be run that can imitate a new joiner connection (currently used for legacy adapter)
    newJoinerCallbacks: new Set<
      (index: number) => { id: number; afterAddCallback?: () => void } | null
    >(),
    componentsUpdated: 0,
  };

  private connectionIdToComponentIndex = new Map<number, number>();
  private componentIndexToConnectionId = new Map<number, number>();
  private connectionIdToDeltaNetServerConnection = new Map<number, DeltaNetV01Connection>();

  private allDeltaNetV01Connections = new Set<DeltaNetV01Connection>();
  private authenticatedDeltaNetV01Connections = new Set<DeltaNetV01Connection>();
  private observerConnections = new Set<DeltaNetV01Connection>(); // Track observer connections separately
  private webSocketToDeltaNetServerConnection = new Map<WebSocket, DeltaNetV01Connection>();

  private components = new Map<number, ComponentCollection>();
  private states = new Map<number, StateCollection>();

  private documentEffectiveStartTime = Date.now();
  private pingCounter = 1;

  private disposed = false;

  private maxStateValueSize: number;
  private maxMessageSize: number;

  constructor(private opts: DeltaNetServerOptions = {}) {
    if (opts.serverConnectionIdStateId !== undefined) {
      this.states.set(opts.serverConnectionIdStateId, new StateCollection());
    }

    // Set default limits
    this.maxStateValueSize = opts.maxStateValueSize ?? 1024 * 1024; // 1MB default
    this.maxMessageSize = opts.maxMessageSize ?? 10 * 1024 * 1024; // 10MB default
  }

  public static handleWebsocketSubprotocol(protocols: Set<string> | Array<string>): string | false {
    const protocolsSet = new Set(protocols);
    // Find highest priority (first in the array) protocol that is supported
    for (const protocol of SupportedWebsocketSubProtocolsPreferenceOrder) {
      if (protocolsSet.has(protocol)) {
        return protocol;
      }
    }
    return false;
  }

  public addWebSocket(webSocket: WebSocket) {
    if (this.disposed) {
      throw new Error("This DeltaNetServer has been disposed");
    }

    const deltaNetV01Connection = createDeltaNetServerConnectionForWebsocket(webSocket, this);
    if (deltaNetV01Connection === null) {
      // Error is handled in createDeltaNetServerConnectionForWebsocket
      return;
    }

    this.allDeltaNetV01Connections.add(deltaNetV01Connection);
    this.webSocketToDeltaNetServerConnection.set(
      deltaNetV01Connection.webSocket,
      deltaNetV01Connection,
    );
  }

  public removeWebSocket(webSocket: WebSocket) {
    // Allow removal even when disposed to ensure cleanup
    const deltaNetV01Connection = this.webSocketToDeltaNetServerConnection.get(webSocket);
    if (deltaNetV01Connection === undefined) {
      // Connection might have already been removed, which is fine
      return;
    }
    if (!this.allDeltaNetV01Connections.has(deltaNetV01Connection)) {
      // Connection might have already been cleaned up, which is fine
      return;
    }

    // Dispose the connection (this will cancel any pending validations)
    deltaNetV01Connection.dispose();

    // Call onLeave callback if provided and connection has an ID (but not if disposed)
    if (!this.disposed && this.opts.onLeave) {
      const internalConnectionId = deltaNetV01Connection.internalConnectionId;
      const index = this.connectionIdToComponentIndex.get(internalConnectionId);

      if (index !== undefined) {
        // Gather current component and state data for the leaving user
        const components: Array<[number, number]> = [];
        for (const [componentId, collection] of this.components) {
          const value = collection.getTargetValue(index);
          if (value !== 0n) {
            components.push([componentId, Number(value)]);
          }
        }

        const states: Array<[number, Uint8Array]> = [];
        for (const [stateId, collection] of this.states) {
          const value = collection.values[index];
          if (value !== undefined && value.length > 0) {
            states.push([stateId, value]);
          }
        }

        try {
          this.opts.onLeave({
            deltaNetV01Connection,
            internalConnectionId,
            components,
            states,
          });
        } catch (error) {
          console.warn("Error in onLeave callback:", error);
        }
      }
    }

    const internalConnectionId = deltaNetV01Connection.internalConnectionId;
    this.connectionIdToDeltaNetServerConnection.delete(internalConnectionId);
    if (this.preTickData.newJoinerConnections.has(deltaNetV01Connection)) {
      // This connection is still pending, so we need to remove it from the pending joiner list
      this.preTickData.newJoinerConnections.delete(deltaNetV01Connection);
    } else {
      // This connection is already authenticated (has an index assigned), so we need to clear data for it
      const index = this.connectionIdToComponentIndex.get(internalConnectionId);
      if (index !== undefined) {
        this.clearInternalConnectionId(internalConnectionId);
      }
      // If index is undefined, this connection was never fully authenticated and has no data to clear
    }
    this.authenticatedDeltaNetV01Connections.delete(deltaNetV01Connection);
    this.observerConnections.delete(deltaNetV01Connection); // Remove from observers if present
    this.allDeltaNetV01Connections.delete(deltaNetV01Connection);
    this.webSocketToDeltaNetServerConnection.delete(deltaNetV01Connection.webSocket);
  }

  public hasWebSocket(webSocket: WebSocket): boolean {
    return this.webSocketToDeltaNetServerConnection.has(webSocket);
  }

  public dangerouslyGetConnectionsToComponentIndex(): Map<number, number> {
    return this.connectionIdToComponentIndex;
  }

  public dangerouslyAddNewJoinerCallback(
    callback: (index: number) => { id: number; afterAddCallback?: () => void } | null,
  ): void {
    this.preTickData.newJoinerCallbacks.add(callback);
  }

  private disconnectWithError(
    deltaNetV01Connection: DeltaNetV01Connection,
    error: Error,
    errorType: DeltaNetV01ServerErrorType,
    retryable: boolean = true,
  ): void {
    try {
      deltaNetV01Connection.sendMessage({
        type: "error",
        errorType,
        message: error.message,
        retryable,
      });
    } catch (sendError) {
      // If sending the error message fails, just log it and proceed with disconnection
      console.warn("Failed to send error message to client:", sendError);
    }

    try {
      deltaNetV01Connection.webSocket.close(1008, error.message);
    } catch (closeError) {
      // If closing the connection fails, just log it
      console.warn("Failed to close websocket connection:", closeError);
    }

    // Immediately clean up internal data structures to prevent memory leaks
    // This ensures cleanup happens even if the WebSocket close event doesn't fire
    try {
      this.removeWebSocket(deltaNetV01Connection.webSocket);
    } catch (cleanupError) {
      // If the connection was already removed or doesn't exist, that's fine
      console.warn("Failed to clean up connection state:", cleanupError);
    }
  }

  public getComponentValue(componentId: number, componentIndex: number): number | null {
    const componentCollection = this.components.get(componentId);
    if (componentCollection === undefined) {
      return null;
    }
    return Number(componentCollection.getTargetValue(componentIndex));
  }

  public getNextConnectionId(): number {
    return this.currentConnectionId++;
  }

  public getMaxMessageSize(): number {
    return this.maxMessageSize;
  }

  public validateJoiner(
    deltaNetV01Connection: DeltaNetV01Connection,
    token: string,
    components: Array<[number, bigint]>,
    states: Array<[number, Uint8Array]>,
  ):
    | Promise<{ success: true } | { success: false; error: string }>
    | { success: true }
    | { success: false; error: string } {
    if (this.disposed) {
      return { success: false, error: "This DeltaNetServer has been disposed" };
    }

    // Check individual state value sizes
    for (const [stateId, stateValue] of states) {
      if (stateValue.length > this.maxStateValueSize) {
        return {
          success: false,
          error: `State value for state ${stateId} has size ${stateValue.length} bytes which exceeds maximum allowed size of ${this.maxStateValueSize} bytes`,
        };
      }
    }

    function resultToReturn(
      result:
        | true
        | void
        | Error
        | DeltaNetServerError
        | { success: true; stateOverrides?: Array<[number, Uint8Array]> },
    ):
      | { success: true; stateOverrides?: Array<[number, Uint8Array]> }
      | { success: false; error: string } {
      if (result instanceof DeltaNetServerError) {
        return { success: false, error: result.message };
      }
      if (result instanceof Error) {
        return { success: false, error: result.message };
      }
      if (result === true || result === undefined) {
        // If the callback returns true or undefined, treat it as success
        return { success: true };
      }
      if (typeof result === "object" && result.success === true) {
        // Return the object with potential state overrides
        return result;
      }
      return { success: false, error: "Joiner validation failed" };
    }

    // Call onJoiner callback if provided (now potentially async)
    if (this.opts.onJoiner) {
      const rawResult = this.opts.onJoiner({
        deltaNetV01Connection,
        components,
        states,
        token,
        internalConnectionId: deltaNetV01Connection.internalConnectionId,
      });
      if (rawResult instanceof Promise) {
        return rawResult
          .then((resolvedResult): { success: true } | { success: false; error: string } => {
            return resultToReturn(resolvedResult);
          })
          .catch((error) => {
            console.warn("Error in async onJoiner callback:", error);
            return resultToReturn(error);
          });
      } else {
        return resultToReturn(rawResult);
      }
    }

    return { success: true };
  }

  public addAuthenticatedConnection(deltaNetV01Connection: DeltaNetV01Connection): void {
    if (deltaNetV01Connection.internalConnectionId === null) {
      throw new Error("Connection ID must be set before adding to authenticated connections");
    }

    this.connectionIdToDeltaNetServerConnection.set(
      deltaNetV01Connection.internalConnectionId,
      deltaNetV01Connection,
    );

    if (deltaNetV01Connection.isObserver) {
      // Observers don't get indices but still need to go through the newJoiner flow to receive initialCheckout
      this.observerConnections.add(deltaNetV01Connection);
      this.preTickData.newJoinerConnections.add(deltaNetV01Connection);
    } else {
      // Regular users get added to new joiner queue for index assignment
      this.preTickData.newJoinerConnections.add(deltaNetV01Connection);
    }
  }

  public validateAndApplyStateUpdate(
    deltaNetV01Connection: DeltaNetV01Connection,
    internalConnectionId: number,
    stateId: number,
    stateValue: Uint8Array,
  ):
    | Promise<true | void | Error | DeltaNetServerError>
    | true
    | void
    | Error
    | DeltaNetServerError {
    if (this.disposed) {
      return new Error("This DeltaNetServer has been disposed");
    }

    // Check state value size limit
    if (stateValue.length > this.maxStateValueSize) {
      return new DeltaNetServerError(
        "USER_NETWORKING_UNKNOWN_ERROR",
        `State value for state ${stateId} has size ${stateValue.length} bytes which exceeds maximum allowed size of ${this.maxStateValueSize} bytes`,
        false,
      );
    }

    // Observers cannot send state updates
    if (deltaNetV01Connection.isObserver) {
      return new DeltaNetServerError(
        "OBSERVER_CANNOT_SEND_STATE_UPDATES",
        "Observers cannot send state updates",
        false,
      );
    }

    // Call onStatesUpdate callback if provided
    if (this.opts.onStatesUpdate) {
      try {
        const result = this.opts.onStatesUpdate({
          deltaNetV01Connection,
          internalConnectionId,
          states: [[stateId, stateValue]],
        });

        // If it's a Promise, return it for the connection to handle
        if (result instanceof Promise) {
          return result
            .then((asyncResult) => {
              // Check if connection still exists before applying state update
              if (!this.connectionIdToDeltaNetServerConnection.has(internalConnectionId)) {
                // Connection was removed while validation was pending - ignore the result
                return;
              }
              if (asyncResult instanceof DeltaNetServerError || asyncResult instanceof Error) {
                return asyncResult;
              }

              if (asyncResult === true || asyncResult === undefined) {
                this.applyStateUpdates(deltaNetV01Connection, internalConnectionId, [
                  [stateId, stateValue],
                ]);
                return true;
              }

              // If asyncResult is an object with success: true, apply the state overrides
              if (asyncResult.success) {
                if (asyncResult.stateOverrides) {
                  this.applyStateUpdates(
                    deltaNetV01Connection,
                    internalConnectionId,
                    asyncResult.stateOverrides,
                  );
                }
                return true;
              } else {
                return new DeltaNetServerError(
                  "USER_NETWORKING_UNKNOWN_ERROR",
                  "State validation failed",
                  false,
                );
              }
            })
            .catch((error) => {
              // Handle async callback errors
              console.warn("Error in async onStatesUpdate callback:", error);
              if (error instanceof DeltaNetServerError) {
                return error;
              }
              if (error instanceof Error) {
                return error;
              }
              return new Error("State validation failed");
            });
        } else {
          // Synchronous validation
          if (result instanceof DeltaNetServerError || result instanceof Error) {
            return result;
          }

          if (result === true || result === undefined) {
            this.applyStateUpdates(deltaNetV01Connection, internalConnectionId, [
              [stateId, stateValue],
            ]);
            return true;
          }

          // If result is an object with success: true, apply the state overrides
          if (result.success) {
            if (result.stateOverrides) {
              this.applyStateUpdates(
                deltaNetV01Connection,
                internalConnectionId,
                result.stateOverrides,
              );
            }
            return true;
          } else {
            return new DeltaNetServerError(
              "USER_NETWORKING_UNKNOWN_ERROR",
              "State validation failed",
              false,
            );
          }
        }
      } catch (error) {
        console.warn("Error in onStatesUpdate callback:", error);
        if (error instanceof DeltaNetServerError) {
          return error;
        }
        if (error instanceof Error) {
          return error;
        }
        return new Error("State validation failed");
      }
    } else {
      // No validation callback, apply immediately
      this.applyStateUpdates(deltaNetV01Connection, internalConnectionId, [[stateId, stateValue]]);
      return true;
    }
  }

  public clearInternalConnectionId(internalConnectionId: number) {
    const index = this.connectionIdToComponentIndex.get(internalConnectionId);
    if (index === undefined) {
      throw new Error("Index for removing user is undefined");
    }
    // Clear all the component values for this index
    for (const [, collection] of this.components) {
      collection.setValue(index, 0n);
    }
    for (const [, collection] of this.states) {
      collection.setValue(index, null);
    }

    this.preTickData.unoccupyingIndices.add(index);
  }

  private sendPings() {
    const ping = this.pingCounter++;
    if (this.pingCounter > 1000) {
      this.pingCounter = 1;
    }
    const v01PingMessage: DeltaNetV01PingMessage = {
      type: "ping",
      ping,
    };
    const writer = new BufferWriter(8);
    encodePing(v01PingMessage, writer);
    const v01Encoded = writer.getBuffer();
    this.allDeltaNetV01Connections.forEach((deltaNetV01Connection) => {
      deltaNetV01Connection.sendEncodedBytes(v01Encoded);
    });
  }

  public tick(): {
    removedIds: Set<number>;
    addedIds: Set<number>;
  } {
    if (this.disposed) {
      return { removedIds: new Set(), addedIds: new Set() }; // Silently ignore ticks after disposal
    }

    this.preTickData.componentsUpdated = 0;

    const removedIds: Set<number> = new Set();
    const addedIds: Set<number> = new Set();

    // Determine the indices of the removed connections. Send the original indices to the clients so they can be removed.
    const sortedUnoccupyingIndices = Array.from(this.preTickData.unoccupyingIndices);
    sortedUnoccupyingIndices.sort((a, b) => a - b);

    // Apply the unoccupying indices to the component and state collections
    for (const componentCollection of this.components.values()) {
      componentCollection.removeIndices(sortedUnoccupyingIndices);
    }
    for (const stateCollection of this.states.values()) {
      stateCollection.removeIndices(sortedUnoccupyingIndices);
    }

    for (const index of sortedUnoccupyingIndices) {
      const connectionId = this.componentIndexToConnectionId.get(index);
      if (connectionId === undefined) {
        throw new Error("Connection id not found for index " + index);
      }
      removedIds.add(connectionId);
      this.connectionIdToComponentIndex.delete(connectionId);
      this.componentIndexToConnectionId.delete(index);
    }

    let writeIndex = 0;
    let skipIndex = 0;
    for (let i = 0; i < this.nextIndex; i++) {
      // Fix the indices of the maps to connectionId
      const connectionId = this.componentIndexToConnectionId.get(i);

      // Skip indices that should be removed
      if (
        skipIndex < sortedUnoccupyingIndices.length &&
        i === sortedUnoccupyingIndices[skipIndex]
      ) {
        skipIndex++;
        continue;
      }

      // Shift values to the left (in-place)
      if (writeIndex !== i) {
        if (connectionId === undefined) {
          throw new Error("Connection id not found for index " + i);
        }
        this.componentIndexToConnectionId.set(writeIndex, connectionId);
        this.connectionIdToComponentIndex.set(connectionId, writeIndex);
      }
      writeIndex++;
    }

    // Now decrement the nextIndex to reflect the removed indices
    this.nextIndex -= sortedUnoccupyingIndices.length;

    // handle new joiners
    for (const deltaNetV01Connection of this.preTickData.newJoinerConnections) {
      const internalConnectionId = deltaNetV01Connection.internalConnectionId;

      if (deltaNetV01Connection.isObserver) {
        // Observers don't get indices assigned
      } else {
        // Regular participants get indices assigned
        const index = this.nextIndex++;

        this.connectionIdToComponentIndex.set(internalConnectionId, index);
        this.componentIndexToConnectionId.set(index, internalConnectionId);
        addedIds.add(internalConnectionId);

        // Create new collections for any components or states that are not already present
        for (const [componentId] of deltaNetV01Connection.components) {
          if (!this.components.has(componentId)) {
            this.components.set(componentId, new ComponentCollection());
          }
        }
        for (const [stateId] of deltaNetV01Connection.states) {
          if (!this.states.has(stateId)) {
            this.states.set(stateId, new StateCollection());
          }
        }

        for (const [componentId, collection] of this.components) {
          const value = deltaNetV01Connection.components.get(componentId);
          if (value === undefined) {
            collection.setValue(index, 0n);
          } else {
            collection.setValue(index, BigInt(value));
          }
        }

        for (const [stateId, collection] of this.states) {
          const value = deltaNetV01Connection.states.get(stateId);
          if (
            this.opts.serverConnectionIdStateId !== undefined &&
            stateId === this.opts.serverConnectionIdStateId
          ) {
            const writer = new BufferWriter(8);
            writer.writeUVarint(internalConnectionId);
            const buffer = writer.getBuffer();
            collection.setValue(index, buffer);
          } else {
            if (value === undefined) {
              collection.setValue(index, null);
            } else {
              collection.setValue(index, value);
            }
          }
        }

        deltaNetV01Connection.sendMessage({
          type: "userIndex",
          index,
        });
      }
    }

    for (const callback of this.preTickData.newJoinerCallbacks) {
      const index = this.nextIndex++;
      const result = callback(index);
      if (result === null) {
        // If the callback returns false, the index is not used and should be decremented
        this.nextIndex--;
      } else {
        const { id, afterAddCallback } = result;
        this.connectionIdToComponentIndex.set(id, index);
        this.componentIndexToConnectionId.set(index, id);
        addedIds.add(id);

        if (this.opts.serverConnectionIdStateId !== undefined) {
          const writer = new BufferWriter(8);
          writer.writeUVarint(id);
          const buffer = writer.getBuffer();
          this.setUserState(index, this.opts.serverConnectionIdStateId, buffer);
        }
        if (afterAddCallback) {
          afterAddCallback();
        }
      }
    }

    const componentDeltas: Array<DeltaNetV01ComponentTick> = [];
    for (const [componentId, collection] of this.components) {
      const { deltaDeltas } = collection.tick();
      componentDeltas.push({ componentId, deltaDeltas });
    }
    const stateDeltas: Array<DeltaNetV01StateUpdates> = [];
    for (const [stateId, collection] of this.states) {
      const updatedStates: Array<[number, Uint8Array]> = collection.tick();
      if (updatedStates.length === 0) {
        continue;
      }
      stateDeltas.push({
        stateId,
        updatedStates,
      });
    }

    const tickMessage: DeltaNetV01Tick = {
      type: "tick",
      serverTime: this.getServerTime(),
      removedIndices: sortedUnoccupyingIndices,
      indicesCount: this.nextIndex,
      componentDeltaDeltas: componentDeltas,
      states: stateDeltas,
    };
    const writer = new BufferWriter(this.nextIndex * this.components.size + 128); // Try to avoid needing to resize
    encodeTick(tickMessage, writer);
    const v01EncodedComponentsChanged = writer.getBuffer();
    this.authenticatedDeltaNetV01Connections.forEach((deltaNetV01Connection) => {
      deltaNetV01Connection.sendEncodedBytes(v01EncodedComponentsChanged);
    });

    // Handle the initial checkout for new joiners

    if (this.preTickData.newJoinerConnections.size > 0) {
      const components: Array<DeltaNetV01InitialCheckoutComponent> = [];
      for (const [componentId, collection] of this.components) {
        components.push({
          componentId,
          values: collection.getCurrentValuesArray(),
          deltas: collection.getPreviousEmittedDeltasArray(),
        });
      }

      const states: Array<DeltaNetV01InitialCheckoutState> = [];
      for (const [stateId, collection] of this.states) {
        states.push({
          stateId,
          values: collection.values,
        });
      }

      const initialCheckout = {
        type: "initialCheckout",
        components,
        states,
        indicesCount: this.nextIndex,
        serverTime: this.getServerTime(),
      } satisfies DeltaNetV01InitialCheckoutMessage;

      const writer = new BufferWriter(this.nextIndex * this.components.size + 128); // Try to avoid needing to resize
      encodeInitialCheckout(initialCheckout, writer);
      const v01EncodedInitialCheckout = writer.getBuffer();

      for (const deltaNetV01Connection of this.preTickData.newJoinerConnections) {
        deltaNetV01Connection.sendEncodedBytes(v01EncodedInitialCheckout);
      }
    }

    for (const deltaNetV01Connection of this.preTickData.newJoinerConnections) {
      this.authenticatedDeltaNetV01Connections.add(deltaNetV01Connection);
      deltaNetV01Connection.setAuthenticated();
    }

    this.preTickData.unoccupyingIndices.clear();
    this.preTickData.newJoinerConnections.clear();
    this.preTickData.newJoinerCallbacks.clear();

    return {
      removedIds,
      addedIds,
    };
  }

  public getServerTime(): number {
    return Date.now() - this.documentEffectiveStartTime;
  }

  public setUserComponents(
    deltaNetV01Connection: DeltaNetV01Connection,
    internalConnectionId: number,
    components: Array<[number, bigint]>,
  ): { success: true } | { success: false; error: string } {
    if (this.disposed) {
      console.error("Cannot dispatch remote event after dispose");
      return { success: false, error: "This DeltaNetServer has been disposed" };
    }

    // Observers cannot send component updates
    if (deltaNetV01Connection.isObserver) {
      return { success: false, error: "Observers cannot send component updates" };
    }

    // Call onComponentsUpdate callback if provided
    if (this.opts.onComponentsUpdate) {
      try {
        const result = this.opts.onComponentsUpdate({
          deltaNetV01Connection,
          internalConnectionId,
          components,
        });

        if (result instanceof DeltaNetServerError) {
          return { success: false, error: result.message };
        }
        if (result instanceof Error) {
          return { success: false, error: result.message };
        }
      } catch (error) {
        console.warn("Error in onComponentsUpdate callback:", error);
        if (error instanceof DeltaNetServerError) {
          return { success: false, error: error.message };
        }
        if (error instanceof Error) {
          return { success: false, error: error.message };
        }
        return { success: false, error: "Component update failed" };
      }
    }

    // Apply component updates immediately (components don't have async validation)
    this.applyComponentUpdates(deltaNetV01Connection, internalConnectionId, components);

    return { success: true };
  }

  public setComponentValue(componentId: number, index: number, value: bigint): void {
    this.preTickData.componentsUpdated++;
    let collection = this.components.get(componentId);
    if (!collection) {
      collection = new ComponentCollection();
      this.components.set(componentId, collection);
    }
    collection.setValue(index, value);
  }

  private applyComponentUpdates(
    deltaNetV01Connection: DeltaNetV01Connection,
    internalConnectionId: number,
    components: Array<[number, bigint]>,
  ): void {
    if (this.preTickData.newJoinerConnections.has(deltaNetV01Connection)) {
      for (const [componentId, componentValue] of components) {
        deltaNetV01Connection.components.set(componentId, componentValue);
      }
      return;
    }

    const index = this.connectionIdToComponentIndex.get(internalConnectionId);
    if (index === undefined) {
      // Connection was likely removed - this is expected behavior
      return;
    }

    for (const [componentId, componentValue] of components) {
      this.setComponentValue(componentId, index, componentValue);
    }
  }

  public overrideUserStates(
    deltaNetV01Connection: DeltaNetV01Connection | null,
    internalConnectionId: number,
    states: Array<[number, Uint8Array]>,
  ) {
    this.applyStateUpdates(deltaNetV01Connection, internalConnectionId, states);
  }

  public setUserState(index: number, stateId: number, stateValue: Uint8Array) {
    let collection = this.states.get(stateId);
    if (!collection) {
      collection = new StateCollection();
      this.states.set(stateId, collection);
    }
    collection.setValue(index, stateValue);
  }

  private applyStateUpdates(
    deltaNetV01Connection: DeltaNetV01Connection | null,
    internalConnectionId: number,
    states: Array<[number, Uint8Array]>,
  ): void {
    if (
      deltaNetV01Connection !== null &&
      this.preTickData.newJoinerConnections.has(deltaNetV01Connection)
    ) {
      for (const [stateId, stateValue] of states) {
        deltaNetV01Connection.states.set(stateId, stateValue);
      }
      return;
    }

    const index = this.connectionIdToComponentIndex.get(internalConnectionId);
    if (index === undefined) {
      // Connection was likely removed while async validation was pending
      // This is expected behavior and not an error
      return;
    }

    for (const [stateId, stateValue] of states) {
      this.setUserState(index, stateId, stateValue);
    }
  }

  public handleCustomMessage(
    deltaNetV01Connection: DeltaNetV01Connection,
    internalConnectionId: number,
    customType: number,
    contents: string,
  ): void {
    if (this.disposed) {
      return;
    }

    // Call custom message callback if provided
    if (this.opts.onCustomMessage) {
      try {
        this.opts.onCustomMessage({
          deltaNetV01Connection,
          internalConnectionId,
          customType,
          contents,
        });
      } catch (error) {
        console.warn("Error in onCustomMessage callback:", error);
      }
    }
  }

  public broadcastCustomMessage(customType: number, contents: string): void {
    if (this.disposed) {
      return;
    }

    const writer = new BufferWriter(contents.length + 16);
    const message = {
      type: "serverCustom" as const,
      customType,
      contents,
    };

    const encodedMessage = encodeServerMessage(message, writer);
    const messageBytes = encodedMessage.getBuffer();

    // Broadcast to all authenticated connections
    this.authenticatedDeltaNetV01Connections.forEach((connection) => {
      try {
        connection.sendEncodedBytes(messageBytes);
      } catch (error) {
        console.warn("Failed to send custom message to connection:", error);
      }
    });
  }

  public dispose(): void {
    this.disposed = true;

    // Close all active connections
    const connectionsToClose = Array.from(this.allDeltaNetV01Connections);
    for (const connection of connectionsToClose) {
      try {
        connection.webSocket.close(1001, "Server shutting down");
      } catch (error) {
        console.warn("Failed to close connection during disposal:", error);
      }
    }

    // Clear all internal data structures
    this.allDeltaNetV01Connections.clear();
    this.authenticatedDeltaNetV01Connections.clear();
    this.observerConnections.clear();
    this.webSocketToDeltaNetServerConnection.clear();
    this.connectionIdToDeltaNetServerConnection.clear();
    this.connectionIdToComponentIndex.clear();
    this.componentIndexToConnectionId.clear();
    this.components.clear();
    this.states.clear();
    this.preTickData.newJoinerConnections.clear();
    this.preTickData.unoccupyingIndices.clear();
  }
}
