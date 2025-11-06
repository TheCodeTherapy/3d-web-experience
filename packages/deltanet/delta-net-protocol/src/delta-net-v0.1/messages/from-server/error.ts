import { BufferReader } from "../../../BufferReader";
import { BufferWriter } from "../../../BufferWriter";
import { ErrorMessageType } from "../../messageTypes";

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace DeltaNetV01ServerErrors {
  export const USER_ALREADY_AUTHENTICATED_ERROR_TYPE = "USER_ALREADY_AUTHENTICATED";
  export const USER_NOT_AUTHENTICATED_ERROR_TYPE = "USER_NOT_AUTHENTICATED";
  export const AUTHENTICATION_IN_PROGRESS_ERROR_TYPE = "AUTHENTICATION_IN_PROGRESS";
  export const OBSERVER_CANNOT_SEND_STATE_UPDATES_ERROR_TYPE = "OBSERVER_CANNOT_SEND_STATE_UPDATES";
  export const UNSUPPORTED_WEBSOCKET_SUBPROTOCOL_ERROR_TYPE = "UNSUPPORTED_WEBSOCKET_SUBPROTOCOL";
  export const USER_NETWORKING_UNKNOWN_ERROR_TYPE = "USER_NETWORKING_UNKNOWN_ERROR";
  export const USER_AUTHENTICATION_FAILED_ERROR_TYPE = "USER_AUTHENTICATION_FAILED";
  export const USER_NETWORKING_CONNECTION_LIMIT_REACHED_ERROR_TYPE = "CONNECTION_LIMIT_REACHED";
  export const USER_NETWORKING_SERVER_SHUTDOWN_ERROR_TYPE = "SERVER_SHUTDOWN";
}

export type DeltaNetV01ServerErrorType =
  | typeof DeltaNetV01ServerErrors.USER_ALREADY_AUTHENTICATED_ERROR_TYPE
  | typeof DeltaNetV01ServerErrors.USER_NOT_AUTHENTICATED_ERROR_TYPE
  | typeof DeltaNetV01ServerErrors.AUTHENTICATION_IN_PROGRESS_ERROR_TYPE
  | typeof DeltaNetV01ServerErrors.OBSERVER_CANNOT_SEND_STATE_UPDATES_ERROR_TYPE
  | typeof DeltaNetV01ServerErrors.UNSUPPORTED_WEBSOCKET_SUBPROTOCOL_ERROR_TYPE
  | typeof DeltaNetV01ServerErrors.USER_NETWORKING_UNKNOWN_ERROR_TYPE
  | typeof DeltaNetV01ServerErrors.USER_AUTHENTICATION_FAILED_ERROR_TYPE
  | typeof DeltaNetV01ServerErrors.USER_NETWORKING_CONNECTION_LIMIT_REACHED_ERROR_TYPE
  | typeof DeltaNetV01ServerErrors.USER_NETWORKING_SERVER_SHUTDOWN_ERROR_TYPE;

export type DeltaNetV01ErrorMessage = {
  type: "error";
  errorType: DeltaNetV01ServerErrorType | string;
  message: string;
  retryable: boolean; // Whether the client should retry the operation - if false the client should not attempt to reconnect/retry
};

export function encodeError(
  msg: DeltaNetV01ErrorMessage,
  writer: BufferWriter = new BufferWriter(64),
): BufferWriter {
  writer.writeUint8(ErrorMessageType);
  writer.writeLengthPrefixedString(msg.errorType);
  writer.writeLengthPrefixedString(msg.message);
  writer.writeBoolean(msg.retryable);
  return writer;
}

// Assumes that the first byte has already been read (the message type)
export function decodeError(buffer: BufferReader): DeltaNetV01ErrorMessage {
  const errorType = buffer.readUVarintPrefixedString() as DeltaNetV01ServerErrorType;
  const message = buffer.readUVarintPrefixedString();
  const retryable = buffer.readBoolean();
  return {
    type: "error",
    errorType,
    message,
    retryable,
  };
}
