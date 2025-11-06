import { DeltaNetV01ErrorMessage } from "./error";
import { DeltaNetV01InitialCheckoutMessage } from "./initialCheckout";
import { DeltaNetV01PingMessage } from "./ping";
import { DeltaNetV01ServerCustomMessage } from "./serverCustom";
import { DeltaNetV01Tick } from "./tick";
import { DeltaNetV01UserIndexMessage } from "./userIndex";
import { DeltaNetV01WarningMessage } from "./warning";

export * from "./error";
export * from "./initialCheckout";
export * from "./ping";
export * from "./serverCustom";
export * from "./tick";
export * from "./userIndex";
export * from "./warning";

export type DeltaNetV01ServerMessage =
  | DeltaNetV01InitialCheckoutMessage
  | DeltaNetV01ServerCustomMessage
  | DeltaNetV01UserIndexMessage
  | DeltaNetV01Tick
  | DeltaNetV01PingMessage
  | DeltaNetV01ErrorMessage
  | DeltaNetV01WarningMessage;
