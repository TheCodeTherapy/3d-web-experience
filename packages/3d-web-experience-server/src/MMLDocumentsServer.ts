import fs from "node:fs";
import path from "node:path";
import url from "node:url";

import { EditableNetworkedDOM, LocalObservableDOMFactory } from "@mml-io/networked-dom-server";
import { watch, FSWatcher } from "chokidar";
import dotenv from "dotenv";
import micromatch from "micromatch";
import WebSocket from "ws";

dotenv.config();

const getMmlDocumentContent = (documentPath: string) => {
  return fs.readFileSync(documentPath, { encoding: "utf8", flag: "r" });
};

const checkDevEnv = (mmlDocumentContent: string): string => {
  let content = mmlDocumentContent;
  if (process.env.NODE_ENV !== "production") {
    const regex = /wss:\/\/\//g;
    content = content.replace(regex, "ws:///");
  }
  return content;
};

const checkAPIKey = (mmlDocumentContent: string): string => {
  let content = mmlDocumentContent;
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_AGENT_ID) {
    if (
      content.includes("OPENAI_API_KEY_GOES_HERE") &&
      content.includes("OPENAI_AGENT_ID_GOES_HERE")
    ) {
      console.log("OpenAI API Key and Agent ID placeholders found in MML document");
      content = content.replace("OPENAI_API_KEY_GOES_HERE", process.env.OPENAI_API_KEY);
      content = content.replace("OPENAI_AGENT_ID_GOES_HERE", process.env.OPENAI_AGENT_ID);
    }
  }
  if (process.env.CLOUDFLARE_STREAM_URL) {
    if (content.includes("CLOUDFLARE_STREAM_URL_GOES_HERE")) {
      console.log("Cloudflare Stream URL placeholder found in MML document");
      content = content.replace(
        "CLOUDFLARE_STREAM_URL_GOES_HERE",
        process.env.CLOUDFLARE_STREAM_URL,
      );
    }

    if (content.includes("//localhost/live-status")) {
      content = content.replace(
        "//localhost/live-status",
        process.env.NODE_ENV !== "production"
          ? "http://localhost:8080/live-status"
          : "https://mml.mgz.me/live-status",
      );
    }
  }
  return content;
};

export class MMLDocumentsServer {
  public documents = new Map<
    string,
    {
      documentPath: string;
      document: EditableNetworkedDOM;
    }
  >();
  private watcher: FSWatcher;
  private watchPattern: string;

  constructor(
    private directory: string,
    watchPattern: string,
  ) {
    this.watchPattern = path.resolve(directory, watchPattern);
    this.watch();
  }

  public dispose() {
    for (const { document } of this.documents.values()) {
      document.dispose();
    }
    this.documents.clear();
    this.watcher.close();
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

  public getDocumentList(): string[] {
    return Array.from(this.documents.keys());
  }

  private watch() {
    this.watcher = watch(this.directory, {
      ignoreInitial: false,
      ignored: (checkPath, stats) => {
        if (!stats || !stats.isFile()) {
          return false;
        }
        return !micromatch.isMatch(checkPath, this.watchPattern);
      },
      persistent: true,
    });
    this.watcher
      .on("add", (fullPath, stats) => {
        if (!stats || !stats.isFile()) {
          return;
        }
        const relativePath = path.relative(this.directory, fullPath);
        console.log(`MML Document '${relativePath}' has been added`);
        const contents = checkDevEnv(checkAPIKey(getMmlDocumentContent(fullPath)));
        const document = new EditableNetworkedDOM(
          url.pathToFileURL(fullPath).toString(),
          LocalObservableDOMFactory,
        );
        document.load(contents);

        const currentData = {
          documentPath: fullPath,
          document,
        };
        this.documents.set(relativePath, currentData);
      })
      .on("change", (fullPath) => {
        const relativePath = path.relative(this.directory, fullPath);
        console.log(`MML Document '${relativePath}' has been changed`);
        const contents = checkDevEnv(checkAPIKey(getMmlDocumentContent(fullPath)));
        const documentState = this.documents.get(relativePath);
        if (!documentState) {
          console.error(`MML Document '${relativePath}' not found`);
          return;
        }
        documentState.document.load(contents);
      })
      .on("unlink", (fullPath) => {
        const relativePath = path.relative(this.directory, fullPath);
        console.log(`MML Document '${relativePath}' has been removed`);
        const documentState = this.documents.get(relativePath);
        if (!documentState) {
          console.error(`MML Document '${relativePath}' not found`);
          return;
        }
        documentState.document.dispose();
        this.documents.delete(relativePath);
      })
      .on("error", (error) => {
        console.error("Error whilst watching directory", error);
      });
  }
}
