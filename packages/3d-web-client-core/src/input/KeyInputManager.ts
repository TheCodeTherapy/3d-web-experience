import { EventHandlerCollection } from "./EventHandlerCollection";
import { VirtualJoystick } from "./VirtualJoystick";

enum Key {
  W = "w",
  A = "a",
  S = "s",
  D = "d",
  SHIFT = "shift",
  SPACE = " ",
}

export class KeyInputManager {
  private keys = new Map<string, boolean>();
  private eventHandlerCollection = new EventHandlerCollection();

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
  }

  public isKeyPressed(key: string): boolean {
    return this.keys.get(key) || false;
  }

  public isMovementKeyPressed(): boolean {
    return [Key.W, Key.A, Key.S, Key.D].some((key) => this.isKeyPressed(key));
  }

  get forward(): boolean {
    return this.isKeyPressed(Key.W);
  }

  get backward(): boolean {
    return this.isKeyPressed(Key.S);
  }

  get left(): boolean {
    return this.isKeyPressed(Key.A);
  }

  get right(): boolean {
    return this.isKeyPressed(Key.D);
  }

  get run(): boolean {
    return this.isKeyPressed(Key.SHIFT);
  }

  get jump(): boolean {
    return this.isKeyPressed(Key.SPACE);
  }

  get anyDirection(): boolean {
    return this.isMovementKeyPressed();
  }

  get conflictingDirection(): boolean {
    return (
      (this.isKeyPressed(Key.W) && this.isKeyPressed(Key.S)) ||
      (this.isKeyPressed(Key.A) && this.isKeyPressed(Key.D))
    );
  }

  public dispose() {
    this.eventHandlerCollection.clear();
  }
}
