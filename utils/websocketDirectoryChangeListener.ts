import chokidar from "chokidar";
import enableWs from "express-ws";
import WebSocket from "ws";

export function websocketDirectoryChangeListener(
  app: enableWs.Application,
  options: {
    directory: string;
    websocketPath: string;
  },
) {
  const listeningClients = new Set<WebSocket>();
  chokidar.watch(options.directory).on("all", () => {
    for (const client of listeningClients) {
      client.send("change");
    }
  });
  // Create an event-source that updates whenever the build folder gets modified
  app.ws(options.websocketPath, (ws: WebSocket) => {
    listeningClients.add(ws);
    ws.on("close", () => {
      listeningClients.delete(ws);
    });
  });
}
