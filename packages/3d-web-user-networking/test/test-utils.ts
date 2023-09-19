export function waitUntil(checkFn: () => boolean, message?: string) {
  return new Promise((resolve, reject) => {
    if (checkFn()) {
      resolve(null);
      return;
    }

    let maxTimeout: NodeJS.Timeout | null = null;
    const interval = setInterval(() => {
      if (checkFn()) {
        clearInterval(interval);
        if (maxTimeout) {
          clearTimeout(maxTimeout);
        }
        resolve(null);
      }
    }, 10);

    maxTimeout = setTimeout(() => {
      clearInterval(interval);
      reject(new Error(`waitUntil timed out${message ? `: ${message}` : ""}`));
    }, 3000);
  });
}

export async function createWaitable<T>(): Promise<[Promise<T>, (arg: T) => void]> {
  return new Promise<[Promise<T>, (arg: T) => void]>((outerResolve) => {
    const internalPromise = new Promise<T>((resolve) => {
      process.nextTick(() => {
        outerResolve([internalPromise, resolve]);
      });
    });
  });
}
