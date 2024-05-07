import dolbyio from "@dolbyio/dolbyio-rest-apis-client";
import * as jwtToken from "@dolbyio/dolbyio-rest-apis-client/dist/types/jwtToken";
import express from "express";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

import { authMiddleware } from "./auth";

export function registerDolbyVoiceRoutes(
  app: express.Application,
  options: {
    DOLBY_APP_KEY: string;
    DOLBY_APP_SECRET: string;
    PASS?: string;
  },
) {
  const fetchApiToken = (): Promise<jwtToken.JwtToken> => {
    return dolbyio.authentication.getApiAccessToken(
      options.DOLBY_APP_KEY,
      options.DOLBY_APP_SECRET,
      600,
      ["comms:client_access_token:create"],
    );
  };

  const fetchAccessToken = (apiToken: jwtToken.JwtToken, id: string) => {
    return dolbyio.communications.authentication.getClientAccessTokenV2({
      accessToken: apiToken,
      externalId: id,
      sessionScope: ["conf:create", "notifications:set"],
    });
  };

  let apiTokenPromise = fetchApiToken();
  if (options.PASS) {
    app.use("/voice-token/:id", authMiddleware(options.PASS));
  }
  app.get("/voice-token/:id", async (req, res) => {
    try {
      if (!apiTokenPromise) {
        res.status(501).json({ error: "Audio service not configured" });
        return;
      }

      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: "id is required" });
        return;
      }

      let apiToken = await apiTokenPromise;
      try {
        const accessToken = await fetchAccessToken(apiToken, id);
        res.json({ accessToken: accessToken.access_token });
      } catch (err) {
        if (typeof err === "string" && err.includes("Expired or invalid token")) {
          try {
            console.log("Token is invalid or expired. Fetching a new one");
            apiTokenPromise = fetchApiToken();
            apiToken = await apiTokenPromise;
            const accessToken = await fetchAccessToken(apiToken, id);
            res.json({ accessToken: accessToken.access_token });
          } catch (error) {
            console.error(`Error re-fetching for a valid token: ${error}`);
          }
        } else {
          throw err;
        }
      }
    } catch (err) {
      console.error(`error: ${err}`);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
}

export function registerLiveKitVoiceRoutes(
  app: express.Application,
  options: {
    LIVEKIT_API_KEY: string;
    LIVEKIT_API_SECRET: string;
    LIVEKIT_WS_URL: string;
    PASS?: string;
  },
) {
  if (options.PASS) {
    app.use("/livekit-voice-token/:roomName/:id", authMiddleware(options.PASS));
  }
  app.get("/livekit-voice-token/:roomName/:id", async (req, res) => {
    const { id, roomName } = req.params;
    const apiKey = options.LIVEKIT_API_KEY;
    const apiSecret = options.LIVEKIT_API_SECRET;
    const wsUrl = options.LIVEKIT_WS_URL;

    const at = new AccessToken(apiKey, apiSecret, {
      identity: `participant-${id}`,
      ttl: "30m",
    });
    const roomService = new RoomServiceClient(wsUrl, apiKey, apiSecret);
    try {
      await roomService.getParticipant(roomName, id);
      return res.status(401).json({ error: `Username already exist in room ${roomName}` });
    } catch {
      // if participant doesn't exist, we can continue
    }
    at.addGrant({ roomJoin: true, canPublish: true, canSubscribe: true });
    const token = await at.toJwt();
    res.status(200).json({ token: token, ws_url: wsUrl });
  });
}
