let isTweakpaneActive = false;

export function setTweakpaneActive(status: boolean) {
  isTweakpaneActive = status;
}

export function getTweakpaneActive() {
  return isTweakpaneActive;
}
