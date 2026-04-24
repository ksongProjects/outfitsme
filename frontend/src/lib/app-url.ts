const DEFAULT_APP_URL = "http://localhost:3000";

function normalizeUrlCandidate(value: string | undefined | null): string | null {
  const cleaned = String(value || "").trim();
  if (!cleaned) {
    return null;
  }

  const isLocalhostHost = /^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?(\/|$)/i.test(cleaned);
  const withProtocol = /^https?:\/\//i.test(cleaned)
    ? cleaned
    : `${isLocalhostHost ? "http" : "https"}://${cleaned}`;

  try {
    return new URL(withProtocol).toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function parseTrustedOriginsEnv(): string[] {
  const raw = process.env.BETTER_AUTH_TRUSTED_ORIGINS || "";
  return raw
    .split(",")
    .map((value) => normalizeUrlCandidate(value))
    .filter((value): value is string => Boolean(value));
}

function collectAppUrlCandidates(): string[] {
  const candidates = [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BETTER_AUTH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
  ];
  const resolved = new Set<string>();

  for (const candidate of candidates) {
    const normalized = normalizeUrlCandidate(candidate);
    if (normalized) {
      resolved.add(normalized);
    }
  }

  return Array.from(resolved);
}

function shouldAddWwwAlias(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1") {
    return false;
  }
  if (normalized.endsWith(".vercel.app")) {
    return false;
  }

  if (normalized.startsWith("www.")) {
    return true;
  }

  return normalized.split(".").filter(Boolean).length === 2;
}

function addOrigin(origins: Set<string>, value: string) {
  try {
    const parsed = new URL(value);
    origins.add(parsed.origin);

    if (!shouldAddWwwAlias(parsed.hostname)) {
      return;
    }

    const aliasHost = parsed.hostname.startsWith("www.")
      ? parsed.hostname.slice(4)
      : `www.${parsed.hostname}`;
    origins.add(`${parsed.protocol}//${aliasHost}${parsed.port ? `:${parsed.port}` : ""}`);
  } catch {
    return;
  }
}

export function getAppUrl(): string {
  return collectAppUrlCandidates()[0] || DEFAULT_APP_URL;
}

export function buildTrustedOrigins(): string[] {
  const origins = new Set<string>();

  for (const candidate of [...collectAppUrlCandidates(), ...parseTrustedOriginsEnv()]) {
    addOrigin(origins, candidate);
  }

  return Array.from(origins);
}
