/**
 * @jest-environment jsdom
 */

import express from "express";
import enableWs from "express-ws";

import { UserNetworkingClientUpdate } from "../src";
import { WebsocketStatus } from "../src/ReconnectingWebSocket";
import { UserNetworkingClient } from "../src/UserNetworkingClient";
import { UserNetworkingServer } from "../src/UserNetworkingServer";

import { createWaitable, waitUntil } from "./test-utils";

describe("UserNetworking", () => {
  test("should see updates end-to-end", async () => {
    const server = new UserNetworkingServer();

    const { app } = enableWs(express());
    app.ws("/user-networking", (ws) => {
      server.connectClient(ws);
    });
    const listener = app.listen(8585);

    const serverAddress = "ws://localhost:8585/user-networking";

    const [user1IdentityPromise, user1IdentityResolve] = await createWaitable<number>();
    const [user1ConnectPromise, user1ConnectResolve] = await createWaitable<null>();
    const [user2IdentityPromise, user2IdentityResolve] = await createWaitable<number>();
    const [user2ConnectPromise, user2ConnectResolve] = await createWaitable<null>();

    const user1UserStates: Map<number, UserNetworkingClientUpdate> = new Map();
    const user1 = new UserNetworkingClient(
      serverAddress,
      (url) => new WebSocket(url),
      (status) => {
        if (status === WebsocketStatus.Connected) {
          user1ConnectResolve(null);
        }
      },
      (clientId: number) => {
        user1IdentityResolve(clientId);
      },
      (clientId: number, userNetworkingClientUpdate: null | UserNetworkingClientUpdate) => {
        if (userNetworkingClientUpdate === null) {
          user1UserStates.delete(clientId);
        } else {
          user1UserStates.set(clientId, userNetworkingClientUpdate);
        }
      },
    );
    await user1ConnectPromise;
    expect(await user1IdentityPromise).toEqual(1);

    await waitUntil(
      () => (server as any).clients.size === 1,
      "wait for server to see the presence of user 1",
    );

    const user2UserStates: Map<number, UserNetworkingClientUpdate> = new Map();
    const user2 = new UserNetworkingClient(
      serverAddress,
      (url) => new WebSocket(url),
      (status) => {
        if (status === WebsocketStatus.Connected) {
          user2ConnectResolve(null);
        }
      },
      (clientId: number) => {
        user2IdentityResolve(clientId);
      },
      (clientId: number, userNetworkingClientUpdate: null | UserNetworkingClientUpdate) => {
        if (userNetworkingClientUpdate === null) {
          user2UserStates.delete(clientId);
        } else {
          user2UserStates.set(clientId, userNetworkingClientUpdate);
        }
      },
    );

    await user2ConnectPromise;
    expect(await user2IdentityPromise).toEqual(2);

    await waitUntil(
      () => (server as any).clients.size === 2,
      "wait for server to see the presence of user 2",
    );

    user1.sendUpdate({
      id: 1,
      position: { x: 1, y: 2, z: 3 },
      rotation: { quaternionY: 0.1, quaternionW: 0.2 },
      state: 1,
    });

    // Wait for user 2 to see the update
    await waitUntil(
      () => user2UserStates.has(1) && user2UserStates.get(1)!.position.x !== 0,
      "wait for user 2 to see the update from user 1",
    );

    expect(Array.from(user2UserStates.entries())).toEqual([
      [
        1,
        {
          id: 1,
          position: { x: 1, y: 2, z: 3 },
          rotation: { quaternionY: expect.closeTo(0.1), quaternionW: expect.closeTo(0.2) },
          state: 1,
        },
      ],
    ]);

    user2.sendUpdate({
      id: 2,
      position: { x: 2, y: 4, z: 6 },
      rotation: { quaternionY: 0.2, quaternionW: 0.4 },
      state: 2,
    });

    // Wait for user 1 to see the update
    await waitUntil(
      () => user1UserStates.has(2) && user1UserStates.get(2)!.position.x !== 0,
      "wait for user 1 to see the update from user 2",
    );

    expect(Array.from(user1UserStates.entries())).toEqual([
      [
        2,
        {
          id: 2,
          position: { x: 2, y: 4, z: 6 },
          rotation: { quaternionY: expect.closeTo(0.2), quaternionW: expect.closeTo(0.4) },
          state: 2,
        },
      ],
    ]);

    user2.stop();

    await waitUntil(
      () => (server as any).clients.size === 1,
      "wait for server to see the removal of user 2",
    );

    // Wait for user 1 to see the removal
    await waitUntil(() => !user1UserStates.has(2), "wait for user 1 to see the removal of user 2");

    expect(Array.from(user1UserStates.entries())).toEqual([]);

    user1.stop();

    await waitUntil(
      () => (server as any).clients.size === 0,
      "wait for server to see the removal of user 1",
    );

    listener.close();
  });
});
