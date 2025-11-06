import {
  UserData,
  UserNetworkingServer,
  UserNetworkingServerError,
} from "@mml-io/3d-web-user-networking";
import cors from "cors";
import express from "express";
import enableWs from "express-ws";
import ws from "ws";

import { MMLDocumentsServer } from "./MMLDocumentsServer";
import { websocketDirectoryChangeListener } from "./websocketDirectoryChangeListener";

type UserAuthenticator = {
  generateAuthorizedSessionToken(req: express.Request): Promise<string | null>;
  getClientIdForSessionToken: (sessionToken: string) => {
    id: number;
  } | null;
  onClientConnect(
    clientId: number,
    sessionToken: string,
    userIdentityPresentedOnConnection?: UserData,
  ): Promise<UserData | true | Error> | UserData | true | Error;
  onClientUserIdentityUpdate(clientId: number, userIdentity: UserData): UserData | true | Error;
  onClientDisconnect(clientId: number): void;
};

export const defaultSessionTokenPlaceholder = "SESSION.TOKEN.PLACEHOLDER";

export type Networked3dWebExperienceServerConfig = {
  networkPath: string;
  webClientServing: {
    indexUrl: string;
    indexContent: string;
    sessionTokenPlaceholder?: string;

    clientBuildDir: string;
    clientUrl: string;
    clientWatchWebsocketPath?: string;
  };
  enableChat?: boolean;
  assetServing?: {
    assetsDir: string;
    assetsUrl: string;
  };
  mmlServing?: {
    documentsWatchPath: string;
    documentsDirectoryRoot: string;
    documentsUrl: string;
  };
  userAuthenticator: UserAuthenticator;
};

export class Networked3dWebExperienceServer {
  public userNetworkingServer: UserNetworkingServer;

  public mmlDocumentsServer?: MMLDocumentsServer;

  constructor(private config: Networked3dWebExperienceServerConfig) {
    if (this.config.mmlServing) {
      const { documentsWatchPath, documentsDirectoryRoot } = this.config.mmlServing;
      this.mmlDocumentsServer = new MMLDocumentsServer(documentsDirectoryRoot, documentsWatchPath);
    }

    this.userNetworkingServer = new UserNetworkingServer({
      legacyAdapterEnabled: true,
      onClientConnect: (
        clientId: number,
        sessionToken: string,
        userIdentityPresentedOnConnection?: UserData,
      ): Promise<UserData | true | Error> | UserData | true | Error => {
        return this.config.userAuthenticator.onClientConnect(
          clientId,
          sessionToken,
          userIdentityPresentedOnConnection,
        );
      },
      onClientUserIdentityUpdate: (
        clientId: number,
        userIdentity: UserData,
      ): UserData | true | Error => {
        // Called whenever a user connects or updates their character/identity
        return this.config.userAuthenticator.onClientUserIdentityUpdate(clientId, userIdentity);
      },
      onClientDisconnect: (clientId: number): void => {
        this.config.userAuthenticator.onClientDisconnect(clientId);
      },
    });
  }

  public updateUserCharacter(clientId: number, userData: UserData) {
    console.log(`Initiate server-side update of client ${clientId}`);
    this.userNetworkingServer.updateUserCharacter(clientId, userData);
  }

  public dispose(error?: UserNetworkingServerError) {
    this.userNetworkingServer.dispose(error);
    if (this.mmlDocumentsServer) {
      this.mmlDocumentsServer.dispose();
    }
  }

  registerExpressRoutes(app: enableWs.Application) {
    app.ws(this.config.networkPath, (ws) => {
      this.userNetworkingServer.connectClient(ws as unknown as WebSocket);
    });

    const webClientServing = this.config.webClientServing;
    if (webClientServing) {
      app.get(webClientServing.indexUrl, async (req: express.Request, res: express.Response) => {
        const token = await this.config.userAuthenticator.generateAuthorizedSessionToken(req);
        if (!token) {
          res.send("Error: Could not generate token");
          return;
        }
        const authorizedDemoIndexContent = webClientServing.indexContent.replace(
          webClientServing.sessionTokenPlaceholder || defaultSessionTokenPlaceholder,
          token,
        );
        res.send(authorizedDemoIndexContent);
      });

      app.use(webClientServing.clientUrl, express.static(webClientServing.clientBuildDir));
      if (webClientServing.clientWatchWebsocketPath) {
        websocketDirectoryChangeListener(app, {
          directory: webClientServing.clientBuildDir,
          websocketPath: webClientServing.clientWatchWebsocketPath,
        });
      }
    }

    const mmlDocumentsServer = this.mmlDocumentsServer;
    const mmlServing = this.config.mmlServing;
    // Handle example document sockets
    if (mmlServing && mmlDocumentsServer) {
      app.ws(`${mmlServing.documentsUrl}*`, (ws: ws.WebSocket, req: express.Request) => {
        const path = req.params[0];
        console.log("document requested", { path });
        mmlDocumentsServer.handle(path, ws);
      });
    }

    if (this.config.assetServing) {
      // Serve assets with CORS allowing all origins
      app.use(
        this.config.assetServing.assetsUrl,
        cors(),
        express.static(this.config.assetServing.assetsDir),
      );
    }
  }
}
