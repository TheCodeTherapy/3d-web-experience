import { ChatNetworkingServer } from "@mml-io/3d-web-text-chat";
import { UserData, UserIdentity, UserNetworkingServer } from "@mml-io/3d-web-user-networking";
import cors from "cors";
import express from "express";
import enableWs from "express-ws";
import WebSocket from "ws";

import { MMLDocumentsServer } from "./MMLDocumentsServer";
import { websocketDirectoryChangeListener } from "./websocketDirectoryChangeListener";

type UserAuthenticator = {
  generateAuthorizedSessionToken(req: express.Request): string | null;
  getClientIdForSessionToken: (sessionToken: string) => {
    id: number;
  } | null;
  onClientConnect(
    clientId: number,
    sessionToken: string,
    userIdentityPresentedOnConnection?: UserIdentity,
  ): UserData | null;
  onClientUserIdentityUpdate(clientId: number, userIdentity: UserIdentity): UserData | null;
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
  chatNetworkPath?: string;
  assetServing?: {
    assetsDir: string;
    assetsUrl: string;
  };
  mmlServing?: {
    documentsWatchPath: string;
    documentsUrl: string;
  };
  userAuthenticator: UserAuthenticator;
};

export class Networked3dWebExperienceServer {
  private userNetworkingServer: UserNetworkingServer;

  private chatNetworkingServer?: ChatNetworkingServer;

  private mmlDocumentsServer?: MMLDocumentsServer;

  constructor(private config: Networked3dWebExperienceServerConfig) {
    if (this.config.mmlServing) {
      this.mmlDocumentsServer = new MMLDocumentsServer(this.config.mmlServing.documentsWatchPath);
    }

    if (this.config.chatNetworkPath) {
      this.chatNetworkingServer = new ChatNetworkingServer({
        getChatUserIdentity: (sessionToken: string) => {
          return this.config.userAuthenticator.getClientIdForSessionToken(sessionToken);
        },
      });
    }

    this.userNetworkingServer = new UserNetworkingServer({
      onClientConnect: (
        clientId: number,
        sessionToken: string,
        userIdentityPresentedOnConnection?: UserIdentity,
      ): UserData | null => {
        return this.config.userAuthenticator.onClientConnect(
          clientId,
          sessionToken,
          userIdentityPresentedOnConnection,
        );
      },
      onClientUserIdentityUpdate: (
        clientId: number,
        userIdentity: UserIdentity,
      ): UserData | null => {
        // Called whenever a user connects or updates their character/identity
        return this.config.userAuthenticator.onClientUserIdentityUpdate(clientId, userIdentity);
      },
      onClientDisconnect: (clientId: number): void => {
        this.config.userAuthenticator.onClientDisconnect(clientId);
        // Disconnect the corresponding chat client to avoid later conflicts of client ids
        if (this.chatNetworkingServer) {
          this.chatNetworkingServer.disconnectClientId(clientId);
        }
      },
    });
  }

  registerExpressRoutes(app: enableWs.Application) {
    app.ws(this.config.networkPath, (ws) => {
      this.userNetworkingServer.connectClient(ws);
    });

    if (this.config.chatNetworkPath && this.chatNetworkingServer) {
      const chatServer = this.chatNetworkingServer;
      app.ws(this.config.chatNetworkPath, (ws) => {
        chatServer.connectClient(ws);
      });
    }

    const webClientServing = this.config.webClientServing;
    if (webClientServing) {
      app.get(webClientServing.indexUrl, (req: express.Request, res: express.Response) => {
        const token = this.config.userAuthenticator.generateAuthorizedSessionToken(req);
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
      app.ws(`${mmlServing.documentsUrl}:filename`, (ws: WebSocket, req: express.Request) => {
        const { filename } = req.params;
        mmlDocumentsServer.handle(filename, ws);
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
