import { jest } from "@jest/globals";
import { DeltaNetV01ServerErrors, DeltaNetV01Tick } from "@mml-io/delta-net-protocol";

import { DeltaNetServer, DeltaNetServerError } from "../../src";

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

describe("DeltaNetServer - Callback Tests", () => {
  describe("onJoiner callback", () => {
    test("accepts connection synchronously", async () => {
      const onJoinerMock = jest.fn<() => true>().mockReturnValue(true);
      const doc = new DeltaNetServer({
        onJoiner: onJoinerMock,
      });
      currentDoc = doc;

      const clientWs = new MockWebsocketV01();
      doc.addWebSocket(clientWs as unknown as WebSocket);

      clientWs.sendToServer({
        type: "connectUser",
        components: [[1, 5n]],
        states: [[2, new Uint8Array([7, 8, 9])]],
        token: "valid-token",
        observer: false,
      });

      // Wait for async authentication to complete
      await jest.advanceTimersByTimeAsync(10);
      doc.tick();

      expect(onJoinerMock).toHaveBeenCalledWith({
        deltaNetV01Connection: expect.any(Object),
        components: [[1, 5n]],
        states: [[2, new Uint8Array([7, 8, 9])]],
        token: "valid-token",
        internalConnectionId: expect.any(Number),
      });

      expect(await clientWs.waitForTotalMessageCount(2)).toEqual([
        { index: 0, type: "userIndex" },
        expect.objectContaining({ type: "initialCheckout" }),
      ]);
    });

    test("rejects connection synchronously", async () => {
      const onJoinerMock = jest.fn<() => Error>().mockReturnValue(new Error("Invalid token"));
      const doc = new DeltaNetServer({
        onJoiner: onJoinerMock,
      });
      currentDoc = doc;

      const clientWs = new MockWebsocketV01();
      doc.addWebSocket(clientWs as unknown as WebSocket);

      clientWs.sendToServer({
        type: "connectUser",
        components: [[1, 5n]],
        states: [[2, new Uint8Array([7, 8, 9])]],
        token: "invalid-token",
        observer: false,
      });

      doc.tick();

      expect(onJoinerMock).toHaveBeenCalled();

      // Check that an error message was sent
      await jest.advanceTimersByTimeAsync(10);
      expect(clientWs.getMessage(0)).toEqual({
        type: "error",
        errorType: "USER_NETWORKING_UNKNOWN_ERROR",
        message: "Invalid token",
        retryable: false,
      });
    });

    test("accepts connection asynchronously", async () => {
      const onJoinerMock = jest.fn<() => Promise<true>>().mockResolvedValue(true);
      const doc = new DeltaNetServer({
        onJoiner: onJoinerMock,
      });
      currentDoc = doc;

      const clientWs = new MockWebsocketV01();
      doc.addWebSocket(clientWs as unknown as WebSocket);

      clientWs.sendToServer({
        type: "connectUser",
        components: [[1, 5n]],
        states: [[2, new Uint8Array([7, 8, 9])]],
        token: "async-valid-token",
        observer: false,
      });

      // Wait a bit for async processing
      await jest.advanceTimersByTimeAsync(10);
      doc.tick();

      expect(onJoinerMock).toHaveBeenCalledWith({
        deltaNetV01Connection: expect.any(Object),
        components: [[1, 5n]],
        states: [[2, new Uint8Array([7, 8, 9])]],
        token: "async-valid-token",
        internalConnectionId: expect.any(Number),
      });

      expect(await clientWs.waitForTotalMessageCount(2)).toEqual([
        { index: 0, type: "userIndex" },
        expect.objectContaining({ type: "initialCheckout" }),
      ]);
    });

    test("rejects connection asynchronously", async () => {
      const onJoinerMock = jest
        .fn<() => Promise<DeltaNetServerError>>()
        .mockRejectedValue(
          new DeltaNetServerError(
            DeltaNetV01ServerErrors.USER_NETWORKING_UNKNOWN_ERROR_TYPE,
            "Async validation failed",
            false,
          ),
        );
      const doc = new DeltaNetServer({
        onJoiner: onJoinerMock,
      });
      currentDoc = doc;

      const clientWs = new MockWebsocketV01();
      doc.addWebSocket(clientWs as unknown as WebSocket);

      clientWs.sendToServer({
        type: "connectUser",
        components: [[1, 5n]],
        states: [[2, new Uint8Array([7, 8, 9])]],
        token: "async-invalid-token",
        observer: false,
      });

      // Wait for async rejection
      await jest.advanceTimersByTimeAsync(10);

      expect(onJoinerMock).toHaveBeenCalled();

      // Check that an error message was sent
      expect(clientWs.getMessage(0)).toEqual({
        type: "error",
        errorType: "USER_NETWORKING_UNKNOWN_ERROR",
        message: "Async validation failed",
        retryable: false,
      });
    });
  });

  describe("onComponentsUpdate callback", () => {
    test("allows component updates", async () => {
      const onComponentsUpdateMock = jest.fn<() => true>().mockReturnValue(true);
      const doc = new DeltaNetServer({
        onComponentsUpdate: onComponentsUpdateMock,
      });
      currentDoc = doc;

      const clientWs = new MockWebsocketV01();
      doc.addWebSocket(clientWs as unknown as WebSocket);

      clientWs.sendToServer({
        type: "connectUser",
        components: [[1, 1n]],
        states: [],
        token: "test",
        observer: false,
      });

      // Wait for async authentication to complete
      await jest.advanceTimersByTimeAsync(10);
      doc.tick();
      await clientWs.waitForTotalMessageCount(2);

      clientWs.sendToServer({
        type: "setUserComponents",
        components: [
          [1, 10n],
          [2, 20n],
        ],
        states: [],
      });

      expect(onComponentsUpdateMock).toHaveBeenCalledWith({
        deltaNetV01Connection: expect.any(Object),
        internalConnectionId: expect.any(Number),
        components: [
          [1, 10n],
          [2, 20n],
        ],
      });
    });

    test("rejects component updates", async () => {
      const onComponentsUpdateMock = jest
        .fn<() => Error>()
        .mockReturnValue(new Error("Component update rejected"));
      const doc = new DeltaNetServer({
        onComponentsUpdate: onComponentsUpdateMock,
      });
      currentDoc = doc;

      const clientWs = new MockWebsocketV01();
      doc.addWebSocket(clientWs as unknown as WebSocket);

      clientWs.sendToServer({
        type: "connectUser",
        components: [[1, 1n]],
        states: [],
        token: "test",
        observer: false,
      });

      // Wait for async authentication to complete
      await jest.advanceTimersByTimeAsync(10);
      doc.tick();
      await clientWs.waitForTotalMessageCount(2);

      clientWs.sendToServer({
        type: "setUserComponents",
        components: [[1, 10n]],
        states: [],
      });

      expect(onComponentsUpdateMock).toHaveBeenCalled();

      // Check that an error message was sent (may need to wait a bit for message processing)
      await jest.advanceTimersByTimeAsync(10);

      // The error message should be the third message (after userIndex and initialCheckout)
      expect(clientWs.getMessage(2)).toEqual({
        type: "error",
        errorType: "USER_NETWORKING_UNKNOWN_ERROR",
        message: "Component update rejected",
        retryable: true,
      });
    });
  });

  describe("onStatesUpdate callback", () => {
    test("validates state updates synchronously", async () => {
      const onStatesUpdateMock = jest.fn<() => true>().mockReturnValue(true);
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

      clientWs.sendToServer({
        type: "setUserComponents",
        components: [],
        states: [
          [1, new Uint8Array([2])],
          [2, new Uint8Array([3])],
        ],
      });

      // Should be called once per state
      expect(onStatesUpdateMock).toHaveBeenCalledTimes(2);
      expect(onStatesUpdateMock).toHaveBeenNthCalledWith(1, {
        deltaNetV01Connection: expect.any(Object),
        internalConnectionId: expect.any(Number),
        states: [[1, new Uint8Array([2])]],
      });
      expect(onStatesUpdateMock).toHaveBeenNthCalledWith(2, {
        deltaNetV01Connection: expect.any(Object),
        internalConnectionId: expect.any(Number),
        states: [[2, new Uint8Array([3])]],
      });

      doc.tick();

      // Both states should be applied since validation passed
      const tickMessage = (await clientWs.waitForTotalMessageCount(3, 2))[0] as DeltaNetV01Tick;
      expect(tickMessage.states).toEqual([
        {
          stateId: 1,
          updatedStates: [[0, new Uint8Array([2])]],
        },
        {
          stateId: 2,
          updatedStates: [[0, new Uint8Array([3])]],
        },
      ]);
    });

    test("validates state updates asynchronously", async () => {
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

      // Wait for async authentication to complete
      await jest.advanceTimersByTimeAsync(10);
      doc.tick();
      await clientWs.waitForTotalMessageCount(2);

      clientWs.sendToServer({
        type: "setUserComponents",
        components: [],
        states: [[1, new Uint8Array([2])]],
      });

      expect(onStatesUpdateMock).toHaveBeenCalledWith({
        deltaNetV01Connection: expect.any(Object),
        internalConnectionId: expect.any(Number),
        states: [[1, new Uint8Array([2])]],
      });

      // Wait for async validation
      await jest.advanceTimersByTimeAsync(10);
      doc.tick();

      // State should be applied after async validation
      const tickMessage = (await clientWs.waitForTotalMessageCount(3, 2))[0] as DeltaNetV01Tick;
      expect(tickMessage.states).toEqual([
        {
          stateId: 1,
          updatedStates: [[0, new Uint8Array([2])]],
        },
      ]);
    });

    test("rejects state updates asynchronously", async () => {
      const onStatesUpdateMock = jest
        .fn<() => Promise<Error>>()
        .mockResolvedValue(new Error("State validation failed"));
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

      clientWs.sendToServer({
        type: "setUserComponents",
        components: [],
        states: [[1, new Uint8Array([2])]],
      });

      expect(onStatesUpdateMock).toHaveBeenCalled();

      // Wait for async rejection to complete
      await jest.advanceTimersByTimeAsync(20);

      // The async rejection should result in an error message being sent
      await clientWs.waitForTotalMessageCount(3);
      expect(clientWs.getMessage(2)).toEqual({
        type: "error",
        errorType: "USER_NETWORKING_UNKNOWN_ERROR",
        message: "State validation failed",
        retryable: false,
      });
    });
  });

  describe("onLeave callback", () => {
    test("calls onLeave when client disconnects", async () => {
      const onLeaveMock = jest.fn();
      const doc = new DeltaNetServer({
        onLeave: onLeaveMock,
      });
      currentDoc = doc;

      const clientWs = new MockWebsocketV01();
      doc.addWebSocket(clientWs as unknown as WebSocket);

      clientWs.sendToServer({
        type: "connectUser",
        components: [[1, 5n]],
        states: [[1, new Uint8Array([1, 2, 3])]],
        token: "test",
        observer: false,
      });

      // Wait for async authentication to complete
      await jest.advanceTimersByTimeAsync(10);
      doc.tick();
      await clientWs.waitForTotalMessageCount(2);

      // Update some state
      clientWs.sendToServer({
        type: "setUserComponents",
        components: [[1, 10n]],
        states: [[1, new Uint8Array([4, 5, 6])]],
      });

      doc.tick();
      await clientWs.waitForTotalMessageCount(3, 2);

      // Close the connection
      clientWs.close();
      doc.removeWebSocket(clientWs as unknown as WebSocket);

      expect(onLeaveMock).toHaveBeenCalledWith({
        deltaNetV01Connection: expect.any(Object),
        internalConnectionId: expect.any(Number),
        components: [[1, 10]], // Note: numbers not bigints in leave callback
        states: [[1, new Uint8Array([4, 5, 6])]],
      });
    });
  });

  describe("callback interaction scenarios", () => {
    test("multiple callbacks working together", async () => {
      const onJoinerMock = jest.fn<() => Promise<true>>().mockResolvedValue(true);
      const onComponentsUpdateMock = jest.fn<() => true>().mockReturnValue(true);
      const onStatesUpdateMock = jest
        .fn<() => true | Promise<true>>()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(Promise.resolve(true));

      const doc = new DeltaNetServer({
        onJoiner: onJoinerMock,
        onComponentsUpdate: onComponentsUpdateMock,
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

      // Wait for async onJoiner
      await jest.advanceTimersByTimeAsync(10);
      doc.tick();

      expect(onJoinerMock).toHaveBeenCalled();
      await clientWs.waitForTotalMessageCount(2);

      clientWs.sendToServer({
        type: "setUserComponents",
        components: [[1, 10n]],
        states: [
          [1, new Uint8Array([2])],
          [2, new Uint8Array([3])],
        ],
      });

      expect(onComponentsUpdateMock).toHaveBeenCalled();
      expect(onStatesUpdateMock).toHaveBeenCalledTimes(2);

      // Wait for async state validation
      await jest.advanceTimersByTimeAsync(10);
      doc.tick();

      // Both component and state updates should be applied
      const tickMessage = (await clientWs.waitForTotalMessageCount(3, 2))[0] as DeltaNetV01Tick;
      expect(tickMessage.componentDeltaDeltas).toHaveLength(1);
      expect(tickMessage.states).toHaveLength(2);
    });
  });
});
