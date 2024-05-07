interface JoyStickAttributes {
  radius?: number;
  inner_radius?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  mouse_support?: boolean;
  visible?: boolean;
  anchor?: "left" | "right";
}

export class VirtualJoystick {
  private radius: number;
  private inner_radius: number;
  private anchor: "left" | "right";
  private x: number;
  private y: number;
  private width: number;
  private height: number;
  private mouse_support: boolean;

  private div: HTMLDivElement;
  private base: HTMLSpanElement;
  private control: HTMLSpanElement;

  public left: boolean = false;
  public right: boolean = false;
  public up: boolean = false;
  public down: boolean = false;
  public hasDirection: boolean = false;

  constructor(
    private holderElement: HTMLElement,
    attrs: JoyStickAttributes,
  ) {
    this.radius = attrs.radius || 50;
    this.inner_radius = attrs.inner_radius || this.radius / 2;
    this.anchor = attrs.anchor || "left";
    this.x = attrs.x || 0;
    this.y = attrs.y || 0;
    this.width = attrs.width || this.radius * 2 + this.inner_radius * 2;
    this.height = attrs.height || this.radius * 2 + this.inner_radius * 2;
    this.mouse_support = this.checkTouch() || attrs.mouse_support === true;

    this.div = document.createElement("div");
    const divStyle = this.div.style;
    divStyle.display = this.checkTouch() || this.mouse_support ? "visible" : "none";
    divStyle.position = "fixed";
    if (this.anchor === "left") {
      divStyle.left = `${this.x}px`;
    } else {
      divStyle.right = `${this.x}px`;
    }
    divStyle.bottom = `${this.y}px`;
    divStyle.width = `${this.width}px`;
    divStyle.height = `${this.height}px`;
    divStyle.zIndex = "10000";
    divStyle.overflow = "hidden";
    this.holderElement.appendChild(this.div);

    this.setupBaseAndControl();
    this.bindEvents();
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

  private setupBaseAndControl(): void {
    this.base = document.createElement("span");
    let divStyle = this.base.style;
    divStyle.width = `${this.radius * 2}px`;
    divStyle.height = `${this.radius * 2}px`;
    divStyle.position = "absolute";
    divStyle.left = `${this.width / 2 - this.radius}px`;
    divStyle.bottom = `${this.height / 2 - this.radius}px`;
    divStyle.borderRadius = "50%";
    divStyle.borderColor = "rgba(200,200,200,0.5)";
    divStyle.borderWidth = "2px";
    divStyle.borderStyle = "solid";
    this.div.appendChild(this.base);

    this.control = document.createElement("span");
    divStyle = this.control.style;
    divStyle.width = `${this.inner_radius * 2}px`;
    divStyle.height = `${this.inner_radius * 2}px`;
    divStyle.position = "absolute";
    divStyle.left = `${this.width / 2 - this.inner_radius}px`;
    divStyle.bottom = `${this.height / 2 - this.inner_radius}px`;
    divStyle.borderRadius = "50%";
    divStyle.backgroundColor = "rgba(200,200,200,0.3)";
    divStyle.borderWidth = "1px";
    divStyle.borderColor = "rgba(200,200,200,0.8)";
    divStyle.borderStyle = "solid";
    this.div.appendChild(this.control);
  }

  private bindEvents(): void {
    this.div.addEventListener("touchstart", this.handleTouchStart.bind(this), false);
    this.div.addEventListener("touchmove", this.handleTouchMove.bind(this), false);
    this.div.addEventListener("touchend", this.clearFlags.bind(this), false);

    if (this.mouse_support) {
      this.div.addEventListener("mousedown", this.handleMouseDown.bind(this));
      this.div.addEventListener("mousemove", this.handleMouseMove.bind(this));
      this.div.addEventListener("mouseup", this.handleMouseUp.bind(this));
    }
  }

  private handleTouchStart(evt: TouchEvent): void {
    evt.preventDefault();
    evt.stopPropagation();
    if (evt.touches) {
      const touch = evt.touches[0];
      this.updateControlAndDirection(touch);
    }
  }

  private handleTouchMove(evt: TouchEvent): void {
    evt.preventDefault();
    evt.stopPropagation();
    if (evt.touches.length > 0) {
      const touch = evt.touches[0];
      this.updateControlAndDirection(touch);
    }
  }

  private handleMouseDown(evt: MouseEvent): void {
    evt.preventDefault();
    evt.stopPropagation();
    this.updateControlAndDirection(evt);
  }

  private handleMouseMove(evt: MouseEvent): void {
    if (evt.buttons === 1) {
      evt.preventDefault();
      evt.stopPropagation();
      this.updateControlAndDirection(evt);
    }
  }

  private handleMouseUp(evt: MouseEvent): void {
    this.clearFlags();
  }

  private clearFlags = (): void => {
    this.left = false;
    this.right = false;
    this.up = false;
    this.down = false;
    this.hasDirection = false;
    this.control.style.left = `${this.width / 2 - this.inner_radius}px`;
    this.control.style.top = `${this.height / 2 - this.inner_radius}px`;
  };

  private updateControlAndDirection(input: Touch | MouseEvent): void {
    const rect = this.div.getBoundingClientRect();
    const dx = input.clientX - (rect.left + this.div.offsetWidth / 2);
    const dy = input.clientY - (rect.top + this.div.offsetHeight / 2);

    const distance = Math.min(Math.sqrt(dx * dx + dy * dy), this.radius);
    const angle = Math.atan2(dy, dx);
    const constrainedX = distance * Math.cos(angle);
    const constrainedY = distance * Math.sin(angle);

    this.control.style.left = `${constrainedX + this.width / 2 - this.inner_radius}px`;
    this.control.style.top = `${constrainedY + this.height / 2 - this.inner_radius}px`;

    this.up = this.isUp(dx, dy);
    this.down = this.isDown(dx, dy);
    this.left = this.isLeft(dx, dy);
    this.right = this.isRight(dx, dy);
    this.hasDirection = this.up || this.down || this.left || this.right;
  }

  private isUp(dx: number, dy: number): boolean {
    return dy < 0 && Math.abs(dx) <= 2 * Math.abs(dy);
  }

  private isDown(dx: number, dy: number): boolean {
    return dy > 0 && Math.abs(dx) <= 2 * Math.abs(dy);
  }

  private isLeft(dx: number, dy: number): boolean {
    return dx < 0 && Math.abs(dy) <= 2 * Math.abs(dx);
  }

  private isRight(dx: number, dy: number): boolean {
    return dx > 0 && Math.abs(dy) <= 2 * Math.abs(dx);
  }
}
