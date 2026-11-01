/**
 * Checks whether a VS Code version string (e.g. `1.144.0` or `1.145.0-insider`)
 * is at least the given minimum version. Unparseable versions count as newest.
 */
export function isVersionAtLeast(version: string, minimum: string): boolean {
  const parse = (v: string) => v.split('-')[0].split('.').map((part) => parseInt(part, 10) || 0);
  const actual = parse(version);
  const required = parse(minimum);
  if (!/^\d+\.\d+/.test(version)) {
    return true;
  }
  for (let i = 0; i < Math.max(actual.length, required.length); i++) {
    const a = actual[i] ?? 0;
    const r = required[i] ?? 0;
    if (a !== r) {
      return a > r;
    }
  }
  return true;
}
