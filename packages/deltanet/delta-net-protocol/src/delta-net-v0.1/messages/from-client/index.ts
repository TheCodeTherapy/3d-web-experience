import { DeltaNetV01ClientCustomMessage } from "./clientCustom";
import { DeltaNetV01ConnectUserMessage } from "./connectUser";
import { DeltaNetV01PongMessage } from "./pong";
import { DeltaNetV01SetUserComponentsMessage } from "./setUserComponents";

export * from "./connectUser";
export * from "./pong";
export * from "./setUserComponents";
export * from "./clientCustom";

export type DeltaNetV01ClientMessage =
  | DeltaNetV01ConnectUserMessage
  | DeltaNetV01SetUserComponentsMessage
  | DeltaNetV01PongMessage
  | DeltaNetV01ClientCustomMessage;
