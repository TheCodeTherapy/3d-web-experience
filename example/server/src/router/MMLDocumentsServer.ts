import fs from "fs";
import path from "path";
import url from "url";

import chokidar from "chokidar";
import { EditableNetworkedDOM, LocalObservableDOMFactory } from "networked-dom-server";
import WebSocket from "ws";

const getMmlDocumentContent = (documentPath: string) => {
  return fs.readFileSync(documentPath, { encoding: "utf8", flag: "r" });
};

export class MMLDocumentsServer {
  private documents = new Map<
    string,
    {
      documentPath: string;
      document: EditableNetworkedDOM;
    }
  >();

  constructor(private directory: string) {
    this.watch();
  }

  public handle(filename: string, ws: WebSocket) {
    const document = this.documents.get(filename)?.document;
    if (!document) {
      ws.close();
      return;
    }

    document.addWebSocket(ws as any);
    ws.on("close", () => {
      document.removeWebSocket(ws as any);
    });
  }

  private watch() {
    const watcher = chokidar.watch(this.directory, {
      ignored: /^\./,
      persistent: true,
    });
    watcher
      .on("add", (relativeFilePath) => {
        const filename = path.basename(relativeFilePath);
        console.log(`Example document '${filename}' has been added`);
        const contents = getMmlDocumentContent(relativeFilePath);
        const document = new EditableNetworkedDOM(
          url.pathToFileURL(filename).toString(),
          LocalObservableDOMFactory,
        );
        document.load(contents);

        const currentData = {
          documentPath: filename,
          document,
        };
        this.documents.set(filename, currentData);
      })
      .on("change", (relativeFilePath) => {
        const filename = path.basename(relativeFilePath);
        console.log(`Example document '${filename}' has been changed`);
        const contents = getMmlDocumentContent(relativeFilePath);
        const documentState = this.documents.get(filename);
        if (!documentState) {
          console.error(`Example document '${filename}' not found`);
          return;
        }
        documentState.document.load(contents);
      })
      .on("unlink", (relativeFilePath) => {
        const filename = path.basename(relativeFilePath);
        console.log(`Example document '${filename}' has been removed`);
        const documentState = this.documents.get(filename);
        if (!documentState) {
          console.error(`Example document '${filename}' not found`);
          return;
        }
        documentState.document.dispose();
        this.documents.delete(filename);
      })
      .on("error", (error) => {
        console.error("Error whilst watching directory", error);
      });
  }
}
