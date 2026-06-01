/** Preserve current values when API patch omits a field (avoids accidental false/empty overwrites). */

export function pickBoolean(patch, key, current) {
  return patch[key] === undefined ? Boolean(current[key]) : Boolean(patch[key]);
}

export function pickFlag(patch, key, current, { defaultTrue = true } = {}) {
  if (patch[key] === undefined) {
    return current[key] !== undefined ? current[key] : defaultTrue;
  }
  return defaultTrue ? patch[key] !== false : Boolean(patch[key]);
}
