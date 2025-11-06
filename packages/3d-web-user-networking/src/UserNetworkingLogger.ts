export type UserNetworkingServerLogFunction = (...args: Array<any>) => void;

export type UserNetworkingLogger = {
  trace: UserNetworkingServerLogFunction;
  debug: UserNetworkingServerLogFunction;
  info: UserNetworkingServerLogFunction;
  warn: UserNetworkingServerLogFunction;
  error: UserNetworkingServerLogFunction;
};

export class UserNetworkingConsoleLogger implements UserNetworkingLogger {
  trace(...args: Array<any>) {
    console.trace(...args);
  }

  debug(...args: Array<any>) {
    console.debug(...args);
  }

  info(...args: Array<any>) {
    console.info(...args);
  }

  warn(...args: Array<any>) {
    console.warn(...args);
  }

  error(...args: Array<any>) {
    console.error(...args);
  }
}
