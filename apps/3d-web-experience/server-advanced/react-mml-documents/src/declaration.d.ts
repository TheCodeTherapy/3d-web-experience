declare module "react" {
  export namespace JSX {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface IntrinsicElements extends globalThis.JSX.IntrinsicElements {}
  }
}

export {};
