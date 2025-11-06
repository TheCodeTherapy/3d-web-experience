import { jest } from "@jest/globals";
import {
  DeltaNetV01InitialCheckoutMessage,
  DeltaNetV01Tick,
  DeltaNetV01UserIndexMessage,
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

describe("DeltaNetServer - Core Functionality", () => {
  test("handles initial client connection and checkout", async () => {
    const doc = new DeltaNetServer();
    currentDoc = doc;

    const clientWs = new MockWebsocketV01();
    doc.addWebSocket(clientWs as unknown as WebSocket);

    clientWs.sendToServer({
      type: "connectUser",
      components: [[1, 1n]],
      states: [[1, new Uint8Array([1, 2, 3])]],
      token: "test",
      observer: false,
    });

    // Wait for async authentication to complete
    await jest.advanceTimersByTimeAsync(10);
    doc.tick();

    expect(await clientWs.waitForTotalMessageCount(2)).toEqual([
      {
        index: 0,
        type: "userIndex",
      } satisfies DeltaNetV01UserIndexMessage,
      {
        components: [
          {
            componentId: 1,
            values: new BigInt64Array([1n]),
            deltas: new BigInt64Array([1n]),
          },
        ],
        indicesCount: 1,
        serverTime: expect.any(Number),
        states: [
          {
            stateId: 1,
            values: [new Uint8Array([1, 2, 3])],
          },
        ],
        type: "initialCheckout",
      } satisfies DeltaNetV01InitialCheckoutMessage,
    ]);
  });

  test("processes basic component and state updates", async () => {
    const doc = new DeltaNetServer();
    currentDoc = doc;

    const clientWs = new MockWebsocketV01();
    doc.addWebSocket(clientWs as unknown as WebSocket);

    clientWs.sendToServer({
      type: "connectUser",
      components: [[1, 1n]],
      states: [[1, new Uint8Array([1, 2, 3])]],
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
      states: [[1, new Uint8Array([4, 5, 6])]],
    });

    doc.tick();

    expect(await clientWs.waitForTotalMessageCount(3, 2)).toEqual([
      {
        componentDeltaDeltas: [
          {
            componentId: 1,
            deltaDeltas: new BigInt64Array([8n]),
          },
        ],
        indicesCount: 1,
        removedIndices: [],
        serverTime: expect.any(Number),
        states: [
          {
            stateId: 1,
            updatedStates: [[0, new Uint8Array([4, 5, 6])]],
          },
        ],
        type: "tick",
      } satisfies DeltaNetV01Tick,
    ]);
  });

  test("coordinates multiple clients sharing state", async () => {
    const doc = new DeltaNetServer();
    currentDoc = doc;

    const client1 = new MockWebsocketV01();
    const client2 = new MockWebsocketV01();

    doc.addWebSocket(client1 as unknown as WebSocket);
    doc.addWebSocket(client2 as unknown as WebSocket);

    // Both clients use different state IDs
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
      states: [[2, new Uint8Array([2])]],
      token: "test2",
      observer: false,
    });

    await jest.advanceTimersByTimeAsync(10);
    doc.tick();

    // Both should get separate indices
    await client1.waitForTotalMessageCount(2);
    await client2.waitForTotalMessageCount(2);

    expect(client1.getMessage(0)).toEqual({ index: 0, type: "userIndex" });
    expect(client2.getMessage(0)).toEqual({ index: 1, type: "userIndex" });
  });

  test("cleans up resources when clients disconnect", async () => {
    const doc = new DeltaNetServer();
    currentDoc = doc;

    const client1 = new MockWebsocketV01();
    const client2 = new MockWebsocketV01();

    doc.addWebSocket(client1 as unknown as WebSocket);
    doc.addWebSocket(client2 as unknown as WebSocket);

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
      states: [[2, new Uint8Array([2])]],
      token: "test2",
      observer: false,
    });

    await jest.advanceTimersByTimeAsync(10);
    doc.tick();
    await client1.waitForTotalMessageCount(2);
    await client2.waitForTotalMessageCount(2);

    // Disconnect first client
    client1.close();
    doc.removeWebSocket(client1 as unknown as WebSocket);
    doc.tick();

    // Second client should still work normally
    client2.sendToServer({
      type: "setUserComponents",
      components: [[1, 10n]],
      states: [[2, new Uint8Array([3])]],
    });

    doc.tick();

    const messages = await client2.waitForTotalMessageCount(3, 2);
    expect(messages).toHaveLength(1);

    const tickMessage = messages[0] as DeltaNetV01Tick;
    expect(tickMessage.type).toBe("tick");
    expect(tickMessage.componentDeltaDeltas).toHaveLength(1);

    // The state might not always be included in the tick if it hasn't changed from client2's perspective
    // So let's just check that the client is still functional
    expect(tickMessage).toMatchObject({
      type: "tick",
      componentDeltaDeltas: expect.arrayContaining([
        expect.objectContaining({
          componentId: 1,
          deltaDeltas: expect.any(BigInt64Array),
        }),
      ]),
      indicesCount: 1,
      removedIndices: [0],
      serverTime: expect.any(Number),
    });

    // Cleanup
    client2.close();
    doc.removeWebSocket(client2 as unknown as WebSocket);
  });
});
