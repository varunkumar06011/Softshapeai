// Bill numbers are plain counters ("12") on single-PC restaurants and carry a
// per-PC prefix ("D-12", "C-12") on multi-PC restaurants. Sorting must use the
// counter part only — parseInt("D-12") is NaN and breaks comparators.
export function billSequence(billNumber) {
  if (billNumber == null) return null;
  const m = String(billNumber).match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : null;
}
