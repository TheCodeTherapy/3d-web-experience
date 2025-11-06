/* eslint-disable import/no-extraneous-dependencies */
import { deltaNetProtocolSubProtocol_v0_1, BufferWriter } from "@mml-io/delta-net-protocol";
import {
  DeltaNetClientWebsocket,
  DeltaNetClientWebsocketInitialCheckout,
  DeltaNetClientWebsocketStatus,
  DeltaNetClientWebsocketStatusToString,
  DeltaNetClientWebsocketTick,
  DeltaNetClientWebsocketUserIndex,
} from "@mml-io/delta-net-web";
import ws from "ws";

import { getBotColors } from "./BotColors";
import { BotConfig } from "./BotRunner";

// WebSocket fallback for Node.js versions without native WebSocket
function createWebSocket(url: string, protocols?: string | string[]): WebSocket {
  if (typeof WebSocket !== "undefined") {
    // Use native WebSocket if available
    return new WebSocket(url, protocols);
  } else {
    // Fallback to ws package for Node.js
    try {
      // Dynamic import for Node.js compatibility
      return new ws(url, protocols) as unknown as WebSocket;
    } catch (error) {
      throw new Error(
        'WebSocket is not available. Please install the "ws" package for Node.js compatibility.',
        { cause: error },
      );
    }
  }
}

const textEncoder = new TextEncoder();

// Encode colors using the same format as DeltaNetComponentMapping.encodeColors()
function encodeColors(colors: Array<[number, number, number]>): Uint8Array {
  const bufferWriter = new BufferWriter(3 * colors.length + 1);
  bufferWriter.writeUVarint(colors.length);
  for (const color of colors) {
    bufferWriter.writeUVarint(color[0]);
    bufferWriter.writeUVarint(color[1]);
    bufferWriter.writeUVarint(color[2]);
  }
  return bufferWriter.getBuffer();
}

// Generate consistent colors for all bot character parts
function generateBotCharacterColors(): Array<[number, number, number]> {
  // Order matches colorPartNamesIndex: hair, skin, lips, shirt_short, shirt_long, pants_short, pants_long, shoes
  // All bots will have the same colors - a distinctive bot appearance
  return [
    [
      Math.floor(Math.random() * 255),
      Math.floor(Math.random() * 255),
      Math.floor(Math.random() * 255),
    ], // hair
    [248, 206, 180], // skin
    [180, 120, 120], // lips
    [47, 43, 78], // shirt_short
    [160, 120, 100], // shirt_long
    [97, 91, 140], // pants_short
    [97, 91, 140], // pants_long
    [47, 43, 78], // shoes - dark gray
  ];
}

const tlds = ["com", "net", "org", "io", "ai", "dev", "app", "co"];

function randomDomain() {
  // Between 3 and 20 characters
  const domainLength = Math.floor(Math.random() * 18) + 3;
  const domain = Math.random()
    .toString(36)
    .substring(2, domainLength + 2);
  // Randomly select a TLD
  const tld = tlds[Math.floor(Math.random() * tlds.length)];
  return domain + "." + tld;
}

function generateRandomUrl() {
  return `https://${randomDomain()}/${Math.floor(Math.random() * 1000000)}.glb`;
}

const xComponent = 1;
const yComponent = 2;
const zComponent = 3;
const rotationYComponent = 4;
const rotationWComponent = 5;
const stateComponent = 6;

export class Bot {
  private client: DeltaNetClientWebsocket | null = null;
  private states = new Map<number, Uint8Array>();
  private values = new Map<number, bigint>();
  private localClientIndex: number | null = null;
  private updateIntervalId: NodeJS.Timeout | null = null;
  private connected = false;

  // Circular motion parameters
  private radius1: number;
  private center1: number;
  private angle1: number;
  private rate1: number;

  private radius2: number;
  private center2: number;
  private angle2: number;
  private rate2: number;

  constructor(
    private readonly url: string,
    private readonly config: BotConfig,
  ) {
    // Initialize circular motion parameters
    this.radius1 = 1500;
    this.center1 = Math.random() * 1000 - 500;
    this.angle1 = Math.random() * 2 * Math.PI;
    this.rate1 = 0.02;

    this.radius2 = 2000;
    this.center2 = Math.random() * 1000 - 500;
    this.angle2 = Math.random() * 2 * Math.PI;
    this.rate2 = 0.01;

    // Initialize values
    for (const key of config.valuesToUpdate ?? [xComponent, zComponent]) {
      this.values.set(key, 0n);
    }

    // Initialize states
    this.initializeStates();
  }

  private initializeStates(): void {
    const mmlCharacterUrl = `https://casual-v1.msquaredavatars.com/${this.config.id}.mml`;
    if (this.config.characterDescriptionStateId) {
      const characterDescription = {
        mmlCharacterUrl,
      };
      this.states.set(
        this.config.characterDescriptionStateId,
        textEncoder.encode(JSON.stringify(characterDescription)),
      );
    }

    if (this.config.usernameStateId) {
      this.states.set(this.config.usernameStateId, textEncoder.encode(`Bot ${this.config.id}`));
    }

    if (this.config.avatarColorStateId) {
      // Send consistent bot colors in the proper format expected by DeltaNetComponentMapping.decodeColors()
      const characterColors = getBotColors(mmlCharacterUrl);
      const encodedColors = encodeColors(characterColors);
      this.states.set(this.config.avatarColorStateId, encodedColors);
    }
  }

  public start(): void {
    this.connect();
    const updateInterval = this.config.updateInterval ?? 50; // Use smaller interval for smoother motion
    this.updateIntervalId = setInterval(() => {
      if (!this.connected) return;

      this.updateValues();
    }, updateInterval);
  }

  public stop(): void {
    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId);
      this.updateIntervalId = null;
    }
    this.disconnect();
  }

  private connect(): void {
    if (this.client) {
      this.client.stop();
    }

    this.client = new DeltaNetClientWebsocket(
      this.url,
      (url: string) => {
        return createWebSocket(url, deltaNetProtocolSubProtocol_v0_1);
      },
      `bot-token-${this.config.id}-${Date.now()}-${Math.round(Math.random() * 100000)}`, // Placeholder authentication token for bot
      {
        onUserIndex: (userIndex: DeltaNetClientWebsocketUserIndex) => {
          this.localClientIndex = userIndex.userIndex;
        },
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onInitialCheckout: (initialCheckout: DeltaNetClientWebsocketInitialCheckout) => {
          // Bots ignore data
        },
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onTick: (tick: DeltaNetClientWebsocketTick) => {
          // Bots ignore ticks
        },
        onError: (errorType: string, errorMessage: string, retryable: boolean) => {
          console.error(
            `Bot ${this.config.id} error: ${errorType} - ${errorMessage} (retryable: ${retryable})`,
          );
        },
        onWarning: (warning: string) => {
          console.warn(`Bot ${this.config.id} warning: ${warning}`);
        },
        ignoreData: true,
      },
      undefined,
      this.handleStatusUpdate.bind(this),
    );
  }

  private disconnect(): void {
    if (this.client) {
      this.client.stop();
      this.connected = false;
    }
  }

  private updateValues(): void {
    const x1 = this.center1 + this.radius1 * Math.cos(this.angle1);
    const y1 = this.center1 + this.radius1 * Math.sin(this.angle1);
    this.angle1 += this.rate1;

    const x2 = this.center2 + this.radius2 * Math.cos(this.angle2);
    const y2 = this.center2 + this.radius2 * Math.sin(this.angle2);
    this.angle2 -= this.rate2;

    // Calculate x and y positions based on combined circular motion
    const x = BigInt(Math.round(x1 + x2));
    const y = BigInt(Math.round(this.config.yValue));
    const z = BigInt(Math.round(y1 + y2));

    // Calculate rotation based on movement direction
    // Get the velocity components by calculating the tangent to the circles
    const dx1 = -this.radius1 * Math.sin(this.angle1) * this.rate1;
    const dy1 = this.radius1 * Math.cos(this.angle1) * this.rate1;

    const dx2 = this.radius2 * Math.sin(this.angle2) * this.rate2;
    const dy2 = -this.radius2 * Math.cos(this.angle2) * this.rate2;

    // Combined velocity
    const velocityX = dx1 + dx2;
    const velocityZ = dy1 + dy2;

    // Calculate the Y rotation (yaw) based on velocity direction
    // This makes the bot face the direction it's moving
    const rotationY = Math.atan2(velocityX, velocityZ);

    // Convert to quaternion components (Y rotation around Y axis)
    // For a Y rotation, quaternionY = sin(angle/2), quaternionW = cos(angle/2)
    const quaternionY = Math.sin(rotationY / 2);
    const quaternionW = Math.cos(rotationY / 2);

    // Apply rotation multiplier (same as DeltaNetComponentMapping.ts)
    const rotationMultiplier = 360;

    this.values.set(xComponent, x);
    this.values.set(yComponent, y);
    this.values.set(zComponent, z);
    this.values.set(rotationYComponent, BigInt(Math.round(quaternionY * rotationMultiplier)));
    this.values.set(rotationWComponent, BigInt(Math.round(quaternionW * rotationMultiplier)));
    this.values.set(stateComponent, BigInt(1));

    if (this.config.colorStateId) {
      if (Math.random() > 0.99) {
        const color = Math.floor(Math.random() * 16777215);
        const colorBytes = new Uint8Array(3);
        colorBytes[0] = (color >> 16) & 0xff;
        colorBytes[1] = (color >> 8) & 0xff;
        colorBytes[2] = color & 0xff;
        this.states.set(this.config.colorStateId, colorBytes);
      }
    }

    if (this.client) {
      this.client.setUserComponents(new Map(this.values), this.states);
    }
  }

  private handleStatusUpdate(status: DeltaNetClientWebsocketStatus): void {
    console.log(`Bot ${this.config.id} status: ${DeltaNetClientWebsocketStatusToString(status)}`);
    if (
      status === DeltaNetClientWebsocketStatus.Connected ||
      status === DeltaNetClientWebsocketStatus.ConnectionOpen
    ) {
      this.connected = true;
    } else if (
      status === DeltaNetClientWebsocketStatus.Disconnected ||
      status === DeltaNetClientWebsocketStatus.Reconnecting
    ) {
      this.connected = false;
    }
  }

  public getValues(): Map<number, bigint> {
    return new Map(this.values);
  }

  public getLocalClientIndex(): number | null {
    return this.localClientIndex;
  }

  public getStatus(): string {
    return `Bot ${this.config.id}: Index=${this.localClientIndex ?? "unknown"}`;
  }

  public getId(): number {
    return this.config.id ?? 0;
  }
}
