import { Bot } from "./Bot";

export type BotRunnerConfig = {
  serverUrl: string;
  updateInterval: number;
  randomRange: number;
  logStatusInterval: number;
  restartConfig?: {
    minInterval: number;
    maxInterval: number;
    minWait: number;
    maxWait: number;
  };
  colorStateId?: number;
  avatarColorStateId?: number;
  usernameStateId?: number;
  characterDescriptionStateId?: number;
  yValue: number;
};

export interface BotConfig {
  id: number;
  updateInterval?: number;
  valuesToUpdate?: number[];
  randomRange: number;
  yValue: number;
  usernameStateId?: number;
  characterDescriptionStateId?: number;
  colorStateId?: number;
  avatarColorStateId?: number;
}

export class BotRunner {
  private bots: Bot[] = [];
  private statusIntervalId: NodeJS.Timeout | null = null;
  private botRestartTimers: Map<Bot, NodeJS.Timeout> = new Map();

  constructor(private readonly config: BotRunnerConfig) {}

  public addBot(config: BotConfig): Bot {
    const bot = new Bot(this.config.serverUrl, config);
    this.bots.push(bot);
    return bot;
  }

  public startAll(): void {
    for (const bot of this.bots) {
      bot.start();
      this.setupBotRestart(bot);
    }

    if (this.config.logStatusInterval > 0) {
      this.statusIntervalId = setInterval(() => {
        this.logStatus();
      }, this.config.logStatusInterval);
    }
  }

  public stopAll(): void {
    for (const bot of this.bots) {
      bot.stop();
    }

    if (this.statusIntervalId) {
      clearInterval(this.statusIntervalId);
      this.statusIntervalId = null;
    }

    // Clear all bot restart timers
    for (const [bot, timer] of this.botRestartTimers) {
      clearTimeout(timer);
    }
    this.botRestartTimers.clear();
  }

  public getBots(): Bot[] {
    return [...this.bots];
  }

  private logStatus(): void {
    console.log("=== Bot Runner Status ===");
    console.log(`Total bots: ${this.bots.length}`);
    for (const bot of this.bots) {
      console.log(bot.getStatus());
    }
    console.log("========================");
  }

  private setupBotRestart(bot: Bot): void {
    if (!this.config.restartConfig) {
      return;
    }

    const { minInterval, maxInterval, minWait, maxWait } = this.config.restartConfig;

    // Clear any existing timer for this bot
    const existingTimer = this.botRestartTimers.get(bot);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const restartDelay = minInterval + Math.random() * (maxInterval - minInterval);

    const timer = setTimeout(() => {
      console.log(`Bot ${bot.getId()} restarting after ${Math.round(restartDelay)}ms...`);
      bot.stop();

      const delay = minWait + Math.random() * (maxWait - minWait);
      // Small delay to simulate disconnection
      setTimeout(() => {
        bot.start();
        this.setupBotRestart(bot); // Re-schedule next restart
        console.log(`Bot ${bot.getId()} restarted successfully.`);
      }, delay);
    }, restartDelay);

    this.botRestartTimers.set(bot, timer);
  }

  public addRandomBots(count: number): Bot[] {
    const newBots: Bot[] = [];

    for (let i = 0; i < count; i++) {
      const config: BotConfig = {
        id: i,
        yValue: this.config.yValue,
        updateInterval: this.config.updateInterval,
        randomRange: this.config.randomRange,
        colorStateId: this.config.colorStateId,
        usernameStateId: this.config.usernameStateId,
        characterDescriptionStateId: this.config.characterDescriptionStateId,
        avatarColorStateId: this.config.avatarColorStateId,
      };

      const bot = this.addBot(config);
      newBots.push(bot);
    }

    return newBots;
  }
}
