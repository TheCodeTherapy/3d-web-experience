import fs from "fs";
import url from "url";

import chokidar from "chokidar";
import { EditableNetworkedDOM, LocalObservableDOMFactory } from "networked-dom-server";
import WebSocket from "ws";

const getMmlDocumentContent = (documentPath: string) => {
  const contents = fs.readFileSync(documentPath, {
    encoding: "utf8",
    flag: "r",
  });
  return `<m-group id="root"></m-group><script>${contents}</script>`;
};

export class ReactMMLDocumentServer {
  private mmlDocument: EditableNetworkedDOM;

  constructor(private mmlDocumentPath: string) {
    this.mmlDocument = new EditableNetworkedDOM(
      url.pathToFileURL(this.mmlDocumentPath).toString(),
      LocalObservableDOMFactory,
    );

    // Watch for changes in DOM file and reload
    chokidar.watch(this.mmlDocumentPath).on("change", () => {
      this.reload();
    });
    this.reload();
  }

  public handle(ws: WebSocket) {
    this.mmlDocument.addWebSocket(ws as any);
    ws.on("close", () => {
      this.mmlDocument.removeWebSocket(ws as any);
    });
  }

  private reload() {
    const isSecure = process.env.NODE_ENV === "production";
    const httpProtocol = isSecure ? "https" : "http";
    const wsProtocol = isSecure ? "wss" : "ws";
    console.log("Reloading MML document", wsProtocol, httpProtocol);
    this.mmlDocument.load(getMmlDocumentContent(this.mmlDocumentPath), {
      httpProtocol,
      wsProtocol,
    });
  }
}
