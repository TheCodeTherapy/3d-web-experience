import { Server } from "node:http";
import * as util from "node:util";

import { jest } from "@jest/globals";
import { deltaNetProtocolSubProtocol_v0_1 } from "@mml-io/delta-net-protocol";
import { DeltaNetServer } from "@mml-io/delta-net-server";
import express from "express";
import enableWs from "express-ws";

import { UserData, UserNetworkingClientUpdate } from "../src";
import { WebsocketStatus } from "../src/types";
import { NetworkUpdate, UserNetworkingClient } from "../src/UserNetworkingClient";
import { UserNetworkingServer } from "../src/UserNetworkingServer";

import { createWaitable, waitUntil } from "./test-utils";

describe("UserNetworking", () => {
  let server: UserNetworkingServer | null = null;
  let listener: Server | null = null;
  let user1: UserNetworkingClient | null = null;
  let user2: UserNetworkingClient | null = null;

  afterEach(async () => {
    // Always clean up resources after each test
    try {
      // Stop clients first to prevent reconnection attempts
      if (user1) {
        user1.stop();
        user1 = null;
      }
      if (user2) {
        user2.stop();
        user2 = null;
      }

      // Then dispose server
      if (server) {
        server.dispose();
        server = null;
      }

      // Finally close the HTTP listener
      await new Promise<void>((resolve) => {
        if (listener) {
          listener.close(() => resolve());
        } else {
          resolve();
        }
      });
      listener = null;
    } catch (cleanupError) {
      console.error("Error during cleanup:", cleanupError);
    }
  });

  test("should see updates end-to-end", async () => {
    const sessionTokenForOne = "session-token-one";
    const sessionTokenForTwo = "session-token-two";

    const options = {
      onClientConnect: (
        clientId: number,
        sessionToken: string,
        userIdentity?: UserData,
      ): true | UserData | Error => {
        if (sessionToken === sessionTokenForOne) {
          return {
            username: "user1",
            characterDescription: { meshFileUrl: "http://example.com/user1.glb" },
            colors: [[0, 0, 0]],
          };
        } else if (sessionToken === sessionTokenForTwo) {
          return {
            username: "user2",
            characterDescription: { meshFileUrl: "http://example.com/user2.glb" },
            colors: [[0, 0, 0]],
          };
        }
        return new Error("Invalid session token");
      },
      onClientUserIdentityUpdate: (clientId: number, userIdentity: UserData): UserData | null => {
        return null;
      },
      onClientDisconnect: (clientId: number): void => {},
    };
    server = new UserNetworkingServer(options);

    const { app } = enableWs(express(), undefined, {
      wsOptions: {
        handleProtocols: DeltaNetServer.handleWebsocketSubprotocol,
      },
    });
    app.ws("/user-networking", (ws) => {
      server!.connectClient(ws as unknown as WebSocket);
    });

    // Wait for server to be ready
    listener = await new Promise<any>((resolve) => {
      const httpServer = app.listen(8585, () => {
        console.log("Test server started on port 8585");
        resolve(httpServer);
      });
    });

    // Give the server a moment to fully initialize
    await new Promise((resolve) => setTimeout(resolve, 200));

    const serverAddress = "ws://localhost:8585/user-networking";
    console.log("Attempting to connect to:", serverAddress);

    const [user1IdentityPromise, user1IdentityResolve] = await createWaitable<number>();
    const [user1ConnectPromise, user1ConnectResolve] = await createWaitable<null>();
    const [user2IdentityPromise, user2IdentityResolve] = await createWaitable<number>();
    const [user2ConnectPromise, user2ConnectResolve] = await createWaitable<null>();

    const user1UserStates: Map<number, UserNetworkingClientUpdate> = new Map();
    const user1Profiles: Map<number, UserData> = new Map();
    const user1UserUpdates: Array<{
      userId: number;
      userState: Partial<UserData> | null;
      removal: boolean;
    }> = [];
    user1 = new UserNetworkingClient({
      url: serverAddress,
      sessionToken: sessionTokenForOne,
      websocketFactory: (url) => new WebSocket(url, [deltaNetProtocolSubProtocol_v0_1]),
      statusUpdateCallback: (status) => {
        console.log("User1 WebSocket status:", status);
        if (status === WebsocketStatus.Connected) {
          user1ConnectResolve(null);
        }
      },
      assignedIdentity: (clientId: number) => {
        user1IdentityResolve(clientId);
      },
      onUpdate: (update: NetworkUpdate) => {
        for (const [clientId, user] of update.addedUserIds) {
          const userState = user.userState;
          if (userState) {
            user1Profiles.set(clientId, userState);
            user1UserUpdates.push({ userId: clientId, userState, removal: false });
          }
          user1UserStates.set(clientId, user.components);
        }
        for (const [clientId, user] of update.updatedUsers) {
          const userState = user.userState;
          if (userState) {
            const existingUserState = user1Profiles.get(clientId)!;
            if (!existingUserState) {
              throw new Error(`User ${clientId} not found in user1Profiles`);
            }
            user1Profiles.set(clientId, { ...existingUserState, ...userState });
            user1UserUpdates.push({
              userId: clientId,
              userState,
              removal: false,
            });
          }
          user1UserStates.set(clientId, user.components);
        }
        for (const clientId of update.removedUserIds) {
          user1UserUpdates.push({ userId: clientId, userState: null, removal: true });
          user1UserStates.delete(clientId);
        }
      },
      onServerError: (error) => {
        console.error("Received server error", error);
      },
    });
    await user1ConnectPromise;
    expect(await user1IdentityPromise).toEqual(1);

    await waitUntil(
      () => (server as any).authenticatedClientsById.size === 1,
      "wait for server to see the presence of user 1",
    );

    await waitUntil(
      () => user1Profiles.has(1),
      "wait for user 1 to see their own profile returned from the server",
    );

    expect(user1Profiles.get(1)).toEqual({
      userId: 1,
      username: "user1",
      characterDescription: { meshFileUrl: "http://example.com/user1.glb" },
      colors: [[0, 0, 0]],
    });

    const user2UserStates: Map<number, UserNetworkingClientUpdate> = new Map();
    const user2Profiles: Map<number, UserData> = new Map();
    const user2UserUpdates: Array<{
      userId: number;
      userState: Partial<UserData> | null;
      removal: boolean;
    }> = [];
    user2 = new UserNetworkingClient({
      url: serverAddress,
      sessionToken: sessionTokenForTwo,
      websocketFactory: (url) => new WebSocket(url, [deltaNetProtocolSubProtocol_v0_1]),
      statusUpdateCallback: (status) => {
        console.log("User2 WebSocket status:", status);
        if (status === WebsocketStatus.Connected) {
          user2ConnectResolve(null);
        }
      },
      assignedIdentity: (clientId: number) => {
        user2IdentityResolve(clientId);
      },
      onUpdate: (update: NetworkUpdate) => {
        for (const [clientId, user] of update.addedUserIds) {
          const userState = user.userState;
          if (userState) {
            user2Profiles.set(clientId, userState);
            user2UserUpdates.push({ userId: clientId, userState, removal: false });
          }
          user2UserStates.set(clientId, user.components);
        }
        for (const [clientId, user] of update.updatedUsers) {
          const userState = user.userState;
          if (userState) {
            const existingUserState = user2Profiles.get(clientId)!;
            if (!existingUserState) {
              throw new Error(`User ${clientId} not found in user2Profiles`);
            }
            user2Profiles.set(clientId, { ...existingUserState, ...userState });
            user2UserUpdates.push({
              userId: clientId,
              userState,
              removal: false,
            });
          }
          user2UserStates.set(clientId, user.components);
        }
        for (const clientId of update.removedUserIds) {
          user2UserUpdates.push({ userId: clientId, userState: null, removal: true });
          user2UserStates.delete(clientId);
        }
      },
      onServerError: (error) => {
        console.error("Received server error", error);
      },
    });

    await user2ConnectPromise;
    expect(await user2IdentityPromise).toEqual(2);

    await waitUntil(
      () => (server as any).authenticatedClientsById.size === 2,
      "wait for server to see the presence of user 2",
    );

    await waitUntil(
      () => user2Profiles.has(1) && user2Profiles.has(2),
      "wait for user 2 to see both profiles returned from the server",
    );

    expect(user2Profiles.get(1)).toEqual({
      userId: 1,
      username: "user1",
      characterDescription: { meshFileUrl: "http://example.com/user1.glb" },
      colors: [[0, 0, 0]],
    });
    expect(user2Profiles.get(2)).toEqual({
      userId: 2,
      username: "user2",
      characterDescription: { meshFileUrl: "http://example.com/user2.glb" },
      colors: [[0, 0, 0]],
    });

    user1.sendUpdate({
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
          position: { x: 1, y: 2, z: 3 },
          rotation: { quaternionY: expect.closeTo(0.1), quaternionW: expect.closeTo(0.2) },
          state: 1,
        },
      ],
      [
        2,
        {
          position: { x: 0, y: 0, z: 0 },
          rotation: { quaternionY: 0, quaternionW: 1 },
          state: 0,
        },
      ],
    ]);

    user2.sendUpdate({
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
        1,
        {
          position: { x: 1, y: 2, z: 3 },
          rotation: { quaternionY: expect.closeTo(0.1), quaternionW: expect.closeTo(0.2) },
          state: 1,
        },
      ],
      [
        2,
        {
          position: { x: 2, y: 4, z: 6 },
          rotation: { quaternionY: expect.closeTo(0.2), quaternionW: expect.closeTo(0.4) },
          state: 2,
        },
      ],
    ]);

    user2.stop();
    user2 = null;

    await waitUntil(
      () => (server as any).authenticatedClientsById.size === 1,
      "wait for server to see the removal of user 2",
    );

    // Wait for user 1 to see the removal
    await waitUntil(() => !user1UserStates.has(2), "wait for user 1 to see the removal of user 2");

    // Has data for user 1 only
    expect(Array.from(user1UserStates.entries())).toEqual([
      [
        1,
        {
          position: {
            x: 1,
            y: 2,
            z: 3,
          },
          rotation: {
            quaternionW: 0.2,
            quaternionY: 0.1,
          },
          state: 1,
        },
      ],
    ]);

    user1.stop();
    user1 = null;

    await waitUntil(
      () => (server as any).authenticatedClientsById.size === 0,
      "wait for server to see the removal of user 1",
    );
  });

  test("should handle individual state updates", async () => {
    const sessionTokenForOne = "session-token-one";
    const sessionTokenForTwo = "session-token-two";

    const onServerClientUserUpdate = jest.fn((clientId: number, userIdentity: UserData) => {
      return userIdentity;
    });

    const options = {
      onClientConnect: (
        clientId: number,
        sessionToken: string,
        userIdentity?: UserData,
      ): true | UserData | Error => {
        if (sessionToken === sessionTokenForOne) {
          return {
            username: "user1",
            characterDescription: { meshFileUrl: "http://example.com/user1.glb" },
            colors: [[0, 0, 0]],
          };
        } else if (sessionToken === sessionTokenForTwo) {
          return {
            username: "user2",
            characterDescription: { meshFileUrl: "http://example.com/user2.glb" },
            colors: [[0, 0, 0]],
          };
        }
        return new Error("Invalid session token");
      },
      onClientUserIdentityUpdate: (
        clientId: number,
        userIdentity: UserData,
      ): UserData | null | false | true | Error => {
        return onServerClientUserUpdate(clientId, userIdentity);
      },
      onClientDisconnect: (clientId: number): void => {},
    };
    server = new UserNetworkingServer(options);

    const { app } = enableWs(express(), undefined, {
      wsOptions: {
        handleProtocols: DeltaNetServer.handleWebsocketSubprotocol,
      },
    });
    app.ws("/user-networking", (ws) => {
      server!.connectClient(ws as unknown as WebSocket);
    });

    // Wait for server to be ready
    listener = await new Promise<any>((resolve) => {
      const httpServer = app.listen(8587, () => {
        console.log("Test server started on port 8587");
        resolve(httpServer);
      });
    });

    // Give the server a moment to fully initialize
    await new Promise((resolve) => setTimeout(resolve, 200));

    const serverAddress = "ws://localhost:8587/user-networking";

    const [user1IdentityPromise, user1IdentityResolve] = await createWaitable<number>();
    const [user1ConnectPromise, user1ConnectResolve] = await createWaitable<null>();
    const [user2IdentityPromise, user2IdentityResolve] = await createWaitable<number>();
    const [user2ConnectPromise, user2ConnectResolve] = await createWaitable<null>();

    const user1Profiles: Map<number, UserData> = new Map();
    const user1UserUpdates: Array<{
      userId: number;
      userState: Partial<UserData> | null;
      removal: boolean;
    }> = [];

    user1 = new UserNetworkingClient({
      url: serverAddress,
      sessionToken: sessionTokenForOne,
      websocketFactory: (url) => new WebSocket(url, [deltaNetProtocolSubProtocol_v0_1]),
      statusUpdateCallback: (status) => {
        if (status === WebsocketStatus.Connected) {
          user1ConnectResolve(null);
        }
      },
      assignedIdentity: (clientId: number) => {
        user1IdentityResolve(clientId);
      },
      onUpdate: (update: NetworkUpdate) => {
        for (const [clientId, user] of update.addedUserIds) {
          const userState = user.userState;
          if (userState) {
            user1Profiles.set(clientId, userState);
            user1UserUpdates.push({ userId: clientId, userState, removal: false });
          }
        }
        for (const [clientId, user] of update.updatedUsers) {
          const userState = user.userState;
          if (userState) {
            const existingUserState = user1Profiles.get(clientId)!;
            if (!existingUserState) {
              throw new Error(`User ${clientId} not found in user1Profiles`);
            }
            user1Profiles.set(clientId, { ...existingUserState, ...userState });
            user1UserUpdates.push({
              userId: clientId,
              userState,
              removal: false,
            });
          }
        }
        for (const clientId of update.removedUserIds) {
          user1UserUpdates.push({ userId: clientId, userState: null, removal: true });
        }
      },
      onServerError: (error) => {
        console.error("Received server error", error);
      },
    });

    await user1ConnectPromise;
    expect(await user1IdentityPromise).toEqual(1);

    const user2Profiles: Map<number, UserData> = new Map();
    const user2UserUpdates: Array<{
      userId: number;
      userState: Partial<UserData> | null;
      removal: boolean;
    }> = [];

    user2 = new UserNetworkingClient({
      url: serverAddress,
      sessionToken: sessionTokenForTwo,
      websocketFactory: (url) => new WebSocket(url, [deltaNetProtocolSubProtocol_v0_1]),
      statusUpdateCallback: (status) => {
        if (status === WebsocketStatus.Connected) {
          user2ConnectResolve(null);
        }
      },
      assignedIdentity: (clientId: number) => {
        user2IdentityResolve(clientId);
      },
      onUpdate: (update: NetworkUpdate) => {
        for (const [clientId, user] of update.addedUserIds) {
          const userState = user.userState;
          if (userState) {
            user2Profiles.set(clientId, userState);
            user2UserUpdates.push({ userId: clientId, userState, removal: false });
          }
        }
        for (const [clientId, user] of update.updatedUsers) {
          const userState = user.userState;
          if (userState) {
            const existingUserState = user2Profiles.get(clientId)!;
            if (!existingUserState) {
              throw new Error(`User ${clientId} not found in user2Profiles`);
            }
            user2Profiles.set(clientId, { ...existingUserState, ...userState });
            user2UserUpdates.push({
              userId: clientId,
              userState,
              removal: false,
            });
          }
        }
        for (const clientId of update.removedUserIds) {
          user2UserUpdates.push({ userId: clientId, userState: null, removal: true });
        }
      },
      onServerError: (error) => {
        console.error("Received server error", error);
      },
    });

    await user2ConnectPromise;
    expect(await user2IdentityPromise).toEqual(2);

    // Wait for initial profile setup
    await waitUntil(
      () => user1Profiles.has(1) && user1Profiles.has(2),
      "wait for user1 to see both profiles",
    );
    await waitUntil(
      () => user2Profiles.has(1) && user2Profiles.has(2),
      "wait for user2 to see both profiles",
    );

    // Test individual username update
    user1.updateUsername("updated-user1");

    let usernameUpdateFromUser1 = null;
    await waitUntil(
      () =>
        (usernameUpdateFromUser1 = user2UserUpdates.find(
          (u) => u.userId === 1 && u.userState?.username === "updated-user1",
        )) !== undefined,
      "wait for user2 to see username update",
    );

    expect(usernameUpdateFromUser1).toEqual({
      removal: false,
      userId: 1,
      userState: {
        username: "updated-user1",
        characterDescription: { meshFileUrl: "http://example.com/user1.glb" },
        userId: 1,
        colors: [],
      },
    });

    // Test individual character description update
    const newCharacterDescription = { meshFileUrl: "http://example.com/new-user1.glb" };
    user1.updateCharacterDescription(newCharacterDescription);

    let characterDescriptionUpdateFromUser1 = null;
    await waitUntil(
      () =>
        (characterDescriptionUpdateFromUser1 = user2UserUpdates.find(
          (u) =>
            u.userId === 1 &&
            u.userState?.characterDescription?.meshFileUrl === newCharacterDescription.meshFileUrl,
        )) !== undefined,
      "wait for user2 to see character description update",
    );

    expect(characterDescriptionUpdateFromUser1).toEqual({
      userId: 1,
      removal: false,
      userState: {
        username: "updated-user1",
        characterDescription: newCharacterDescription,
        userId: 1,
        colors: [],
      },
    });

    // Test individual colors update
    const newColors: Array<[number, number, number]> = [
      [255, 0, 0],
      [0, 255, 0],
    ];
    user1.updateColors(newColors);

    let colorsUpdateFromUser1 = null;
    await waitUntil(
      () =>
        (colorsUpdateFromUser1 = user2UserUpdates.find(
          (u) => u.userId === 1 && util.isDeepStrictEqual(u.userState?.colors, newColors),
        )) !== undefined,
      "wait for user2 to see colors update",
    );

    expect(colorsUpdateFromUser1).toEqual({
      userId: 1,
      removal: false,
      userState: {
        username: "updated-user1",
        characterDescription: newCharacterDescription,
        userId: 1,
        colors: newColors,
      },
    });
  }, 15000);
});
