export function pickNextAmbientIndex(total, currentIndex, mode, randomFn = Math.random) {
  if (total <= 0) return -1;
  if (total === 1 || mode === 'single') return Math.max(0, Math.min(total - 1, currentIndex));
  const raw = Math.floor(Math.max(0, Math.min(0.999999999999, randomFn())) * (total - 1));
  return raw >= currentIndex ? raw + 1 : raw;
}
