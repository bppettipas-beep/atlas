const TAB_SIGNED_OUT_KEY = 'atlas.tabSignedOut';

/** Temporary testing mode: ordinary logout applies only to this browser tab. */
export function isTabSignedOut() {
  return window.sessionStorage.getItem(TAB_SIGNED_OUT_KEY) === '1';
}

export function markTabSignedOut() {
  window.sessionStorage.setItem(TAB_SIGNED_OUT_KEY, '1');
}

export function markTabSignedIn() {
  window.sessionStorage.removeItem(TAB_SIGNED_OUT_KEY);
}
