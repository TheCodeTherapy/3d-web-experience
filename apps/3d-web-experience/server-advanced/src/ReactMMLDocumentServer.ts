import fs from "fs";
import path from "path";
import url from "url";

import { EditableNetworkedDOM, LocalObservableDOMFactory } from "@mml-io/networked-dom-server";
import { watch } from "chokidar";
import * as ws from "ws";

const getMmlDocumentContent = (documentPath: string) => {
  const contents = fs.readFileSync(documentPath, {
    encoding: "utf8",
    flag: "r",
  });
  return `<m-group id="root"></m-group><script>${contents}</script>`;
};

interface DocumentInstance {
  mmlDocument: EditableNetworkedDOM;
  connectedWebSockets: Set<ws.WebSocket>;
  documentPath: string;
}

export class ReactMMLDocumentServer {
  private documents = new Map<string, DocumentInstance>();
  private documentsDirectory: string;
  private buildDirectory: string;

  constructor(documentsDirectory: string) {
    this.documentsDirectory = documentsDirectory;
    this.buildDirectory = path.join(documentsDirectory, "build");

    // Initialize existing documents
    this.initializeDocuments();

    // Watch for changes in build directory
    watch(this.buildDirectory).on("change", (filePath) => {
      const documentName = this.getDocumentNameFromPath(filePath);
      if (documentName) {
        this.reloadDocument(documentName);
      }
    });
  }

  private initializeDocuments() {
    if (!fs.existsSync(this.buildDirectory)) {
      console.log("ReactMMLDocumentServer: Build directory does not exist yet");
      return;
    }

    const buildFiles = fs.readdirSync(this.buildDirectory).filter((file) => file.endsWith(".js"));

    for (const file of buildFiles) {
      const documentName = path.basename(file, ".js");
      const documentPath = path.join(this.buildDirectory, file);
      this.createDocumentInstance(documentName, documentPath);
    }
  }

  private createDocumentInstance(documentName: string, documentPath: string) {
    const mmlDocument = new EditableNetworkedDOM(
      url.pathToFileURL(documentPath).toString(),
      LocalObservableDOMFactory,
    );

    const instance: DocumentInstance = {
      mmlDocument,
      connectedWebSockets: new Set(),
      documentPath,
    };

    this.documents.set(documentName, instance);

    // Load initial content if file exists
    if (fs.existsSync(documentPath)) {
      mmlDocument.load(getMmlDocumentContent(documentPath));
      console.log(`ReactMMLDocumentServer: Initialized document '${documentName}'`);
    }
  }

  private getDocumentNameFromPath(filePath: string): string | null {
    const fileName = path.basename(filePath);
    if (fileName.endsWith(".js")) {
      return path.basename(fileName, ".js");
    }
    return null;
  }

  public handle(webSocket: ws.WebSocket, documentName: string = "index") {
    let instance = this.documents.get(documentName);

    if (!instance) {
      // Try to create the document if it doesn't exist
      const documentPath = path.join(this.buildDirectory, `${documentName}.js`);
      if (fs.existsSync(documentPath)) {
        this.createDocumentInstance(documentName, documentPath);
        instance = this.documents.get(documentName);
      }
    }

    if (!instance) {
      console.error(`ReactMMLDocumentServer: Document '${documentName}' not found`);
      webSocket.close(1000, `Document '${documentName}' not found`);
      return;
    }

    instance.connectedWebSockets.add(webSocket);
    instance.mmlDocument.addWebSocket(webSocket as unknown as WebSocket);

    webSocket.on("close", () => {
      instance!.connectedWebSockets.delete(webSocket);
      instance!.mmlDocument.removeWebSocket(webSocket as unknown as WebSocket);
    });

    console.log(`ReactMMLDocumentServer: Client connected to document '${documentName}'`);
  }

  public dispose() {
    for (const [documentName, instance] of this.documents) {
      // Disconnect all clients
      const clientsToDisconnect = Array.from(instance.connectedWebSockets);
      for (const webSocket of clientsToDisconnect) {
        try {
          webSocket.close(1000, "Server shutdown");
        } catch (error) {
          console.warn(`Error disconnecting client from '${documentName}' during disposal:`, error);
        }
      }
      instance.connectedWebSockets.clear();

      // Dispose the networked DOM
      instance.mmlDocument.dispose();
    }
    this.documents.clear();
  }

  private reloadDocument(documentName: string) {
    const instance = this.documents.get(documentName);
    if (!instance) {
      console.log(`ReactMMLDocumentServer: Document '${documentName}' not found for reload`);
      return;
    }

    console.log(
      `ReactMMLDocumentServer: Reloading document '${documentName}' - disconnecting clients for clean reload`,
    );

    // Force disconnect all clients to prevent stale node reference issues
    const clientsToDisconnect = Array.from(instance.connectedWebSockets);
    for (const webSocket of clientsToDisconnect) {
      try {
        webSocket.close(1000, "Document reload");
      } catch (error) {
        console.warn(`Error disconnecting client from '${documentName}' during reload:`, error);
      }
    }
    instance.connectedWebSockets.clear();

    // Load new document content
    if (fs.existsSync(instance.documentPath)) {
      instance.mmlDocument.load(getMmlDocumentContent(instance.documentPath));
      console.log(`ReactMMLDocumentServer: Document '${documentName}' reloaded successfully`);
    }
  }

  public getAvailableDocuments(): string[] {
    return Array.from(this.documents.keys());
  }
}
