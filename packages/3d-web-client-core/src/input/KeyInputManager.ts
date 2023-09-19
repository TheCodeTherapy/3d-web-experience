export class KeyInputManager {
  private keys = new Map<string, boolean>();

  constructor() {
    document.addEventListener("keydown", this.onKeyDown.bind(this));
    document.addEventListener("keyup", this.onKeyUp.bind(this));
    window.addEventListener("blur", this.handleUnfocus.bind(this));
  }

  private handleUnfocus(_event: FocusEvent): void {
    this.keys.clear();
  }

  private onKeyDown(event: KeyboardEvent): void {
    this.keys.set(event.key.toLowerCase(), true);
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.keys.set(event.key.toLowerCase(), false);
  }

  public isKeyPressed(key: string): boolean {
    return this.keys.get(key) || false;
  }

  public isMovementKeyPressed(): boolean {
    return ["w", "a", "s", "d"].some((key) => this.isKeyPressed(key));
  }

  get forward(): boolean {
    return this.isKeyPressed("w");
  }

  get backward(): boolean {
    return this.isKeyPressed("s");
  }

  get left(): boolean {
    return this.isKeyPressed("a");
  }

  get right(): boolean {
    return this.isKeyPressed("d");
  }

  get run(): boolean {
    return this.isKeyPressed("shift");
  }

  get jump(): boolean {
    return this.isKeyPressed(" ");
  }

  get anyDirection(): boolean {
    return this.isMovementKeyPressed();
  }

  get conflictingDirection(): boolean {
    return (
      (this.isKeyPressed("w") && this.isKeyPressed("s")) ||
      (this.isKeyPressed("a") && this.isKeyPressed("d"))
    );
  }

  public dispose() {
    document.removeEventListener("keydown", this.onKeyDown.bind(this));
    document.removeEventListener("keyup", this.onKeyDown.bind(this));
    window.removeEventListener("blur", this.handleUnfocus.bind(this));
  }
}
