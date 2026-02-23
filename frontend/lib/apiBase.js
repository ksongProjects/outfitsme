const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();

if (!apiBase) {
  throw new Error("Missing NEXT_PUBLIC_API_BASE_URL.");
}

export const API_BASE = apiBase.replace(/\/+$/, "");
