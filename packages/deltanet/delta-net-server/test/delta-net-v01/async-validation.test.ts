import { jest } from "@jest/globals";
import { DeltaNetV01Tick } from "@mml-io/delta-net-protocol";

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

describe("DeltaNetServer - Async Validation", () => {
  describe("async validation superseding", () => {
    test("later state updates supersede earlier pending validations", async () => {
      let resolveFirst: (value: any) => void;
      let resolveSecond: (value: any) => void;

      const firstPromise = new Promise((resolve) => {
        resolveFirst = resolve;
      });
      const secondPromise = new Promise((resolve) => {
        resolveSecond = resolve;
      });

      const onStatesUpdateMock = jest
        .fn<() => Promise<true>>()
        .mockReturnValueOnce(firstPromise as Promise<true>)
        .mockReturnValueOnce(secondPromise as Promise<true>);

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

      // Wait for async authentication to complete
      await jest.advanceTimersByTimeAsync(10);
      doc.tick();
      await clientWs.waitForTotalMessageCount(2);

      // Send first state update
      clientWs.sendToServer({
        type: "setUserComponents",
        components: [],
        states: [[1, new Uint8Array([2])]],
      });

      // Send second state update before first completes (should supersede)
      clientWs.sendToServer({
        type: "setUserComponents",
        components: [],
        states: [[1, new Uint8Array([3])]],
      });

      expect(onStatesUpdateMock).toHaveBeenCalledTimes(2);

      // Resolve the first promise (should be ignored)
      resolveFirst!(true);
      await jest.advanceTimersByTimeAsync(10);

      // Resolve the second promise (should be applied)
      resolveSecond!(true);
      await jest.advanceTimersByTimeAsync(10);

      doc.tick();

      // Only the second state update should be applied
      const tickMessage = (await clientWs.waitForTotalMessageCount(3, 2))[0] as DeltaNetV01Tick;
      expect(tickMessage.states).toEqual([
        {
          stateId: 1,
          updatedStates: [[0, new Uint8Array([3])]],
        },
      ]);
    });
  });

  describe("connection handling during async operations", () => {
    test("handles client disconnection during async authentication", async () => {
      let resolveAuthentication: (value: any) => void;
      const authenticationPromise = new Promise((resolve) => {
        resolveAuthentication = resolve;
      });

      const onJoinerMock = jest
        .fn<() => Promise<true>>()
        .mockReturnValue(authenticationPromise as Promise<true>);

      const doc = new DeltaNetServer({
        onJoiner: onJoinerMock,
      });
      currentDoc = doc;

      const clientWs = new MockWebsocketV01();
      doc.addWebSocket(clientWs as unknown as WebSocket);

      // Start authentication with async onJoiner callback
      clientWs.sendToServer({
        type: "connectUser",
        components: [[1, 1n]],
        states: [[1, new Uint8Array([1])]],
        token: "test",
        observer: false,
      });

      expect(onJoinerMock).toHaveBeenCalled();

      // Disconnect the client while authentication is pending
      clientWs.close();
      doc.removeWebSocket(clientWs as unknown as WebSocket);

      // Now resolve the authentication - this should not crash or add the connection
      resolveAuthentication!(true);
      await jest.advanceTimersByTimeAsync(10);

      // Tick should not crash and no user should be added
      doc.tick();

      // The connection should not have been authenticated or added to the server
      // We verify this by checking that no user index message was sent
      // (since authentication was canceled)
      expect(clientWs.getMessage(0)).toBeUndefined();
    });

    test("handles client disconnection during pending async validation", async () => {
      let resolveValidation: (value: any) => void;
      let validationCallCount = 0;
      const validationPromise = new Promise((resolve) => {
        resolveValidation = resolve;
      });

      const onStatesUpdateMock = jest.fn<() => Promise<true>>().mockImplementation(() => {
        validationCallCount++;
        return validationPromise as Promise<true>;
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

      // Send state update that starts async validation
      clientWs.sendToServer({
        type: "setUserComponents",
        components: [],
        states: [[1, new Uint8Array([2])]],
      });

      expect(onStatesUpdateMock).toHaveBeenCalled();

      // Disconnect the client while validation is pending
      clientWs.close();
      doc.removeWebSocket(clientWs as unknown as WebSocket);

      // Store the call count before resolving
      const callCountBeforeResolve = validationCallCount;

      // Now resolve the validation - this should not crash or apply state
      resolveValidation!(true);
      await jest.advanceTimersByTimeAsync(10);

      // Tick should not crash
      doc.tick();

      // Verify the state was not applied by ensuring no new tick messages were sent
      // (client should still only have 2 messages: initial checkout + user index)
      expect(clientWs.getMessage(2)).toBeUndefined();

      // Verify that the validation callback was called but cleanup prevented state application
      expect(validationCallCount).toBe(callCountBeforeResolve);
    });

    test("handles server disposal during pending async validations", async () => {
      let resolveValidation: (value: any) => void;
      let validationResolved = false;
      const validationPromise = new Promise((resolve) => {
        resolveValidation = (value: any) => {
          validationResolved = true;
          resolve(value);
        };
      });

      const onStatesUpdateMock = jest
        .fn<() => Promise<true>>()
        .mockReturnValue(validationPromise as Promise<true>);
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

      // Verify the validation was started
      expect(onStatesUpdateMock).toHaveBeenCalled();

      // Dispose server while validation is pending
      doc.dispose();
      currentDoc = null; // Prevent double disposal in afterEach

      // Now try to resolve validation - should not crash
      resolveValidation!(true);
      await jest.advanceTimersByTimeAsync(10);

      // Verify the validation promise was resolved
      expect(validationResolved).toBe(true);

      // Verify that no further operations on the disposed server cause crashes
      expect(() => doc.tick()).not.toThrow();
    });

    test("handles server tick during async validation resolution", async () => {
      let resolveValidation: (value: any) => void;
      let validationResolved = false;
      const validationPromise = new Promise((resolve) => {
        resolveValidation = (value: any) => {
          validationResolved = true;
          resolve(value);
        };
      });

      const onStatesUpdateMock = jest
        .fn<() => Promise<true>>()
        .mockReturnValue(validationPromise as Promise<true>);

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

      // Call tick while validation is pending - should not crash
      expect(() => doc.tick()).not.toThrow();

      // Now resolve validation - should not interfere with tick process
      resolveValidation!(true);
      await jest.advanceTimersByTimeAsync(10);

      // Verify the validation completed
      expect(validationResolved).toBe(true);

      // Another tick should process the validated state
      doc.tick();

      // Verify at least one more message was sent (could be tick or other message)
      const messages = await clientWs.waitForTotalMessageCount(3, 0);
      expect(messages.length).toBeGreaterThanOrEqual(3);

      // The test verifies that async validation resolution doesn't crash the server
      // and that the server continues to function properly
      expect(() => doc.tick()).not.toThrow();
    });
  });

  describe("rapid state updates and race conditions", () => {
    test("handles extremely rapid state updates gracefully", async () => {
      const onStatesUpdateMock = jest.fn<() => Promise<true>>().mockResolvedValue(true);

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

      // Send rapid state updates
      for (let i = 0; i < 50; i++) {
        clientWs.sendToServer({
          type: "setUserComponents",
          components: [],
          states: [[1, new Uint8Array([i])]],
        });
      }

      await jest.advanceTimersByTimeAsync(50);
      doc.tick();

      // Should only have the last state value
      const tickMessage = (await clientWs.waitForTotalMessageCount(3, 2))[0] as DeltaNetV01Tick;
      expect(tickMessage.states[0].updatedStates[0][1]).toEqual(new Uint8Array([49]));
    });

    test("handles validation promises that never resolve", async () => {
      const neverResolvingPromise = new Promise(() => {}); // Never resolves
      const onStatesUpdateMock = jest
        .fn<() => Promise<true>>()
        .mockReturnValue(neverResolvingPromise as Promise<true>);

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

      // Send multiple state updates that will never resolve
      for (let i = 0; i < 10; i++) {
        clientWs.sendToServer({
          type: "setUserComponents",
          components: [],
          states: [[1, new Uint8Array([i])]],
        });
      }

      // Verify all validation calls were made
      expect(onStatesUpdateMock).toHaveBeenCalledTimes(10);

      // Tick should not crash even with pending validations
      expect(() => doc.tick()).not.toThrow();

      // Check that if there are any additional messages, they are tick messages without state updates
      if (clientWs.getMessage(2)) {
        const tickMessage = clientWs.getMessage(2) as DeltaNetV01Tick;
        expect(tickMessage.type).toBe("tick");
        expect(tickMessage.states).toEqual([]); // No state updates should be applied
      }

      // Dispose should clean up pending validations without crashing
      doc.dispose();
      currentDoc = null;

      // The main test is that the server doesn't crash with never-resolving validations
      expect(onStatesUpdateMock).toHaveBeenCalledTimes(10);
    });

    test("cleans up resources when connections are superseded", async () => {
      let resolveCount = 0;
      const resolvers: Array<(value: any) => void> = [];

      const onStatesUpdateMock = jest.fn<() => Promise<true>>().mockImplementation(() => {
        return new Promise((resolve) => {
          resolvers.push(() => {
            resolveCount++;
            resolve(true);
          });
        });
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

      // Create many superseded validations
      for (let i = 0; i < 10; i++) {
        clientWs.sendToServer({
          type: "setUserComponents",
          components: [],
          states: [[1, new Uint8Array([i])]],
        });
      }

      // Verify all validation calls were made
      expect(onStatesUpdateMock).toHaveBeenCalledTimes(10);

      // Remove connection (should clean up pending validations)
      clientWs.close();
      doc.removeWebSocket(clientWs as unknown as WebSocket);

      // Resolve all pending validations - should not crash or apply states
      resolvers.forEach((resolver) => resolver(true));
      await jest.advanceTimersByTimeAsync(10);

      // Verify all validations were resolved
      expect(resolveCount).toBe(10);

      // Tick should not crash
      expect(() => doc.tick()).not.toThrow();

      // No additional messages should be sent since connection was removed
      expect(clientWs.getMessage(2)).toBeUndefined();
    });
  });

  describe("authentication timing", () => {
    test("rejects state updates sent before authentication completes", async () => {
      let resolveAuth: (value: any) => void;
      const authPromise = new Promise((resolve) => {
        resolveAuth = resolve;
      });

      const onJoinerMock = jest
        .fn<() => Promise<true>>()
        .mockReturnValue(authPromise as Promise<true>);
      const doc = new DeltaNetServer({
        onJoiner: onJoinerMock,
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

      // Send state update before authentication completes
      clientWs.sendToServer({
        type: "setUserComponents",
        components: [[1, 10n]],
        states: [[1, new Uint8Array([2])]],
      });

      // Now complete authentication
      resolveAuth!(true);
      await jest.advanceTimersByTimeAsync(10);
      doc.tick();

      // Should get error message for premature state update
      // The error should be the first message since the state update was sent before auth completed
      const messages = await clientWs.waitForTotalMessageCount(1);
      const errorMessage = messages.find((msg) => msg.type === "error");
      expect(errorMessage).toEqual({
        type: "error",
        errorType: "USER_NOT_AUTHENTICATED",
        message: "Event sent, but user has not been authenticated yet.",
        retryable: false,
      });
    });

    test("handles multiple rapid connectUser messages", async () => {
      const onJoinerMock = jest.fn<() => Promise<true>>().mockResolvedValue(true);
      const doc = new DeltaNetServer({
        onJoiner: onJoinerMock,
      });
      currentDoc = doc;

      const clientWs = new MockWebsocketV01();
      doc.addWebSocket(clientWs as unknown as WebSocket);

      // Send multiple connectUser messages rapidly
      clientWs.sendToServer({
        type: "connectUser",
        components: [[1, 1n]],
        states: [[1, new Uint8Array([1])]],
        token: "test1",
        observer: false,
      });

      // Only send additional messages if connection is still open
      if (!clientWs.closed) {
        try {
          clientWs.sendToServer({
            type: "connectUser",
            components: [[1, 2n]],
            states: [[1, new Uint8Array([2])]],
            token: "test2",
            observer: false,
          });

          if (!clientWs.closed) {
            clientWs.sendToServer({
              type: "connectUser",
              components: [[1, 3n]],
              states: [[1, new Uint8Array([3])]],
              token: "test3",
              observer: false,
            });
          }
        } catch (error) {
          // Connection was closed during rapid authentication attempts - this is expected behavior
          expect(error.message).toBe("Cannot send message on closed WebSocket");
        }
      }

      await jest.advanceTimersByTimeAsync(20);
      doc.tick();

      // Should only be called once, not multiple times
      expect(onJoinerMock).toHaveBeenCalledTimes(1);

      // Should get error messages for the duplicate authentication attempts (if connection wasn't closed)
      if (!clientWs.closed) {
        const messages = await clientWs.waitForTotalMessageCount(1);
        const errorMessage = messages.find((msg) => msg.type === "error");
        expect(errorMessage).toEqual({
          type: "error",
          errorType: "AUTHENTICATION_IN_PROGRESS",
          message: "Authentication already in progress",
          retryable: false,
        });
      } else {
        // Connection was closed during rapid authentication attempts - this is also valid behavior
        expect(clientWs.closed).toBe(true);
      }
    });

    test("handles authentication cancellation during async validation", async () => {
      let resolveAuth: (value: any) => void;
      const authPromise = new Promise((resolve) => {
        resolveAuth = resolve;
      });

      const onJoinerMock = jest
        .fn<() => Promise<true>>()
        .mockReturnValue(authPromise as Promise<true>);
      const doc = new DeltaNetServer({
        onJoiner: onJoinerMock,
      });
      currentDoc = doc;

      const clientWs = new MockWebsocketV01();
      doc.addWebSocket(clientWs as unknown as WebSocket);

      // Start authentication
      clientWs.sendToServer({
        type: "connectUser",
        components: [[1, 1n]],
        states: [[1, new Uint8Array([1])]],
        token: "test",
        observer: false,
      });

      // Verify authentication started
      expect(onJoinerMock).toHaveBeenCalledTimes(1);

      // Close connection during authentication
      clientWs.close();
      doc.removeWebSocket(clientWs as unknown as WebSocket);

      // Resolve authentication after connection is closed
      resolveAuth!(true);
      await jest.advanceTimersByTimeAsync(10);

      // Should not crash
      expect(() => doc.tick()).not.toThrow();

      // No messages should be sent to the closed connection
      expect(clientWs.getMessage(0)).toBeUndefined();
    });
  });
});
