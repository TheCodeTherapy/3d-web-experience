import "./index.css";

import { deltaNetProtocolSubProtocol_v0_1 } from "@mml-io/delta-net-protocol";
import {
  DeltaNetClientState,
  DeltaNetClientWebsocket,
  DeltaNetClientWebsocketInitialCheckout,
  DeltaNetClientWebsocketStatusToString,
  DeltaNetClientWebsocketTick,
  DeltaNetClientWebsocketUserIndex,
} from "@mml-io/delta-net-web";

import { DebugRenderer } from "./debug-renderer/DebugRenderer";
import { WebSocketUrlBar } from "./WebSocketUrlBar";

function randomColor() {
  const color = Math.floor(Math.random() * 16777215);
  const colorBytes = new Uint8Array(3);
  colorBytes[0] = (color >> 16) & 0xff;
  colorBytes[1] = (color >> 8) & 0xff;
  colorBytes[2] = color & 0xff;
  return colorBytes;
}

// Function to get URL parameter
function getUrlParameter(name: string): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

// Function to set URL parameter
function setUrlParameter(name: string, value: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(name, value);
  window.history.replaceState({}, "", url.toString());
}

// Function to get default websocket URL
function getDefaultWebsocketUrl(): string {
  const secure = window.location.protocol === "https:";
  return (secure ? "wss://" : "ws://") + window.location.host + "/delta-net-websocket";
}

const xComponentId = 1;
const yComponentId = 3;
const colorStateId = 10;

window.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("root") as HTMLElement;
  const networkState = new DeltaNetClientState();

  // Get websocket URL from URL parameters or use default
  const savedWebsocketUrl = getUrlParameter("wsUrl");
  const defaultWebsocketUrl = getDefaultWebsocketUrl();
  let currentWebsocketUrl = savedWebsocketUrl || defaultWebsocketUrl;

  // Get observer mode from URL parameters
  const savedObserverMode = getUrlParameter("observer") === "true";
  let isObserverMode = savedObserverMode;

  // Get connection state from URL parameters
  const savedConnected = getUrlParameter("connected") === "true";

  console.log("websocketUrl", currentWebsocketUrl);
  console.log("observerMode", isObserverMode);
  console.log("shouldAutoConnect", savedConnected);

  let deltaNetClientWebsocket: DeltaNetClientWebsocket | null = null;
  let debugRenderer: DebugRenderer;

  // Create websocket URL bar
  const urlBar = new WebSocketUrlBar({
    onConnect: (newUrl: string, observerMode: boolean) => {
      console.log("Connecting to websocket URL:", newUrl, "Observer mode:", observerMode);
      currentWebsocketUrl = newUrl;
      isObserverMode = observerMode;
      setUrlParameter("wsUrl", newUrl);
      setUrlParameter("observer", observerMode.toString());
      setUrlParameter("connected", "true");
      createWebsocketConnection();
    },
    onDisconnect: () => {
      console.log("Disconnecting from websocket");
      setUrlParameter("connected", "false");
      if (deltaNetClientWebsocket) {
        deltaNetClientWebsocket.stop();
        deltaNetClientWebsocket = null;
        networkState.reset();
        debugRenderer.update(networkState, null);
      }
    },
  });

  // Set initial values
  urlBar.setUrl(currentWebsocketUrl);
  urlBar.setObserverMode(isObserverMode);

  // Add URL bar to the root element
  root.appendChild(urlBar.getContainer());

  // Create a container for the debug renderer
  const debugContainer = document.createElement("div");
  debugContainer.style.flex = "1";
  debugContainer.style.minHeight = "0";
  root.appendChild(debugContainer);

  // Create debug renderer in its own container
  debugRenderer = new DebugRenderer(debugContainer, {
    halfWidth: 2048,
    xComponentId: xComponentId,
    yComponentId: yComponentId,
    colorStateId: colorStateId,
  });

  function createWebsocketConnection() {
    // Reset the network state when reconnecting to avoid duplicate user IDs
    networkState.reset();

    deltaNetClientWebsocket = new DeltaNetClientWebsocket(
      currentWebsocketUrl,
      (url: string) => {
        return new WebSocket(url, deltaNetProtocolSubProtocol_v0_1);
      },
      isObserverMode ? "observer-token" : "example-token",
      {
        observer: isObserverMode, // Add observer mode option
        onInitialCheckout: (initialCheckout: DeltaNetClientWebsocketInitialCheckout) => {
          const stateUpdates = networkState.handleInitialCheckout(initialCheckout);
          console.log("stateUpdates.initialCheckout", stateUpdates);
          debugRenderer.update(networkState, deltaNetClientWebsocket!);
        },
        onTick: (tick: DeltaNetClientWebsocketTick) => {
          const { stateUpdates } = networkState.handleTick(tick);
          if (stateUpdates.length > 0) {
            console.log("stateUpdates.tick", stateUpdates);
          }
          debugRenderer.update(networkState, deltaNetClientWebsocket!);
        },
        onUserIndex: (userIndex: DeltaNetClientWebsocketUserIndex) => {
          console.log("userIndex", userIndex);
          if (!isObserverMode) {
            networkState.setLocalIndex(userIndex.userIndex);
          }
        },
        onError: (error: string, retryable: boolean) => {
          console.error("error", error, "retryable", retryable);
          // Button state handled by status callback
        },
        onWarning: (warning: string) => {
          console.warn("warning", warning);
        },
      },
      () => {
        // On disconnect - button state handled by status callback
      },
      (status) => {
        console.log("status", DeltaNetClientWebsocketStatusToString(status));
        debugRenderer.update(networkState, deltaNetClientWebsocket!);

        // Update button state based on connection status
        const statusString = DeltaNetClientWebsocketStatusToString(status);
        if (statusString === "Connected") {
          urlBar.updateButtonState(true);
        } else if (
          statusString === "Disconnected" ||
          statusString === "Error" ||
          statusString === "Failed"
        ) {
          urlBar.updateButtonState(false);
          setUrlParameter("connected", "false");
        }
        // Keep connecting state for "Connecting" or other intermediate states
      },
    );
  }

  // Auto-connect if previously connected
  if (savedConnected) {
    urlBar.setConnectingState();
    createWebsocketConnection();
    // Button state will be updated by the status callback when actually connected
  }

  // Use time-based circular motion of two circles
  const radius = Math.random() * 1024;
  const center = 0;
  let angle = Math.random() * 2 * Math.PI;
  const rate = 0.01 * Math.random() + 0.01;

  const radius2 = Math.random() * 1024;
  const center2 = 0;
  let angle2 = Math.random() * 2 * Math.PI;
  const rate2 = 0.01 * Math.random() + 0.01;

  let color = randomColor();

  setInterval(() => {
    // Skip sending user components in observer mode
    if (isObserverMode || !deltaNetClientWebsocket) {
      return;
    }

    const x1 = center + radius * Math.cos(angle);
    const y1 = center + radius * Math.sin(angle);
    angle += rate;

    const x2 = center2 + radius2 * Math.cos(angle2);
    const y2 = center2 + radius2 * Math.sin(angle2);
    angle2 -= rate2;

    // Calculate x and y positions based on angle (circular motion)
    const x = BigInt(Math.round(x1 + x2));
    const y = BigInt(Math.round(y1 + y2));

    if (Math.random() > 0.99) {
      // Change color randomly
      color = randomColor();
    }

    deltaNetClientWebsocket.setUserComponents(
      new Map([
        [xComponentId, x],
        [yComponentId, y],
      ]),
      new Map([[colorStateId, color]]),
    );
  }, 50);

  console.log("deltaNetClientWebsocket", deltaNetClientWebsocket);
});
