import { EventHandlerCollection } from "./EventHandlerCollection";
import { VirtualJoystick } from "./VirtualJoystick";

export enum Key {
  W = "w",
  A = "a",
  S = "s",
  D = "d",
  SHIFT = "shift",
  SPACE = " ",
  C = "c",
}

type KeyCallback = () => void;
type BindingsType = Map<Key, KeyCallback>;

export class KeyInputManager {
  private keys = new Map<string, boolean>();
  private eventHandlerCollection = new EventHandlerCollection();
  private bindings: BindingsType = new Map();

  constructor(private shouldCaptureKeyPress: () => boolean = () => true) {
    this.eventHandlerCollection.add(document, "keydown", this.onKeyDown.bind(this));
    this.eventHandlerCollection.add(document, "keyup", this.onKeyUp.bind(this));
    this.eventHandlerCollection.add(window, "blur", this.handleUnfocus.bind(this));
  }

  private handleUnfocus(_event: FocusEvent): void {
    this.keys.clear();
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.shouldCaptureKeyPress()) {
      if (event.key.length === 2 && event.key[0] === "F") {
        // Ignore all Function keys
        return;
      }
      if (event.metaKey) {
        // Ignore all meta keys (e.g. Alt, Cmd)
        return;
      }
      this.keys.set(event.key.toLowerCase(), true);
      event.preventDefault();
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.keys.set(event.key.toLowerCase(), false);
    if (this.bindings.has(event.key.toLowerCase() as Key)) {
      this.bindings.get(event.key.toLowerCase() as Key)!();
    }
  }

  public isKeyPressed(key: string): boolean {
    return this.keys.get(key) || false;
  }

  public createKeyBinding(key: Key, callback: () => void): void {
    if (this.bindings.has(key)) {
      return;
    }
    this.bindings.set(key, callback);
  }

  public removeKeyBinding(key: Key): void {
    if (!this.bindings.has(key)) {
      return;
    }
    this.bindings.delete(key);
  }

  public isMovementKeyPressed(): boolean {
    return [Key.W, Key.A, Key.S, Key.D].some((key) => this.isKeyPressed(key));
  }

  private getForward(): boolean {
    return this.isKeyPressed(Key.W);
  }

  private getBackward(): boolean {
    return this.isKeyPressed(Key.S);
  }

  private getLeft(): boolean {
    return this.isKeyPressed(Key.A);
  }

  private getRight(): boolean {
    return this.isKeyPressed(Key.D);
  }

  private getRun(): boolean {
    return this.isKeyPressed(Key.SHIFT);
  }

  private getJump(): boolean {
    return this.isKeyPressed(Key.SPACE);
  }

  public getOutput(): { direction: number | null; isSprinting: boolean; jump: boolean } | null {
    const dx = (this.getRight() ? 1 : 0) - (this.getLeft() ? 1 : 0);
    const dy = (this.getBackward() ? 1 : 0) - (this.getForward() ? 1 : 0);
    const jump = this.getJump();
    if (dx === 0 && dy === 0) {
      if (this.getJump()) {
        return { direction: null, isSprinting: false, jump };
      }
      return null;
    }
    const direction = Math.atan2(dx, dy);
    return { direction, isSprinting: this.getRun(), jump };
  }

  public dispose() {
    this.eventHandlerCollection.clear();
    this.bindings.clear();
  }
}
