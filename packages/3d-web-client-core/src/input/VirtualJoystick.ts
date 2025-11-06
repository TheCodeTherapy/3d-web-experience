interface VirtualJoyStickConfig {
  radius?: number;
  innerRadius?: number;
  mouseSupport?: boolean;
}

const sprintingThreshold = 0.6;

export class VirtualJoystick {
  private radius: number;
  private innerRadius: number;
  private mouseSupport: boolean;

  private element: HTMLDivElement;

  private joystickBaseElement: HTMLSpanElement;
  private joystickCenterElement: HTMLSpanElement;
  private joystickPointerId: number | null = null;
  private joystickOutput: { direction: number; isSprinting: boolean } | null = null;

  private jumpButton: HTMLButtonElement;
  private jumpPointerId: number | null = null;

  constructor(
    private holderElement: HTMLElement,
    private config: VirtualJoyStickConfig,
  ) {
    this.radius = config.radius || 50;
    this.innerRadius = config.innerRadius || this.radius / 2;
    this.mouseSupport = this.checkTouch() || config.mouseSupport === true;

    this.element = document.createElement("div");
    const style = this.element.style;
    style.display = this.mouseSupport ? "flex" : "none";
    style.position = "absolute";
    style.width = `100%`;
    style.height = `200px`;
    style.bottom = "50px";
    style.zIndex = "10000";
    style.alignItems = "center";
    style.justifyContent = "space-between";
    style.pointerEvents = "none";
    style.padding = "20px";
    style.boxSizing = "border-box";
    style.userSelect = "none";
    this.holderElement.appendChild(this.element);

    this.joystickBaseElement = this.createBase();
    this.element.appendChild(this.joystickBaseElement);

    this.joystickCenterElement = this.createCenter();
    this.joystickBaseElement.appendChild(this.joystickCenterElement);

    this.jumpButton = this.createJumpButton();
    this.element.appendChild(this.jumpButton);

    this.bindEvents();

    this.clearJoystickState();
  }

  public static checkForTouch(): boolean {
    try {
      document.createEvent("TouchEvent");
      return true;
    } catch (e) {
      return false;
    }
  }

  private checkTouch() {
    return VirtualJoystick.checkForTouch();
  }

  private createBase() {
    const base = document.createElement("span");
    const style = base.style;
    style.touchAction = "pinch-zoom";
    style.width = `${this.radius * 2}px`;
    style.height = `${this.radius * 2}px`;
    style.position = "relative";
    style.display = "block";
    style.borderRadius = "50%";
    style.borderColor = "rgba(200,200,200,0.5)";
    style.borderWidth = "2px";
    style.borderStyle = "solid";
    style.pointerEvents = "auto";
    style.userSelect = "none";
    return base;
  }

  private createCenter() {
    const center = document.createElement("div");
    const style = center.style;
    style.width = `${this.innerRadius * 2}px`;
    style.height = `${this.innerRadius * 2}px`;
    style.position = "absolute";
    style.borderRadius = "50%";
    style.backgroundColor = "rgba(200,200,200,0.3)";
    style.borderWidth = "1px";
    style.borderColor = "rgba(200,200,200,0.8)";
    style.borderStyle = "solid";
    style.userSelect = "none";
    return center;
  }

  private createJumpButton() {
    const button = document.createElement("button");
    button.textContent = "JUMP";
    const style = button.style;
    style.touchAction = "pinch-zoom";
    style.width = `100px`;
    style.height = `100px`;
    style.borderRadius = "20px";
    style.color = "white";
    style.font = "Helvetica, sans-serif";
    style.fontSize = "16px";
    style.backgroundColor = "rgba(200,200,200,0.3)";
    style.color = "rgba(220,220,220,1)";
    style.borderWidth = "1px";
    style.borderColor = "rgba(200,200,200,0.8)";
    style.borderStyle = "solid";
    style.pointerEvents = "auto";
    style.userSelect = "none";
    return button;
  }

  private bindEvents(): void {
    this.joystickBaseElement.addEventListener("pointerdown", this.onJoystickPointerDown.bind(this));
    this.joystickBaseElement.addEventListener(
      "contextmenu",
      this.preventDefaultAndStopPropagation.bind(this),
    );
    this.joystickBaseElement.addEventListener(
      "touchstart",
      this.preventDefaultAndStopPropagation.bind(this),
    );

    this.jumpButton.addEventListener("pointerdown", this.onJumpPointerDown.bind(this));
    this.jumpButton.addEventListener(
      "contextmenu",
      this.preventDefaultAndStopPropagation.bind(this),
    );
    this.jumpButton.addEventListener(
      "touchstart",
      this.preventDefaultAndStopPropagation.bind(this),
    );
    document.addEventListener("pointermove", this.onPointerMove.bind(this));
    document.addEventListener("pointerup", this.onPointerUp.bind(this));
    document.addEventListener("pointercancel", this.onPointerUp.bind(this));
  }

  private preventDefaultAndStopPropagation(evt: PointerEvent): void {
    evt.preventDefault();
    evt.stopPropagation();
  }

  private onJumpPointerDown(evt: PointerEvent): void {
    if (this.jumpPointerId === null) {
      this.jumpPointerId = evt.pointerId;
    }
  }

  private onJoystickPointerDown(evt: PointerEvent): void {
    evt.preventDefault();
    evt.stopPropagation();
    if (evt.buttons !== 1) {
      return;
    }
    if (this.joystickPointerId === null) {
      this.joystickPointerId = evt.pointerId;
      this.updateControlAndDirection(evt);
    }
  }

  private onPointerMove(evt: PointerEvent): void {
    evt.preventDefault();
    evt.stopPropagation();
    if (evt.pointerId !== this.joystickPointerId) {
      return;
    }
    this.updateControlAndDirection(evt);
  }

  private onPointerUp(evt: PointerEvent): void {
    evt.preventDefault();
    evt.stopPropagation();

    if (evt.pointerId === this.jumpPointerId) {
      this.jumpPointerId = null;
    }
    if (evt.pointerId === this.joystickPointerId) {
      this.joystickPointerId = null;
      this.clearJoystickState();
    }
  }

  private clearJoystickState = (): void => {
    this.joystickOutput = null;
    this.joystickCenterElement.style.left = `${this.radius - this.innerRadius}px`;
    this.joystickCenterElement.style.top = `${this.radius - this.innerRadius}px`;
  };

  private updateControlAndDirection(input: PointerEvent): void {
    const rect = this.joystickBaseElement.getBoundingClientRect();
    const dx = input.clientX - (rect.left + this.radius);
    const dy = input.clientY - (rect.top + this.radius);

    const distance = Math.min(Math.sqrt(dx * dx + dy * dy), this.radius);
    const angle = Math.atan2(dy, dx);
    const constrainedX = distance * Math.cos(angle);
    const constrainedY = distance * Math.sin(angle);

    this.joystickCenterElement.style.left = `${constrainedX + this.radius - this.innerRadius}px`;
    this.joystickCenterElement.style.top = `${constrainedY + this.radius - this.innerRadius}px`;

    const direction = Math.atan2(dx, dy);
    const speed = distance / this.radius;
    const isSprinting = speed > sprintingThreshold;
    this.joystickOutput = { direction, isSprinting };
  }

  public getOutput(): {
    direction: number | null;
    isSprinting: boolean;
    jump: boolean;
    slide: boolean;
  } | null {
    const jump = this.jumpPointerId !== null;
    if (!this.joystickOutput) {
      if (jump) {
        return { direction: null, isSprinting: false, jump: jump, slide: false };
      }
      return null;
    }
    return {
      ...this.joystickOutput,
      jump: jump,
      slide: false,
    };
  }
}
