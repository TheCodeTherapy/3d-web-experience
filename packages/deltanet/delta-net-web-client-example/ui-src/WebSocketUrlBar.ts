import styles from "./WebSocketUrlBar.module.css";

export interface WebSocketUrlBarCallbacks {
  onConnect: (url: string, observerMode: boolean) => void;
  onDisconnect: () => void;
}

export class WebSocketUrlBar {
  private container: HTMLDivElement;
  private urlInput: HTMLInputElement;
  private connectButton: HTMLButtonElement;
  private observerCheckbox: HTMLInputElement;
  private observerLabel: HTMLLabelElement;

  private isConnected = false;
  private isConnecting = false;
  private callbacks: WebSocketUrlBarCallbacks;

  constructor(callbacks: WebSocketUrlBarCallbacks) {
    this.callbacks = callbacks;
    this.container = this.createContainer();
    this.urlInput = this.createUrlInput();
    this.connectButton = this.createConnectButton();
    const observerContainer = this.createObserverControls();

    this.container.appendChild(this.createLabel());
    this.container.appendChild(this.urlInput);
    this.container.appendChild(this.connectButton);
    this.container.appendChild(observerContainer);
  }

  private createContainer(): HTMLDivElement {
    const container = document.createElement("div");
    container.className = styles.container;
    return container;
  }

  private createLabel(): HTMLLabelElement {
    const label = document.createElement("label");
    label.textContent = "WebSocket URL:";
    label.className = styles.label;
    return label;
  }

  private createUrlInput(): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "ws://localhost:7971/delta-net-websocket";
    input.className = styles.urlInput;

    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !this.isConnecting && !this.isConnected) {
        this.handleConnect();
      }
    });

    return input;
  }

  private createConnectButton(): HTMLButtonElement {
    const button = document.createElement("button");
    button.textContent = "Connect";
    button.className = `${styles.connectButton} ${styles.connect}`;

    button.addEventListener("click", () => {
      if (this.isConnected) {
        this.handleDisconnect();
      } else if (!this.isConnecting) {
        this.handleConnect();
      }
    });

    return button;
  }

  private createObserverControls(): HTMLDivElement {
    const container = document.createElement("div");
    container.className = styles.observerContainer;

    this.observerCheckbox = document.createElement("input");
    this.observerCheckbox.type = "checkbox";
    this.observerCheckbox.id = "observer-mode";
    this.observerCheckbox.className = styles.observerCheckbox;

    this.observerLabel = document.createElement("label");
    this.observerLabel.textContent = "Observer Mode";
    this.observerLabel.setAttribute("for", "observer-mode");
    this.observerLabel.className = styles.observerLabel;

    container.appendChild(this.observerCheckbox);
    container.appendChild(this.observerLabel);

    return container;
  }

  private handleConnect(): void {
    const url = this.urlInput.value.trim();
    if (url) {
      this.setConnectingState();
      this.callbacks.onConnect(url, this.observerCheckbox.checked);
    }
  }

  private handleDisconnect(): void {
    this.callbacks.onDisconnect();
    this.updateButtonState(false);
  }

  public setConnectingState(): void {
    this.isConnecting = true;
    this.isConnected = false;
    this.connectButton.textContent = "Connecting...";
    this.connectButton.className = `${styles.connectButton} ${styles.connecting}`;
    this.urlInput.disabled = true;
    this.updateObserverModeState();
  }

  public updateButtonState(connected: boolean): void {
    this.isConnected = connected;
    this.isConnecting = false;

    if (connected) {
      this.connectButton.textContent = "Disconnect";
      this.connectButton.className = `${styles.connectButton} ${styles.disconnect}`;
      this.urlInput.disabled = true;
    } else {
      this.connectButton.textContent = "Connect";
      this.connectButton.className = `${styles.connectButton} ${styles.connect}`;
      this.urlInput.disabled = false;
    }

    this.updateObserverModeState();
  }

  private updateObserverModeState(): void {
    const shouldDisable = this.isConnected || this.isConnecting;
    this.observerCheckbox.disabled = shouldDisable;

    if (shouldDisable) {
      this.observerCheckbox.title = "Cannot change observer mode while connected";
      this.observerLabel.title = "Cannot change observer mode while connected";
      this.observerLabel.style.opacity = "0.6";
      this.observerLabel.style.cursor = "not-allowed";
    } else {
      this.observerCheckbox.title = "";
      this.observerLabel.title = "";
      this.observerLabel.style.opacity = "1";
      this.observerLabel.style.cursor = "pointer";
    }
  }

  public getContainer(): HTMLElement {
    return this.container;
  }

  public setUrl(url: string): void {
    this.urlInput.value = url;
  }

  public setObserverMode(isObserver: boolean): void {
    this.observerCheckbox.checked = isObserver;
  }

  public getObserverMode(): boolean {
    return this.observerCheckbox.checked;
  }
}
