import {
  DeltaNetV01ServerErrors,
  BufferReader,
  decodeClientMessages,
  DeltaNetV01ClientMessage,
  DeltaNetV01ServerErrorType,
  DeltaNetV01ServerMessage,
  encodeServerMessage,
} from "@mml-io/delta-net-protocol";

import { DeltaNetServer, DeltaNetServerError } from "./DeltaNetServer";

export class DeltaNetV01Connection {
  private websocketListener: (messageEvent: MessageEvent) => void;

  public readonly internalConnectionId: number;
  public isObserver: boolean = false; // Track observer mode

  // Pending state for new joiners (before they're authenticated)
  public components = new Map<number, bigint>();
  public states = new Map<number, Uint8Array>();

  // Track pending async state validations per state
  private pendingStateValidations = new Map<
    number,
    { validationId: number; abortController: AbortController }
  >();
  private nextValidationId = 1;

  // Track authentication state
  private isAuthenticated = false;
  private isAuthenticating = false;
  private authenticationAbortController: AbortController | null = null;

  public constructor(
    public readonly webSocket: WebSocket,
    public readonly deltaNetServer: DeltaNetServer,
  ) {
    // Get connection ID immediately upon creation
    this.internalConnectionId = deltaNetServer.getNextConnectionId();

    this.websocketListener = (messageEvent: MessageEvent) => {
      const buffer = new Uint8Array(messageEvent.data as ArrayBuffer);

      // Check message size before attempting to decode
      const maxMessageSize = this.deltaNetServer.getMaxMessageSize();
      if (buffer.length > maxMessageSize) {
        this.disconnectWithError(
          new Error(
            `Message size ${buffer.length} bytes exceeds maximum allowed size of ${maxMessageSize} bytes`,
          ),
          DeltaNetV01ServerErrors.USER_NETWORKING_UNKNOWN_ERROR_TYPE,
          false,
        );
        return;
      }

      try {
        const messages = decodeClientMessages(new BufferReader(buffer));
        for (const parsed of messages) {
          this.handleClientMessage(parsed);
        }
      } catch (error) {
        this.disconnectWithError(
          new Error(
            `Failed to decode client messages: ${error instanceof Error ? error.message : error}`,
          ),
          DeltaNetV01ServerErrors.USER_NETWORKING_UNKNOWN_ERROR_TYPE,
          false,
        );
        return;
      }
    };
    webSocket.addEventListener("message", this.websocketListener);
    this.deltaNetServer = deltaNetServer;
  }

  public sendMessage(message: DeltaNetV01ServerMessage) {
    this.sendEncodedBytes(encodeServerMessage(message).getBuffer());
  }

  public sendEncodedBytes(bytes: Uint8Array) {
    this.webSocket.send(bytes);
  }

  public dispose() {
    this.webSocket.removeEventListener("message", this.websocketListener);
    // Cancel all pending validations
    for (const [, validation] of this.pendingStateValidations) {
      validation.abortController.abort();
    }
    this.pendingStateValidations.clear();

    // Cancel pending authentication
    if (this.authenticationAbortController) {
      this.authenticationAbortController.abort();
      this.authenticationAbortController = null;
    }
  }

  public setAuthenticated() {
    this.isAuthenticated = true;
  }

  private disconnectWithError(
    error: Error,
    errorType: DeltaNetV01ServerErrorType,
    retryable: boolean = true,
  ): void {
    try {
      this.sendMessage({
        type: "error",
        errorType,
        message: error.message,
        retryable,
      });
    } catch (sendError) {
      console.warn("Failed to send error message to client:", sendError);
    }

    try {
      this.webSocket.close(1008, error.message);
    } catch (closeError) {
      console.warn("Failed to close websocket connection:", closeError);
    }
  }

  private async handleConnectUser(
    token: string,
    observer: boolean,
    components: Array<[number, bigint]>,
    states: Array<[number, Uint8Array]>,
  ): Promise<void> {
    // Reject if already authenticated or currently authenticating
    if (this.isAuthenticated) {
      this.disconnectWithError(
        new Error("User is already authenticated"),
        DeltaNetV01ServerErrors.USER_ALREADY_AUTHENTICATED_ERROR_TYPE,
        false,
      );
      return;
    }

    if (this.isAuthenticating) {
      this.disconnectWithError(
        new Error("Authentication already in progress"),
        DeltaNetV01ServerErrors.AUTHENTICATION_IN_PROGRESS_ERROR_TYPE,
        false,
      );
      return;
    }

    this.isAuthenticating = true;
    this.authenticationAbortController = new AbortController();

    // Set observer mode
    this.isObserver = observer;

    // Store the pending data
    this.components = new Map(components);
    this.states = new Map(states);

    let result:
      | { success: boolean; error?: string; stateOverrides?: Array<[number, Uint8Array]> }
      | DeltaNetServerError
      | Error;
    try {
      const rawResult = this.deltaNetServer.validateJoiner(this, token, components, states);
      if (rawResult instanceof Promise) {
        result = await rawResult;

        // Check if authentication was canceled while we were waiting
        if (this.authenticationAbortController?.signal.aborted) {
          // Authentication was canceled (connection disposed), silently return
          return;
        }

        // Check if connection is still tracked by the server
        if (!this.deltaNetServer.hasWebSocket(this.webSocket)) {
          // Connection was removed while authentication was pending, silently return
          return;
        }
      } else {
        result = rawResult;
      }
    } catch (error) {
      // Check if authentication was canceled
      if (this.authenticationAbortController?.signal.aborted) {
        return;
      }
      result = error;
    }

    // Clear the abort controller since authentication is complete
    this.authenticationAbortController = null;

    if (result instanceof DeltaNetServerError) {
      this.disconnectWithError(result, result.errorType, result.retryable);
    } else if (result instanceof Error) {
      this.disconnectWithError(
        result,
        DeltaNetV01ServerErrors.USER_NETWORKING_UNKNOWN_ERROR_TYPE,
        false,
      );
    } else if (typeof result !== "object") {
      this.disconnectWithError(
        new Error("Invalid authentication result"),
        DeltaNetV01ServerErrors.USER_NETWORKING_UNKNOWN_ERROR_TYPE,
        false,
      );
    } else {
      if (result.success) {
        // Apply state overrides if provided
        if (result.stateOverrides) {
          for (const [stateId, stateValue] of result.stateOverrides) {
            this.states.set(stateId, stateValue);
          }
        }

        this.deltaNetServer.addAuthenticatedConnection(this);
      } else {
        this.disconnectWithError(
          new Error(result.error || "Authentication failed"),
          DeltaNetV01ServerErrors.USER_NETWORKING_UNKNOWN_ERROR_TYPE,
          false,
        );
      }
    }
    this.isAuthenticating = false;
  }

  public async handleStateUpdate(stateId: number, stateValue: Uint8Array): Promise<void> {
    if (!this.isAuthenticated) {
      console.error("State update received before authentication completed");
      return;
    }

    // Cancel any existing pending validation for this state
    const existingValidation = this.pendingStateValidations.get(stateId);
    if (existingValidation) {
      existingValidation.abortController.abort();
      this.pendingStateValidations.delete(stateId);
    }

    const result = this.deltaNetServer.validateAndApplyStateUpdate(
      this,
      this.internalConnectionId,
      stateId,
      stateValue,
    );

    if (result instanceof Promise) {
      const validationId = this.nextValidationId++;
      const abortController = new AbortController();

      this.pendingStateValidations.set(stateId, { validationId, abortController });

      try {
        const asyncResult = await result;

        // Check if this validation is still current
        const currentValidation = this.pendingStateValidations.get(stateId);
        if (!currentValidation || currentValidation.validationId !== validationId) {
          return; // Validation was superseded
        }

        this.pendingStateValidations.delete(stateId);

        if (asyncResult instanceof DeltaNetServerError) {
          this.disconnectWithError(asyncResult, asyncResult.errorType, asyncResult.retryable);
          return;
        }
        if (asyncResult instanceof Error) {
          this.disconnectWithError(
            asyncResult,
            DeltaNetV01ServerErrors.USER_NETWORKING_UNKNOWN_ERROR_TYPE,
            false,
          );
          return;
        }

        return;
      } catch (error) {
        // Check if validation is still current
        const currentValidation = this.pendingStateValidations.get(stateId);
        if (currentValidation && currentValidation.validationId === validationId) {
          this.pendingStateValidations.delete(stateId);

          if (error instanceof DeltaNetServerError) {
            this.disconnectWithError(error, error.errorType, error.retryable);
          } else if (error instanceof Error) {
            this.disconnectWithError(
              error,
              DeltaNetV01ServerErrors.USER_NETWORKING_UNKNOWN_ERROR_TYPE,
              false,
            );
          } else {
            this.disconnectWithError(
              new Error("State validation failed"),
              DeltaNetV01ServerErrors.USER_NETWORKING_UNKNOWN_ERROR_TYPE,
              false,
            );
          }
        }
        return;
      }
    } else {
      // Synchronous result
      if (result instanceof DeltaNetServerError) {
        this.disconnectWithError(result, result.errorType, result.retryable);
        return;
      }
      if (result instanceof Error) {
        this.disconnectWithError(
          result,
          DeltaNetV01ServerErrors.USER_NETWORKING_UNKNOWN_ERROR_TYPE,
          false,
        );
        return;
      }
      return;
    }
  }

  private handleClientMessage(parsed: DeltaNetV01ClientMessage) {
    switch (parsed.type) {
      case "connectUser": {
        if (this.deltaNetServer !== null) {
          // Handle async connection
          this.handleConnectUser(parsed.token, parsed.observer, parsed.components, parsed.states);
        }
        return;
      }
      case "pong":
        // Ignore pongs
        return;
      case "setUserComponents": {
        if (!this.deltaNetServer) {
          console.error("DeltaNetServer not set on connection that received event", this);
          return;
        }
        if (!this.isAuthenticated) {
          this.sendMessage({
            type: "error",
            errorType: "USER_NOT_AUTHENTICATED",
            message: `Event sent, but user has not been authenticated yet.`,
            retryable: false,
          });
          console.error("Event sent, but user has not been authenticated yet.");
          this.webSocket.close(1000, "User has not been authenticated yet");
          return;
        }

        // Handle component updates immediately
        const result = this.deltaNetServer.setUserComponents(
          this,
          this.internalConnectionId,
          parsed.components,
        );

        // Check if component update was rejected
        if (!result.success) {
          this.disconnectWithError(
            new Error(result.error),
            DeltaNetV01ServerErrors.USER_NETWORKING_UNKNOWN_ERROR_TYPE,
            true,
          );
          return;
        }

        // Handle state updates individually with async validation
        for (const [stateId, stateValue] of parsed.states) {
          this.handleStateUpdate(stateId, stateValue);
        }
        return;
      }
      case "clientCustom": {
        if (!this.deltaNetServer) {
          console.error("DeltaNetServer not set on connection that received custom message", this);
          return;
        }
        if (!this.isAuthenticated) {
          this.sendMessage({
            type: "error",
            errorType: "USER_NOT_AUTHENTICATED",
            message: `Custom message sent, but user has not been authenticated yet.`,
            retryable: false,
          });
          console.error("Custom message sent, but user has not been authenticated yet.");
          this.webSocket.close(1000, "User has not been authenticated yet");
          return;
        }

        // Handle custom message
        this.deltaNetServer.handleCustomMessage(
          this,
          this.internalConnectionId,
          parsed.customType,
          parsed.contents,
        );
        return;
      }
      default:
        console.error("Unknown message type from client", parsed);
    }
  }
}
