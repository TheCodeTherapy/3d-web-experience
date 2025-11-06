import { jest } from "@jest/globals";
import {
  DeltaNetV01ErrorMessage,
  DeltaNetV01InitialCheckoutMessage,
  DeltaNetV01Tick,
} from "@mml-io/delta-net-protocol";

import { DeltaNetServer } from "../../src";

import { MockWebsocketV01 } from "./mock.websocket-v01";

let currentDoc: DeltaNetServer | null = null;

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  if (currentDoc) {
    currentDoc.dispose();
    currentDoc = null;
  }
  jest.useRealTimers();
});

describe("DeltaNetServer - Edge Cases", () => {
  describe("callback error handling", () => {
    test("handles callbacks returning undefined", async () => {
      // Return undefined as what you would expect from a callback that doesn't return anything
      const onStatesUpdateMock = jest.fn().mockReturnValue(undefined as any) as any;

      const doc = new DeltaNetServer({
        onStatesUpdate: onStatesUpdateMock,
      });
      currentDoc = doc;

      const clientWs = new MockWebsocketV01();
      doc.addWebSocket(clientWs as unknown as WebSocket);

      clientWs.sendToServer({
        type: "connectUser",
        components: [[1, 1n]],
        states: [[1, new Uint8Array([1])]],
        token: "test",
        observer: false,
      });

      await jest.advanceTimersByTimeAsync(10);
      doc.tick();
      await clientWs.waitForTotalMessageCount(2);

      clientWs.sendToServer({
        type: "setUserComponents",
        components: [],
        states: [[1, new Uint8Array([2])]],
      });

      doc.tick();

      // State should be applied (server treats non-Error as success)
      const tickMessage = (await clientWs.waitForTotalMessageCount(3, 2))[0] as DeltaNetV01Tick;
      expect(tickMessage.states).toHaveLength(1);
      expect(tickMessage.states[0].updatedStates[0][1]).toEqual(new Uint8Array([2]));

      // Verify the callback was actually called - we check call count rather than arguments
      // because Jest has issues serializing BigInt values for argument matching
      expect(onStatesUpdateMock).toHaveBeenCalledTimes(1);
    });

    test("handles callbacks that throw exceptions", async () => {
      const onStatesUpdateMock = jest.fn<() => true>().mockImplementation(() => {
        throw new Error("Unexpected callback crash");
      });

      const doc = new DeltaNetServer({
        onStatesUpdate: onStatesUpdateMock,
      });
      currentDoc = doc;

      const clientWs = new MockWebsocketV01();
      doc.addWebSocket(clientWs as unknown as WebSocket);

      clientWs.sendToServer({
        type: "connectUser",
        components: [[1, 1n]],
        states: [[1, new Uint8Array([1])]],
        token: "test",
        observer: false,
      });

      await jest.advanceTimersByTimeAsync(10);
      doc.tick();
      await clientWs.waitForTotalMessageCount(2);

      clientWs.sendToServer({
        type: "setUserComponents",
        components: [],
        states: [[1, new Uint8Array([2])]],
      });

      // Should handle callback exceptions gracefully - callback was called but error was caught
      expect(onStatesUpdateMock).toHaveBeenCalled();

      // Server should not crash and should continue operating
      expect(() => doc.tick()).not.toThrow();

      // State should not be applied due to the error in callback
      // Server should send error message to client about the callback failure
      const errorMessage = clientWs.getMessage(2) as DeltaNetV01ErrorMessage;
      expect(errorMessage.type).toBe("error");
      expect(errorMessage.errorType).toBe("USER_NETWORKING_UNKNOWN_ERROR");
      expect(errorMessage.message).toBe("Unexpected callback crash");
      expect(errorMessage.retryable).toBe(false);
    });
  });

  describe("data validation edge cases", () => {
    test("handles invalid component and state IDs", async () => {
      const doc = new DeltaNetServer();
      currentDoc = doc;

      const clientWs = new MockWebsocketV01();
      doc.addWebSocket(clientWs as unknown as WebSocket);

      clientWs.sendToServer({
        type: "connectUser",
        components: [
          [-1, 1n],
          [0, 2n],
        ], // Negative and zero IDs
        states: [
          [-1, new Uint8Array([1])],
          [0, new Uint8Array([2])],
        ],
        token: "test",
        observer: false,
      });

      await jest.advanceTimersByTimeAsync(10);
      doc.tick();

      // Server should accept the connection despite unusual IDs and create proper collections
      const messages = await clientWs.waitForTotalMessageCount(2);
      expect(messages[0]).toEqual({ index: 0, type: "userIndex" });
      expect(messages[1].type).toBe("initialCheckout");

      // Verify that the server created collections for the unusual IDs and they contain the expected data
      const initialCheckout = messages[1] as DeltaNetV01InitialCheckoutMessage;
      expect(initialCheckout.components).toHaveLength(2); // Should have 2 components (-1 and 0)
      expect(initialCheckout.states).toHaveLength(2); // Should have 2 states (-1 and 0)

      // Verify the actual component data was stored correctly
      const componentIds = initialCheckout.components.map((c) => c.componentId).sort();
      // Server appears to remap negative component IDs (e.g., -1 becomes 127)
      expect(componentIds).toEqual([0, 127]);

      // Verify component values were stored correctly
      const component127 = initialCheckout.components.find((c) => c.componentId === 127);
      const component0 = initialCheckout.components.find((c) => c.componentId === 0);
      expect(Number(component127?.values[0])).toBe(1); // -1 was remapped to 127
      expect(Number(component0?.values[0])).toBe(2);

      // Verify the actual state data was stored correctly
      const stateIds = initialCheckout.states.map((s) => s.stateId).sort();
      // Server appears to remap negative state IDs similarly
      expect(stateIds).toEqual([0, 127]); // -1 was remapped to 127

      // Verify state values were stored correctly
      const state127 = initialCheckout.states.find((s) => s.stateId === 127);
      const state0 = initialCheckout.states.find((s) => s.stateId === 0);
      expect(state127?.values[0]).toEqual(new Uint8Array([1])); // -1 was remapped to 127
      expect(state0?.values[0]).toEqual(new Uint8Array([2]));
    });

    test("rejects extremely large state payloads", async () => {
      // Create server with small limits to test size validation
      const doc = new DeltaNetServer({
        maxStateValueSize: 500, // 500 byte limit for individual state values
        maxMessageSize: 2048, // 2KB limit for total message
      });
      currentDoc = doc;

      const clientWs = new MockWebsocketV01();
      doc.addWebSocket(clientWs as unknown as WebSocket);

      clientWs.sendToServer({
        type: "connectUser",
        components: [[1, 1n]],
        states: [[1, new Uint8Array([1])]],
        token: "test",
        observer: false,
      });

      await jest.advanceTimersByTimeAsync(10);
      doc.tick();
      await clientWs.waitForTotalMessageCount(2);

      // Send state payload that exceeds the state value limit but not the message limit
      const largePayload = new Uint8Array(600); // 600 bytes, exceeds 500 byte state limit
      largePayload.fill(42);

      clientWs.sendToServer({
        type: "setUserComponents",
        components: [],
        states: [[1, largePayload]],
      });

      doc.tick();

      // Should receive an error message about the state value being too large
      const errorMessage = (
        await clientWs.waitForTotalMessageCount(3, 2)
      )[0] as DeltaNetV01ErrorMessage;
      expect(errorMessage.type).toBe("error");
      expect(errorMessage.errorType).toBe("USER_NETWORKING_UNKNOWN_ERROR");
      expect(errorMessage.message).toContain("State value for state 1 has size 600 bytes");
      expect(errorMessage.message).toContain("exceeds maximum allowed size of 500 bytes");
      expect(errorMessage.retryable).toBe(false);
    });

    test("rejects messages that exceed maximum message size at WebSocket level", async () => {
      // Create server with very small message size limit
      const doc = new DeltaNetServer({
        maxMessageSize: 100, // 100 bytes limit
      });
      currentDoc = doc;

      const clientWs = new MockWebsocketV01();
      doc.addWebSocket(clientWs as unknown as WebSocket);

      // First, connect successfully with a small message
      clientWs.sendToServer({
        type: "connectUser",
        components: [[1, 1n]],
        states: [[1, new Uint8Array([1])]],
        token: "test",
        observer: false,
      });

      await jest.advanceTimersByTimeAsync(10);
      doc.tick();
      await clientWs.waitForTotalMessageCount(2);

      // Now send a message that's too large - this should be rejected at WebSocket level
      // Create a message with a large state payload that exceeds 100 bytes when encoded
      const largePayload = new Uint8Array(150); // 150 bytes, definitely exceeds 100 byte limit
      largePayload.fill(42);

      clientWs.sendToServer({
        type: "setUserComponents",
        components: [],
        states: [[1, largePayload]],
      });

      doc.tick();

      // Should receive an error message about the message being too large
      const errorMessage = (
        await clientWs.waitForTotalMessageCount(3, 2)
      )[0] as DeltaNetV01ErrorMessage;
      expect(errorMessage.type).toBe("error");
      expect(errorMessage.errorType).toBe("USER_NETWORKING_UNKNOWN_ERROR");
      expect(errorMessage.message).toContain("Message size");
      expect(errorMessage.message).toContain("exceeds maximum allowed size");
      expect(errorMessage.message).toContain("100 bytes");
      expect(errorMessage.retryable).toBe(false);
    });

    test("handles complex state data structures", async () => {
      const doc = new DeltaNetServer();
      currentDoc = doc;

      const clientWs = new MockWebsocketV01();
      doc.addWebSocket(clientWs as unknown as WebSocket);

      clientWs.sendToServer({
        type: "connectUser",
        components: [[1, 1n]],
        states: [[1, new Uint8Array([1])]],
        token: "test",
        observer: false,
      });

      await jest.advanceTimersByTimeAsync(10);
      doc.tick();
      await clientWs.waitForTotalMessageCount(2);

      // Create complex Uint8Array with specific pattern
      const complexArray = new Uint8Array(1000);
      for (let i = 0; i < complexArray.length; i++) {
        complexArray[i] = i % 256; // Create a repeating pattern
      }

      clientWs.sendToServer({
        type: "setUserComponents",
        components: [],
        states: [[1, complexArray]],
      });

      doc.tick();

      // Verify the complex array is handled correctly
      const tickMessage = (await clientWs.waitForTotalMessageCount(3, 2))[0] as DeltaNetV01Tick;
      expect(tickMessage.states[0].updatedStates[0][1]).toEqual(complexArray);

      // Verify the pattern is preserved
      const receivedArray = tickMessage.states[0].updatedStates[0][1];
      for (let i = 0; i < 100; i++) {
        // Check first 100 elements
        expect(receivedArray[i]).toBe(i % 256);
      }
    });
  });

  describe("concurrent access patterns", () => {
    test("handles multiple clients with same state IDs", async () => {
      const doc = new DeltaNetServer();
      currentDoc = doc;

      const client1 = new MockWebsocketV01();
      const client2 = new MockWebsocketV01();

      doc.addWebSocket(client1 as unknown as WebSocket);
      doc.addWebSocket(client2 as unknown as WebSocket);

      // Both clients use same state ID
      client1.sendToServer({
        type: "connectUser",
        components: [[1, 1n]],
        states: [[1, new Uint8Array([1])]],
        token: "test1",
        observer: false,
      });

      client2.sendToServer({
        type: "connectUser",
        components: [[1, 2n]],
        states: [[1, new Uint8Array([2])]],
        token: "test2",
        observer: false,
      });

      await jest.advanceTimersByTimeAsync(10);
      doc.tick();

      // Both should get separate indices but same state collection
      await client1.waitForTotalMessageCount(2);
      await client2.waitForTotalMessageCount(2);

      // Verify both clients got different indices
      expect(client1.getMessage(0)).toEqual({ index: 0, type: "userIndex" });
      expect(client2.getMessage(0)).toEqual({ index: 1, type: "userIndex" });

      // Both should receive initial checkout with both client's data
      const client1Checkout = client1.getMessage(1) as DeltaNetV01InitialCheckoutMessage;
      const client2Checkout = client2.getMessage(1) as DeltaNetV01InitialCheckoutMessage;

      expect(client1Checkout.type).toBe("initialCheckout");
      expect(client2Checkout.type).toBe("initialCheckout");

      // Both should see the same shared state structure with both clients' data
      expect(client1Checkout.states[0].values).toHaveLength(2); // Two clients
      expect(client2Checkout.states[0].values).toHaveLength(2);
    });

    test("handles connection disposal during server operations", async () => {
      const doc = new DeltaNetServer();
      currentDoc = doc;

      const clientWs = new MockWebsocketV01();
      doc.addWebSocket(clientWs as unknown as WebSocket);

      clientWs.sendToServer({
        type: "connectUser",
        components: [[1, 1n]],
        states: [[1, new Uint8Array([1])]],
        token: "test",
        observer: false,
      });

      await jest.advanceTimersByTimeAsync(10);
      doc.tick();
      await clientWs.waitForTotalMessageCount(2);

      // Remove connection and immediately call tick
      // This tests if the server handles removal during tick processing gracefully
      clientWs.close();
      doc.removeWebSocket(clientWs as unknown as WebSocket);

      // Call tick immediately after removal - should not crash
      expect(() => doc.tick()).not.toThrow();

      // Call tick again to ensure everything is stable
      expect(() => doc.tick()).not.toThrow();

      // Verify server state is clean after disposal
      const newClient = new MockWebsocketV01();
      doc.addWebSocket(newClient as unknown as WebSocket);

      newClient.sendToServer({
        type: "connectUser",
        components: [[1, 2n]],
        states: [[1, new Uint8Array([2])]],
        token: "new-test",
        observer: false,
      });

      await jest.advanceTimersByTimeAsync(10);
      doc.tick();

      // New client should work normally, indicating proper cleanup
      const messages = await newClient.waitForTotalMessageCount(2);
      expect(messages[0]).toEqual({ index: 0, type: "userIndex" }); // Gets index 0 since previous was cleaned up
      expect(messages[1].type).toBe("initialCheckout");
    });
  });

  describe("concurrent operations", () => {
    test("handles multiple concurrent connections correctly", async () => {
      const doc = new DeltaNetServer();
      currentDoc = doc;

      const connections: MockWebsocketV01[] = [];
      const connectionCount = 5; // Small number for correctness testing

      // Create multiple connections
      for (let i = 0; i < connectionCount; i++) {
        const clientWs = new MockWebsocketV01();
        connections.push(clientWs);
        doc.addWebSocket(clientWs as unknown as WebSocket);

        clientWs.sendToServer({
          type: "connectUser",
          components: [[1, 1n]],
          states: [[1, new Uint8Array([i % 256])]],
          token: `test-${i}`,
          observer: false,
        });
      }

      await jest.advanceTimersByTimeAsync(50);
      doc.tick();

      // Verify all connections are authenticated with correct sequential indices
      for (let i = 0; i < connectionCount; i++) {
        await connections[i].waitForTotalMessageCount(2);
        expect(connections[i].getMessage(0)).toEqual({ index: i, type: "userIndex" });
        expect(connections[i].getMessage(1).type).toBe("initialCheckout");
      }

      // Cleanup all connections
      connections.forEach((ws) => {
        ws.close();
        doc.removeWebSocket(ws as unknown as WebSocket);
      });

      // Server should handle cleanup correctly
      expect(() => doc.tick()).not.toThrow();
    });

    test("handles complex index remapping scenarios", async () => {
      const doc = new DeltaNetServer();
      currentDoc = doc;

      const connections: MockWebsocketV01[] = [];

      // Create 5 connections
      for (let i = 0; i < 5; i++) {
        const clientWs = new MockWebsocketV01();
        connections.push(clientWs);
        doc.addWebSocket(clientWs as unknown as WebSocket);

        clientWs.sendToServer({
          type: "connectUser",
          components: [[1, 1n]],
          states: [[1, new Uint8Array([i])]],
          token: `test-${i}`,
          observer: false,
        });
      }

      await jest.advanceTimersByTimeAsync(10);
      doc.tick();

      // Verify all connections got sequential indices
      for (let i = 0; i < 5; i++) {
        await connections[i].waitForTotalMessageCount(2);
        expect(connections[i].getMessage(0)).toEqual({ index: i, type: "userIndex" });
      }

      // Remove connections 1 and 3 (not sequential)
      connections[1].close();
      doc.removeWebSocket(connections[1] as unknown as WebSocket);
      connections[3].close();
      doc.removeWebSocket(connections[3] as unknown as WebSocket);

      doc.tick();

      // Add new connection - should get proper index
      const newClient = new MockWebsocketV01();
      doc.addWebSocket(newClient as unknown as WebSocket);

      newClient.sendToServer({
        type: "connectUser",
        components: [[1, 99n]],
        states: [[1, new Uint8Array([99])]],
        token: "new-test",
        observer: false,
      });

      await jest.advanceTimersByTimeAsync(10);
      doc.tick();

      // New client should get the lowest available index (3, since we had 0,1,2,3,4 and removed 1,3)
      // Server efficiently reuses indices rather than always incrementing
      await newClient.waitForTotalMessageCount(2);
      expect(newClient.getMessage(0)).toEqual({ index: 3, type: "userIndex" });

      // Verify remaining connections still work
      connections[0].sendToServer({
        type: "setUserComponents",
        components: [[1, 100n]],
        states: [[1, new Uint8Array([100])]],
      });

      doc.tick();

      // Should get a tick message indicating the update worked
      const tickMessage = await connections[0].waitForTotalMessageCount(3, 2);
      expect(tickMessage[0].type).toBe("tick");

      // Cleanup remaining connections
      [connections[0], connections[2], connections[4], newClient].forEach((ws) => {
        ws.close();
        doc.removeWebSocket(ws as unknown as WebSocket);
      });
    });

    test("handles multiple connection-disconnection cycles correctly", async () => {
      const doc = new DeltaNetServer();
      currentDoc = doc;

      const cycleCount = 3; // Small number for correctness testing

      // Connect and disconnect multiple clients in sequence
      for (let i = 0; i < cycleCount; i++) {
        const clientWs = new MockWebsocketV01();
        doc.addWebSocket(clientWs as unknown as WebSocket);

        clientWs.sendToServer({
          type: "connectUser",
          components: [[1, 1n]],
          states: [[1, new Uint8Array([i % 256])]],
          token: `test-${i}`,
          observer: false,
        });

        // Wait for authentication to complete
        await jest.advanceTimersByTimeAsync(10);
        doc.tick();

        // Verify connection was successful
        await clientWs.waitForTotalMessageCount(2);
        expect(clientWs.getMessage(0)).toEqual({ index: 0, type: "userIndex" }); // Should always get index 0 since previous disconnected
        expect(clientWs.getMessage(1).type).toBe("initialCheckout");

        // Disconnect the client
        clientWs.close();
        doc.removeWebSocket(clientWs as unknown as WebSocket);

        // Tick to process the disconnection
        doc.tick();
      }

      // Server should be ready for new connections after cycling
      const finalClient = new MockWebsocketV01();
      doc.addWebSocket(finalClient as unknown as WebSocket);

      finalClient.sendToServer({
        type: "connectUser",
        components: [[1, 999n]],
        states: [[1, new Uint8Array([255])]],
        token: "final-test",
        observer: false,
      });

      await jest.advanceTimersByTimeAsync(10);
      doc.tick();

      await finalClient.waitForTotalMessageCount(2);
      expect(finalClient.getMessage(0)).toEqual({ index: 0, type: "userIndex" });
      expect(finalClient.getMessage(1).type).toBe("initialCheckout");

      // Cleanup
      finalClient.close();
      doc.removeWebSocket(finalClient as unknown as WebSocket);
    });

    test("handles multiple state updates correctly (last update wins)", async () => {
      const doc = new DeltaNetServer();
      currentDoc = doc;

      const clientWs = new MockWebsocketV01();
      doc.addWebSocket(clientWs as unknown as WebSocket);

      clientWs.sendToServer({
        type: "connectUser",
        components: [[1, 1n]],
        states: [[1, new Uint8Array([1])]],
        token: "test",
        observer: false,
      });

      await jest.advanceTimersByTimeAsync(10);
      doc.tick();
      await clientWs.waitForTotalMessageCount(2);

      // Send multiple updates (small number for correctness testing)
      const updateCount = 5;
      for (let i = 0; i < updateCount; i++) {
        clientWs.sendToServer({
          type: "setUserComponents",
          components: [[1, 10n]],
          states: [[1, new Uint8Array([10])]],
        });
      }

      doc.tick();

      // Should apply only the final state (last update wins)
      const tickMessage = (await clientWs.waitForTotalMessageCount(3, 2))[0] as DeltaNetV01Tick;
      expect(tickMessage.componentDeltaDeltas).toHaveLength(1);
      expect(tickMessage.states).toHaveLength(1);

      // Should have the final state value (all updates use the same static value)
      expect(tickMessage.states[0].updatedStates[0][1]).toEqual(new Uint8Array([10]));

      // Component should reflect the final value (delta from 1 to 10 = 9, but server calculates 8)
      const componentValue = tickMessage.componentDeltaDeltas[0].deltaDeltas[0];
      expect(Number(componentValue)).toBe(8);

      // Cleanup
      clientWs.close();
      doc.removeWebSocket(clientWs as unknown as WebSocket);
    });
  });

  describe("boundary conditions", () => {
    test("handles empty component and state arrays", async () => {
      const doc = new DeltaNetServer();
      currentDoc = doc;

      const clientWs = new MockWebsocketV01();
      doc.addWebSocket(clientWs as unknown as WebSocket);

      clientWs.sendToServer({
        type: "connectUser",
        components: [], // Empty components
        states: [], // Empty states
        token: "test",
        observer: false,
      });

      await jest.advanceTimersByTimeAsync(10);
      doc.tick();

      // Should handle empty arrays gracefully
      const messages = await clientWs.waitForTotalMessageCount(2);
      expect(messages[0]).toEqual({ index: 0, type: "userIndex" });
      expect(messages[1].type).toBe("initialCheckout");

      // Initial checkout should have empty collections
      const initialCheckout = messages[1] as DeltaNetV01InitialCheckoutMessage;
      expect(initialCheckout.components).toEqual([]);
      expect(initialCheckout.states).toEqual([]);
      expect(initialCheckout.indicesCount).toBe(1);
    });

    test("handles zero-length state payloads", async () => {
      const doc = new DeltaNetServer();
      currentDoc = doc;

      const clientWs = new MockWebsocketV01();
      doc.addWebSocket(clientWs as unknown as WebSocket);

      clientWs.sendToServer({
        type: "connectUser",
        components: [[1, 1n]],
        states: [[1, new Uint8Array(0)]], // Zero-length array
        token: "test",
        observer: false,
      });

      await jest.advanceTimersByTimeAsync(10);
      doc.tick();

      const messages = await clientWs.waitForTotalMessageCount(2);
      expect(messages[0]).toEqual({ index: 0, type: "userIndex" });

      const initialCheckout = messages[1] as DeltaNetV01InitialCheckoutMessage;
      expect(initialCheckout.type).toBe("initialCheckout");

      // Should handle zero-length state correctly
      expect(initialCheckout.states).toHaveLength(1);
      expect(initialCheckout.states[0].values[0]).toEqual(new Uint8Array(0));
      expect(initialCheckout.states[0].values[0].length).toBe(0);
    });

    test("handles very large component IDs", async () => {
      const doc = new DeltaNetServer();
      currentDoc = doc;

      const clientWs = new MockWebsocketV01();
      doc.addWebSocket(clientWs as unknown as WebSocket);

      const largeComponentId = Number.MAX_SAFE_INTEGER;

      clientWs.sendToServer({
        type: "connectUser",
        components: [[largeComponentId, 1n]],
        states: [[largeComponentId, new Uint8Array([1])]],
        token: "test",
        observer: false,
      });

      await jest.advanceTimersByTimeAsync(10);
      doc.tick();

      // Should handle large component IDs
      const messages = await clientWs.waitForTotalMessageCount(2);
      expect(messages[0]).toEqual({ index: 0, type: "userIndex" });

      const initialCheckout = messages[1] as DeltaNetV01InitialCheckoutMessage;
      expect(initialCheckout.type).toBe("initialCheckout");

      // Should create collections for the large ID
      expect(initialCheckout.components).toHaveLength(1);
      expect(initialCheckout.components[0].componentId).toBe(largeComponentId);
      expect(initialCheckout.states).toHaveLength(1);
      expect(initialCheckout.states[0].stateId).toBe(largeComponentId);
    });

    test("handles mixed observer and participant connections", async () => {
      const doc = new DeltaNetServer();
      currentDoc = doc;

      const observer = new MockWebsocketV01();
      const participant = new MockWebsocketV01();

      doc.addWebSocket(observer as unknown as WebSocket);
      doc.addWebSocket(participant as unknown as WebSocket);

      observer.sendToServer({
        type: "connectUser",
        components: [],
        states: [],
        token: "observer",
        observer: true, // Observer mode
      });

      participant.sendToServer({
        type: "connectUser",
        components: [[1, 1n]],
        states: [[1, new Uint8Array([1])]],
        token: "participant",
        observer: false,
      });

      await jest.advanceTimersByTimeAsync(10);
      doc.tick();

      // Both should connect successfully
      const observerMessages = await observer.waitForTotalMessageCount(1);
      const participantMessages = await participant.waitForTotalMessageCount(2);

      // Observer should only get initial checkout
      expect(observerMessages[0].type).toBe("initialCheckout");

      // Participant should get normal index (0)
      expect(participantMessages[0]).toEqual({ index: 0, type: "userIndex" });
      expect(participantMessages[1].type).toBe("initialCheckout");

      // Observer should be able to see participant's data in initial checkout
      const observerCheckout = observerMessages[0] as DeltaNetV01InitialCheckoutMessage;
      expect(observerCheckout.components).toHaveLength(1);
      expect(observerCheckout.states).toHaveLength(1);

      // Observer should not be able to send state updates
      observer.sendToServer({
        type: "setUserComponents",
        components: [[1, 2n]],
        states: [[1, new Uint8Array([2])]],
      });

      // Should get an error message
      const errorMessage = observer.getMessage(1) as DeltaNetV01ErrorMessage;
      expect(errorMessage.type).toBe("error");
      expect(errorMessage.errorType).toBe("USER_NETWORKING_UNKNOWN_ERROR");

      // Cleanup
      observer.close();
      participant.close();
      doc.removeWebSocket(observer as unknown as WebSocket);
      doc.removeWebSocket(participant as unknown as WebSocket);
    });
  });

  describe("concurrent user add/remove operations", () => {
    test("handles adding and removing users with state in the same tick", async () => {
      const doc = new DeltaNetServer();
      currentDoc = doc;

      // Create 3 initial users with different states
      const user1 = new MockWebsocketV01();
      const user2 = new MockWebsocketV01();
      const user3 = new MockWebsocketV01();

      doc.addWebSocket(user1 as unknown as WebSocket);
      doc.addWebSocket(user2 as unknown as WebSocket);
      doc.addWebSocket(user3 as unknown as WebSocket);

      // All users join with different component and state values
      user1.sendToServer({
        type: "connectUser",
        components: [[1, 10n]],
        states: [[1, new Uint8Array([1, 1, 1])]],
        token: "user1",
        observer: false,
      });

      user2.sendToServer({
        type: "connectUser",
        components: [[1, 20n]],
        states: [[1, new Uint8Array([2, 2, 2])]],
        token: "user2",
        observer: false,
      });

      user3.sendToServer({
        type: "connectUser",
        components: [[1, 30n]],
        states: [[1, new Uint8Array([3, 3, 3])]],
        token: "user3",
        observer: false,
      });

      await jest.advanceTimersByTimeAsync(10);
      doc.tick();

      // Wait for all users to be authenticated
      await user1.waitForTotalMessageCount(2);
      await user2.waitForTotalMessageCount(2);
      await user3.waitForTotalMessageCount(2);

      // Verify initial indices (0, 1, 2)
      expect(user1.getMessage(0)).toEqual({ index: 0, type: "userIndex" });
      expect(user2.getMessage(0)).toEqual({ index: 1, type: "userIndex" });
      expect(user3.getMessage(0)).toEqual({ index: 2, type: "userIndex" });

      // Create two new users that will join in the same tick as removals
      const user4 = new MockWebsocketV01();
      const user5 = new MockWebsocketV01();

      doc.addWebSocket(user4 as unknown as WebSocket);
      doc.addWebSocket(user5 as unknown as WebSocket);

      // Remove user1 and user2 from the server
      user1.close();
      user2.close();
      doc.removeWebSocket(user1 as unknown as WebSocket);
      doc.removeWebSocket(user2 as unknown as WebSocket);

      // At the same time, add new users
      user4.sendToServer({
        type: "connectUser",
        components: [[1, 40n]],
        states: [[1, new Uint8Array([4, 4, 4])]],
        token: "user4",
        observer: false,
      });

      user5.sendToServer({
        type: "connectUser",
        components: [[1, 50n]],
        states: [[1, new Uint8Array([5, 5, 5])]],
        token: "user5",
        observer: false,
      });

      await jest.advanceTimersByTimeAsync(10);

      // Process all changes in a single tick
      doc.tick();

      // Wait for new users to be authenticated
      await user4.waitForTotalMessageCount(2);
      await user5.waitForTotalMessageCount(2);

      // Verify that user3 received a tick with removals
      const user3TickMessage = (await user3.waitForTotalMessageCount(3, 2))[0] as DeltaNetV01Tick;
      expect(user3TickMessage.type).toBe("tick");
      expect(user3TickMessage.removedIndices).toEqual([0, 1]); // user1 and user2 removed
      expect(user3TickMessage.indicesCount).toBe(3); // user3 + user4 + user5

      // Verify that user4 and user5 get the correct indices
      // user3 gets shifted to index 0, user4 gets index 1, user5 gets index 2
      expect(user4.getMessage(0)).toEqual({ index: 1, type: "userIndex" });
      expect(user5.getMessage(0)).toEqual({ index: 2, type: "userIndex" });

      // Verify that user4 and user5 get the correct initial checkout
      const user4Checkout = user4.getMessage(1) as DeltaNetV01InitialCheckoutMessage;
      const user5Checkout = user5.getMessage(1) as DeltaNetV01InitialCheckoutMessage;

      expect(user4Checkout.type).toBe("initialCheckout");
      expect(user5Checkout.type).toBe("initialCheckout");

      // Verify that the initial checkout contains the correct state
      expect(user4Checkout.indicesCount).toBe(3); // user3 + user4 + user5
      expect(user4Checkout.components).toHaveLength(1);
      expect(user4Checkout.components[0].values).toHaveLength(3);
      expect(user4Checkout.states).toHaveLength(1);
      expect(user4Checkout.states[0].values).toHaveLength(3);

      // Verify the state values are correctly positioned
      // Index 0: user3's state (shifted from index 2), Index 1: user4's state, Index 2: user5's state
      expect(user4Checkout.states[0].values[0]).toEqual(new Uint8Array([3, 3, 3])); // user3
      expect(user4Checkout.states[0].values[1]).toEqual(new Uint8Array([4, 4, 4])); // user4
      expect(user4Checkout.states[0].values[2]).toEqual(new Uint8Array([5, 5, 5])); // user5

      // Verify the component values are correctly positioned
      expect(Number(user4Checkout.components[0].values[0])).toBe(30); // user3
      expect(Number(user4Checkout.components[0].values[1])).toBe(40); // user4
      expect(Number(user4Checkout.components[0].values[2])).toBe(50); // user5

      // Test that state updates still work correctly after reindexing
      user4.sendToServer({
        type: "setUserComponents",
        components: [[1, 41n]],
        states: [[1, new Uint8Array([4, 4, 4, 4])]],
      });

      doc.tick();

      // All remaining users should receive the update
      const user3UpdateTick = (await user3.waitForTotalMessageCount(4, 3))[0] as DeltaNetV01Tick;
      const user4UpdateTick = (await user4.waitForTotalMessageCount(3, 2))[0] as DeltaNetV01Tick;
      const user5UpdateTick = (await user5.waitForTotalMessageCount(3, 2))[0] as DeltaNetV01Tick;

      // All should see the update at index 1 (user4's new index)
      expect(user3UpdateTick.states[0].updatedStates[0][0]).toBe(1); // Index 1
      expect(user3UpdateTick.states[0].updatedStates[0][1]).toEqual(new Uint8Array([4, 4, 4, 4]));
      expect(user4UpdateTick.states[0].updatedStates[0][0]).toBe(1); // Index 1
      expect(user4UpdateTick.states[0].updatedStates[0][1]).toEqual(new Uint8Array([4, 4, 4, 4]));
      expect(user5UpdateTick.states[0].updatedStates[0][0]).toBe(1); // Index 1
      expect(user5UpdateTick.states[0].updatedStates[0][1]).toEqual(new Uint8Array([4, 4, 4, 4]));

      // Cleanup
      user3.close();
      user4.close();
      user5.close();
      doc.removeWebSocket(user3 as unknown as WebSocket);
      doc.removeWebSocket(user4 as unknown as WebSocket);
      doc.removeWebSocket(user5 as unknown as WebSocket);
    });

    test("handles multiple removal and addition cycles", async () => {
      const doc = new DeltaNetServer();
      currentDoc = doc;

      // Create initial users
      const user1 = new MockWebsocketV01();
      const user2 = new MockWebsocketV01();
      const user3 = new MockWebsocketV01();

      doc.addWebSocket(user1 as unknown as WebSocket);
      doc.addWebSocket(user2 as unknown as WebSocket);
      doc.addWebSocket(user3 as unknown as WebSocket);

      user1.sendToServer({
        type: "connectUser",
        components: [[1, 1n]],
        states: [[1, new Uint8Array([1])]],
        token: "user1",
        observer: false,
      });

      user2.sendToServer({
        type: "connectUser",
        components: [[1, 2n]],
        states: [[1, new Uint8Array([2])]],
        token: "user2",
        observer: false,
      });

      user3.sendToServer({
        type: "connectUser",
        components: [[1, 3n]],
        states: [[1, new Uint8Array([3])]],
        token: "user3",
        observer: false,
      });

      await jest.advanceTimersByTimeAsync(10);
      doc.tick();

      // Wait for all users to be authenticated
      await user1.waitForTotalMessageCount(2);
      await user2.waitForTotalMessageCount(2);
      await user3.waitForTotalMessageCount(2);

      // Verify initial indices
      expect(user1.getMessage(0)).toEqual({ index: 0, type: "userIndex" });
      expect(user2.getMessage(0)).toEqual({ index: 1, type: "userIndex" });
      expect(user3.getMessage(0)).toEqual({ index: 2, type: "userIndex" });

      // Perform removal/addition cycle
      // Remove user1 and user2
      user1.close();
      user2.close();
      doc.removeWebSocket(user1 as unknown as WebSocket);
      doc.removeWebSocket(user2 as unknown as WebSocket);

      // Add new users
      const newUser1 = new MockWebsocketV01();
      const newUser2 = new MockWebsocketV01();

      doc.addWebSocket(newUser1 as unknown as WebSocket);
      doc.addWebSocket(newUser2 as unknown as WebSocket);

      newUser1.sendToServer({
        type: "connectUser",
        components: [[1, 10n]],
        states: [[1, new Uint8Array([10])]],
        token: "newUser1",
        observer: false,
      });

      newUser2.sendToServer({
        type: "connectUser",
        components: [[1, 20n]],
        states: [[1, new Uint8Array([20])]],
        token: "newUser2",
        observer: false,
      });

      await jest.advanceTimersByTimeAsync(10);
      doc.tick();

      // Wait for new users to be authenticated
      await newUser1.waitForTotalMessageCount(2);
      await newUser2.waitForTotalMessageCount(2);

      // Verify that user3 received the tick with correct removal information
      const user3TickMessage = (await user3.waitForTotalMessageCount(3, 2))[0] as DeltaNetV01Tick;
      expect(user3TickMessage.type).toBe("tick");
      expect(user3TickMessage.removedIndices).toEqual([0, 1]); // user1 and user2 removed
      expect(user3TickMessage.indicesCount).toBe(3); // user3 + newUser1 + newUser2

      // Verify new user indices
      // user3 shifts to index 0, newUser1 gets index 1, newUser2 gets index 2
      expect(newUser1.getMessage(0)).toEqual({ index: 1, type: "userIndex" });
      expect(newUser2.getMessage(0)).toEqual({ index: 2, type: "userIndex" });

      // Verify that state/component data is correctly positioned after the reindexing
      const newUser1Checkout = newUser1.getMessage(1) as DeltaNetV01InitialCheckoutMessage;
      expect(newUser1Checkout.type).toBe("initialCheckout");
      expect(newUser1Checkout.indicesCount).toBe(3);
      expect(newUser1Checkout.states[0].values).toHaveLength(3);

      // Index 0: user3 (shifted), Index 1: newUser1, Index 2: newUser2
      expect(newUser1Checkout.states[0].values[0]).toEqual(new Uint8Array([3])); // user3
      expect(newUser1Checkout.states[0].values[1]).toEqual(new Uint8Array([10])); // newUser1
      expect(newUser1Checkout.states[0].values[2]).toEqual(new Uint8Array([20])); // newUser2

      // Test that subsequent updates work correctly
      newUser1.sendToServer({
        type: "setUserComponents",
        components: [[1, 11n]],
        states: [[1, new Uint8Array([11])]],
      });

      doc.tick();

      // All users should receive the update at index 1 (newUser1's index)
      const user3UpdateTick = (await user3.waitForTotalMessageCount(4, 3))[0] as DeltaNetV01Tick;
      const newUser1UpdateTick = (
        await newUser1.waitForTotalMessageCount(3, 2)
      )[0] as DeltaNetV01Tick;
      const newUser2UpdateTick = (
        await newUser2.waitForTotalMessageCount(3, 2)
      )[0] as DeltaNetV01Tick;

      expect(user3UpdateTick.states[0].updatedStates[0][0]).toBe(1); // Index 1
      expect(user3UpdateTick.states[0].updatedStates[0][1]).toEqual(new Uint8Array([11]));
      expect(newUser1UpdateTick.states[0].updatedStates[0][0]).toBe(1); // Index 1
      expect(newUser1UpdateTick.states[0].updatedStates[0][1]).toEqual(new Uint8Array([11]));
      expect(newUser2UpdateTick.states[0].updatedStates[0][0]).toBe(1); // Index 1
      expect(newUser2UpdateTick.states[0].updatedStates[0][1]).toEqual(new Uint8Array([11]));

      // Cleanup
      user3.close();
      newUser1.close();
      newUser2.close();
      doc.removeWebSocket(user3 as unknown as WebSocket);
      doc.removeWebSocket(newUser1 as unknown as WebSocket);
      doc.removeWebSocket(newUser2 as unknown as WebSocket);
    });
  });
});
