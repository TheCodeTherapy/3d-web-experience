import { DOMAttributes } from "react";

type CustomElement<T> = Partial<T & DOMAttributes<T> & { children: any }>;

declare global {
  namespace JSX {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface IntrinsicElements {
      ["m-group"]: CustomElement<any>;
      ["m-cube"]: CustomElement<any>;
      ["m-sphere"]: CustomElement<any>;
      ["m-cylinder"]: CustomElement<any>;
      ["m-light"]: CustomElement<any>;
      ["m-plane"]: CustomElement<any>;
      ["m-model"]: CustomElement<any>;
      ["m-character"]: CustomElement<any>;
      ["m-frame"]: CustomElement<any>;
      ["m-audio"]: CustomElement<any>;
      ["m-image"]: CustomElement<any>;
      ["m-video"]: CustomElement<any>;
      ["m-label"]: CustomElement<any>;
      ["m-prompt"]: CustomElement<any>;
      ["m-interaction"]: CustomElement<any>;
      ["m-chat-probe"]: CustomElement<any>;
      ["m-position-probe"]: CustomElement<any>;
    }
  }
}
