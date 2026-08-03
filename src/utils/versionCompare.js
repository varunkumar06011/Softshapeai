// ─────────────────────────────────────────────────────────────────────────────
// versionCompare — strict semver parsing and comparison
// ─────────────────────────────────────────────────────────────────────────────
// Shared between frontend and backend (they use the same policy).  Supports an
// optional leading 'v', rejects negative/excessively large components, and
// treats major version bumps as mandatory updates.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_COMPONENT = 999_999;
const MAX_LENGTH = 64;

export function parseSemver(version) {
  if (!version || typeof version !== 'string') return null;
  const trimmed = version.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_LENGTH) return null;

  const withoutPrefix = trimmed.replace(/^v/i, '');
  const [core, ...rest] = withoutPrefix.split('-');
  if (!core || rest.length > 1) return null;

  const coreParts = core.split('.');
  if (coreParts.length !== 3) return null;

  const numbers = coreParts.map((p) => {
    if (!/^\d+$/.test(p)) return null;
    const n = parseInt(p, 10);
    return Number.isInteger(n) && n >= 0 && n <= MAX_COMPONENT ? n : null;
  });

  if (numbers.some((n) => n === null)) return null;
  const [major, minor, patch] = numbers;
  const prerelease = rest.length === 1 ? (rest[0].trim() || null) : null;

  if (prerelease !== null && !/^[A-Za-z0-9.]+$/.test(prerelease)) return null;

  return { major, minor, patch, prerelease };
}

export function compareSemver(a, b) {
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) {
      return a[key] > b[key] ? 1 : -1;
    }
  }
  if (a.prerelease === null && b.prerelease !== null) return 1;
  if (a.prerelease !== null && b.prerelease === null) return -1;
  if (a.prerelease === b.prerelease) return 0;
  return a.prerelease > b.prerelease ? 1 : -1;
}

export function isNewer(current, latest) {
  return compareSemver(current, latest) === -1;
}

export function isMajorBump(current, latest) {
  return latest.major > current.major;
}
