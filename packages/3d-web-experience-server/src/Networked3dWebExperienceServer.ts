import fs from "node:fs";
import path from "node:path";

import {
  CHAT_NETWORKING_SERVER_ERROR_MESSAGE_TYPE,
  CHAT_NETWORKING_SERVER_SHUTDOWN_ERROR_TYPE,
  ChatNetworkingServer,
} from "@mml-io/3d-web-text-chat";
import {
  USER_NETWORKING_SERVER_ERROR_MESSAGE_TYPE,
  USER_NETWORKING_SERVER_SHUTDOWN_ERROR_TYPE,
  UserData,
  UserIdentity,
  UserNetworkingServer,
} from "@mml-io/3d-web-user-networking";
import cors from "cors";
import express from "express";
import enableWs from "express-ws";
import WebSocket from "ws";

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
    userIdentityPresentedOnConnection?: UserIdentity,
  ): Promise<UserData | null> | UserData | null;
  onClientUserIdentityUpdate(clientId: number, userIdentity: UserIdentity): UserData | null;
  onClientDisconnect(clientId: number): void;
};

export const defaultSessionTokenPlaceholder = "SESSION.TOKEN.PLACEHOLDER";

export type Networked3dWebExperienceServerConfig = {
  connectionLimit?: number;
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
    documentsDirectoryRoot: string;
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
      const { documentsWatchPath, documentsDirectoryRoot } = this.config.mmlServing;
      this.mmlDocumentsServer = new MMLDocumentsServer(documentsDirectoryRoot, documentsWatchPath);
    }

    if (this.config.chatNetworkPath) {
      this.chatNetworkingServer = new ChatNetworkingServer({
        getChatUserIdentity: (sessionToken: string) => {
          return this.config.userAuthenticator.getClientIdForSessionToken(sessionToken);
        },
      });
    }

    this.userNetworkingServer = new UserNetworkingServer({
      connectionLimit: config.connectionLimit,
      onClientConnect: (
        clientId: number,
        sessionToken: string,
        userIdentityPresentedOnConnection?: UserIdentity,
      ): Promise<UserData | null> | UserData | null => {
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

  public updateUserCharacter(clientId: number, userData: UserData) {
    console.log(`Initiate server-side update of client ${clientId}`);
    this.userNetworkingServer.updateUserCharacter(clientId, userData);
  }

  public dispose(errorMessage?: string) {
    this.userNetworkingServer.dispose(
      errorMessage
        ? {
            type: USER_NETWORKING_SERVER_ERROR_MESSAGE_TYPE,
            errorType: USER_NETWORKING_SERVER_SHUTDOWN_ERROR_TYPE,
            message: errorMessage,
          }
        : undefined,
    );
    if (this.chatNetworkingServer) {
      this.chatNetworkingServer.dispose(
        errorMessage
          ? {
              type: CHAT_NETWORKING_SERVER_ERROR_MESSAGE_TYPE,
              errorType: CHAT_NETWORKING_SERVER_SHUTDOWN_ERROR_TYPE,
              message: errorMessage,
            }
          : undefined,
      );
    }
    if (this.mmlDocumentsServer) {
      this.mmlDocumentsServer.dispose();
    }
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
      app.ws(`${mmlServing.documentsUrl}*`, (ws: WebSocket, req: express.Request) => {
        const p = req.params[0];
        console.log("document requested", { p });
        mmlDocumentsServer.handle(p, ws);
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

    // Endpoint to list all tracked MML documents
    app.get("/mml-documents-list", (req, res) => {
      if (this.mmlDocumentsServer) {
        const documentList = this.mmlDocumentsServer.getDocumentList();
        const filteredDocumentList = documentList.filter(
          (doc) =>
            !doc.endsWith(".copy.html") && !doc.includes("agent") && !doc.includes("playground"),
        );
        res.json({ documents: filteredDocumentList });
      } else {
        res.status(500).json({ message: "MML Document server is not initialized." });
      }
    });

    // Get the list of documents that have a ".copy.html" version
    app.get("/mml-documents-copies", (req, res) => {
      if (this.mmlDocumentsServer) {
        const documentList = this.mmlDocumentsServer.getDocumentList();
        const documentsWithCopies = documentList
          .filter((documentName: string) => {
            const copyName = documentName.split(".")[0] + ".copy.html";
            const copyPath = path.join(
              this.config.mmlServing?.documentsDirectoryRoot || "",
              copyName,
            );
            return fs.existsSync(copyPath);
          })
          .filter((doc) => !doc.includes("agent") && !doc.includes("playground"));
        res.json({ documents: documentsWithCopies });
      } else {
        res.status(500).json({ message: "MML Document server is not initialized." });
      }
    });

    // Restore the original document from its ".copy.html" version
    app.post("/mml-documents/:documentName/restore", (req, res) => {
      const documentName = req.params.documentName;
      const documentCopyName = documentName.split(".")[0] + ".copy.html";

      const documentPath = path.join(
        this.config.mmlServing?.documentsDirectoryRoot || "",
        documentName,
      );
      const documentCopyPath = path.join(
        this.config.mmlServing?.documentsDirectoryRoot || "",
        documentCopyName,
      );

      if (!fs.existsSync(documentCopyPath)) {
        return res.status(404).json({ message: "No backup copy found for this document." });
      }

      // Copy the backup back to the original
      fs.copyFile(documentCopyPath, documentPath, (err) => {
        if (err) {
          console.error(`Error restoring document ${documentName}:`, err);
          return res.status(500).json({ message: "Unable to restore the document." });
        }

        // Delete the backup copy
        fs.unlink(documentCopyPath, (unlinkError) => {
          if (unlinkError) {
            console.error(`Error deleting backup for document ${documentName}:`, err);
            return res.status(500).json({ message: "Unable to delete the backup document." });
          }

          // Reload the document into the server's in-memory cache
          const documentState = this.mmlDocumentsServer?.documents.get(documentName);
          if (documentState) {
            const restoredContent = fs.readFileSync(documentPath, "utf8");
            documentState.document.load(restoredContent);
          }

          res.status(200).json({ message: "Document restored successfully." });
        });
      });
    });

    // Get the content of an MML document
    app.get("/mml-documents/:documentName", (req, res) => {
      const documentName = req.params.documentName;
      const documentPath = path.join(
        this.config.mmlServing?.documentsDirectoryRoot || "",
        documentName,
      );

      fs.readFile(documentPath, "utf8", (err, data) => {
        if (err) {
          console.error(`Error reading document ${documentName}:`, err);
          return res.status(500).json({ message: "Document not found or unable to read." });
        }

        res.json({ content: data });
      });
    });

    app.post("/mml-documents/:documentName", express.json(), (req, res) => {
      const documentName = req.params.documentName;
      const documentCopyName = documentName.split(".")[0] + ".copy.html";

      const documentPath = path.join(
        this.config.mmlServing?.documentsDirectoryRoot || "",
        documentName,
      );
      const documentCopyPath = path.join(
        this.config.mmlServing?.documentsDirectoryRoot || "",
        documentCopyName,
      );

      const newContent = req.body.content;

      if (!newContent) {
        return res.status(400).json({ message: "No content provided to update the document." });
      }

      if (!fs.existsSync(documentCopyPath)) {
        fs.copyFileSync(documentPath, documentCopyPath);
      }

      fs.writeFile(documentPath, newContent, "utf8", (err) => {
        if (err) {
          console.error(`Error writing to document ${documentName}:`, err);
          return res.status(500).json({ message: "Unable to write the document." });
        }

        // Reload the document into the server's in-memory cache
        const documentState = this.mmlDocumentsServer?.documents.get(documentName);
        if (documentState) {
          documentState.document.load(newContent);
        }

        res.status(200).json({ message: "Document updated successfully." });
      });
    });
  }
}
