import { Bot } from "./Bot";
import { BotRunner, BotRunnerConfig } from "./BotRunner";

const defaultConfig: BotRunnerConfig = {
  serverUrl: "ws://localhost:7971/delta-net-websocket",
  updateInterval: 50,
  randomRange: 2048,
  logStatusInterval: 5000,
  yValue: 0,
  colorStateId: 3,
};

const webWorldConfig: BotRunnerConfig = {
  serverUrl: "ws://localhost:8080/network",
  updateInterval: 50,
  randomRange: 4096,
  yValue: 45,
  logStatusInterval: 5000,
  usernameStateId: 2,
  characterDescriptionStateId: 1,
  avatarColorStateId: 3,
  restartConfig: {
    minInterval: 10000,
    maxInterval: 20000,
    minWait: 1000,
    maxWait: 5000,
  },
};

let config = defaultConfig;
console.log("process.argv", process.argv);
const configArg = process.argv.find((arg) => arg.startsWith("--config="));
console.log("configArg", configArg);
if (configArg === "--config=web-world") {
  console.log("Using web world config");
  config = webWorldConfig;
}

// Usage example for BotRunner
function main() {
  const botRunner = new BotRunner(config);

  console.log("Starting Delta Net Bot Runner");

  // Add a bunch of random bots with default settings
  botRunner.addRandomBots(500);

  // Start all bots
  botRunner.startAll();

  console.log(`Started ${botRunner.getBots().length} bots`);

  // Set up graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nStopping all bots...");
    botRunner.stopAll();
    console.log("All bots stopped. Exiting.");
    process.exit(0);
  });
}

main();
