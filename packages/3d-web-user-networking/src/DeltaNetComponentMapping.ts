import { BufferReader, BufferWriter } from "@mml-io/delta-net-protocol";

import { UserNetworkingClientUpdate } from "./types";
import { UserData } from "./UserData";
import { UserNetworkingLogger } from "./UserNetworkingLogger";
import { CharacterDescription } from "./UserNetworkingMessages";

// Component IDs used in the deltanet implementation
export const COMPONENT_POSITION_X = 1;
export const COMPONENT_POSITION_Y = 2;
export const COMPONENT_POSITION_Z = 3;
export const COMPONENT_ROTATION_Y = 4;
export const COMPONENT_ROTATION_W = 5;
export const COMPONENT_STATE = 6;

// State IDs for binary data
export const STATE_INTERNAL_CONNECTION_ID = 0;
export const STATE_CHARACTER_DESCRIPTION = 1;
export const STATE_USERNAME = 2;
export const STATE_COLORS = 3;

export const rotationMultiplier = 360;
export const positionMultiplier = 100;
const textDecoder = new TextDecoder();

export class DeltaNetComponentMapping {
  /**
   * Convert UserNetworkingClientUpdate to deltanet components
   */
  static toComponents(update: UserNetworkingClientUpdate): Map<number, bigint> {
    const components = new Map<number, bigint>();

    // Convert position values to fixed-point representation
    components.set(
      COMPONENT_POSITION_X,
      BigInt(Math.round(update.position.x * positionMultiplier)),
    );
    components.set(
      COMPONENT_POSITION_Y,
      BigInt(Math.round(update.position.y * positionMultiplier)),
    );
    components.set(
      COMPONENT_POSITION_Z,
      BigInt(Math.round(update.position.z * positionMultiplier)),
    );

    // Convert quaternion values to fixed-point representation
    // Using 32767 scale to match original codec precision
    components.set(
      COMPONENT_ROTATION_Y,
      BigInt(Math.round(update.rotation.quaternionY * rotationMultiplier)),
    );
    components.set(
      COMPONENT_ROTATION_W,
      BigInt(Math.round(update.rotation.quaternionW * rotationMultiplier)),
    );

    // State is already an integer
    components.set(COMPONENT_STATE, BigInt(update.state));

    return components;
  }

  /**
   * Convert deltanet components back to UserNetworkingClientUpdate
   */
  static fromComponents(components: Map<number, bigint>): UserNetworkingClientUpdate {
    const positionX =
      Number(components.get(COMPONENT_POSITION_X) || BigInt(0)) / positionMultiplier;
    const positionY =
      Number(components.get(COMPONENT_POSITION_Y) || BigInt(0)) / positionMultiplier;
    const positionZ =
      Number(components.get(COMPONENT_POSITION_Z) || BigInt(0)) / positionMultiplier;
    const rotationY =
      Number(components.get(COMPONENT_ROTATION_Y) || BigInt(0)) / rotationMultiplier;
    const rotationW =
      Number(components.get(COMPONENT_ROTATION_W) || BigInt(0)) / rotationMultiplier;

    const state = Number(components.get(COMPONENT_STATE) || BigInt(0));

    return {
      position: { x: positionX, y: positionY, z: positionZ },
      rotation: { quaternionY: rotationY, quaternionW: rotationW },
      state,
    };
  }

  /**
   * Encode character description and username to binary states
   */
  static toStates(userIdentity: UserData): Map<number, Uint8Array> {
    const states = new Map<number, Uint8Array>();
    const textEncoder = new TextEncoder();

    if (userIdentity.username) {
      // Encode username
      states.set(STATE_USERNAME, textEncoder.encode(userIdentity.username));
    }

    // Encode character description as JSON
    if (userIdentity.characterDescription) {
      states.set(
        STATE_CHARACTER_DESCRIPTION,
        textEncoder.encode(JSON.stringify(userIdentity.characterDescription)),
      );
    }

    if (userIdentity.colors) {
      states.set(STATE_COLORS, DeltaNetComponentMapping.encodeColors(userIdentity.colors));
    }

    return states;
  }

  /**
   * Encode username to binary state
   */
  static toUsernameState(username: string): Map<number, Uint8Array> {
    const states = new Map<number, Uint8Array>();
    const textEncoder = new TextEncoder();
    states.set(STATE_USERNAME, textEncoder.encode(username));
    return states;
  }

  /**
   * Encode character description to binary state
   */
  static toCharacterDescriptionState(
    characterDescription: CharacterDescription,
  ): Map<number, Uint8Array> {
    const states = new Map<number, Uint8Array>();
    const textEncoder = new TextEncoder();
    states.set(
      STATE_CHARACTER_DESCRIPTION,
      textEncoder.encode(JSON.stringify(characterDescription)),
    );
    return states;
  }

  /**
   * Encode colors to binary state
   */
  static toColorsState(colors: Array<[number, number, number]>): Map<number, Uint8Array> {
    const states = new Map<number, Uint8Array>();
    states.set(STATE_COLORS, DeltaNetComponentMapping.encodeColors(colors));
    return states;
  }

  /**
   * Encode single state value
   */
  static toSingleState(stateId: number, value: any): Map<number, Uint8Array> {
    const states = new Map<number, Uint8Array>();
    const textEncoder = new TextEncoder();

    switch (stateId) {
      case STATE_USERNAME:
        if (typeof value === "string") {
          states.set(stateId, textEncoder.encode(value));
        }
        break;
      case STATE_CHARACTER_DESCRIPTION:
        if (typeof value === "object" && value !== null) {
          states.set(stateId, textEncoder.encode(JSON.stringify(value)));
        }
        break;
      case STATE_COLORS:
        if (Array.isArray(value)) {
          states.set(stateId, DeltaNetComponentMapping.encodeColors(value));
        }
        break;
    }

    return states;
  }

  static encodeColors(colors: Array<[number, number, number]>): Uint8Array {
    const bufferWriter = new BufferWriter(3 * colors.length + 1);
    bufferWriter.writeUVarint(colors.length);
    for (const color of colors) {
      bufferWriter.writeUVarint(color[0]);
      bufferWriter.writeUVarint(color[1]);
      bufferWriter.writeUVarint(color[2]);
    }
    return bufferWriter.getBuffer();
  }

  static decodeColors(
    colors: Uint8Array,
    logger: UserNetworkingLogger,
  ): Array<[number, number, number]> {
    if (colors.byteLength === 0) {
      return [];
    }
    try {
      const bufferReader = new BufferReader(colors);
      const colorsArray: Array<[number, number, number]> = [];
      const count = bufferReader.readUVarint();
      for (let i = 0; i < count; i++) {
        colorsArray.push([
          bufferReader.readUVarint(),
          bufferReader.readUVarint(),
          bufferReader.readUVarint(),
        ]);
      }
      return colorsArray;
    } catch (e) {
      logger.error("Error decoding colors", colors, e);
      return [];
    }
  }

  static fromUserStates(states: Map<number, Uint8Array>, logger: UserNetworkingLogger): UserData {
    const usernameBytes = states.get(STATE_USERNAME);
    const username = usernameBytes
      ? DeltaNetComponentMapping.usernameFromBytes(usernameBytes)
      : null;

    const characterDescBytes = states.get(STATE_CHARACTER_DESCRIPTION);
    const characterDescription = characterDescBytes
      ? DeltaNetComponentMapping.characterDescriptionFromBytes(characterDescBytes)
      : null;

    const colorsBytes = states.get(STATE_COLORS);
    const colorsArray = colorsBytes
      ? DeltaNetComponentMapping.decodeColors(colorsBytes, logger)
      : [];

    return { username, characterDescription, colors: colorsArray };
  }

  static userIdFromBytes(bytes: Uint8Array): number | null {
    if (bytes.length === 0) {
      return null;
    }
    const reader = new BufferReader(bytes);
    return reader.readUVarint(false);
  }

  static usernameFromBytes(bytes: Uint8Array): string | null {
    if (bytes.length === 0) {
      return null;
    }
    return textDecoder.decode(bytes);
  }
  static characterDescriptionFromBytes(bytes: Uint8Array): CharacterDescription | null {
    if (bytes.length === 0) {
      return null;
    }
    return JSON.parse(textDecoder.decode(bytes));
  }

  /**
   * Decode binary states back to username and character description
   */
  static fromStates(
    states: Map<number, Uint8Array>,
    logger: UserNetworkingLogger,
  ): {
    userId: number | null;
  } & UserData {
    const userIdBytes = states.get(STATE_INTERNAL_CONNECTION_ID);
    let userId: number | null = null;
    if (userIdBytes) {
      const reader = new BufferReader(userIdBytes);
      userId = reader.readUVarint(false);
    }

    const userStates = DeltaNetComponentMapping.fromUserStates(states, logger);

    return { userId, ...userStates };
  }
}
