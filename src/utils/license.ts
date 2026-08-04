// ponytail: no‑op helpers kept for future use; system has no Pro tier
export const LICENSE_KEY = 'ukemaster.pro';

export function hasPro(): boolean {
  return false;
}

export function setLicense(_active: boolean): void {
  /* intentionally empty */
}
