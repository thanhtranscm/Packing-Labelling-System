import { headers } from "next/headers";

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const USER_ID_HEADER = "oai-authenticated-user-id";
const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";

const CF_EMAIL_HEADER = "cf-access-authenticated-user-email";
const CF_USER_ID_HEADER = "cf-access-authenticated-user-id";

const DEFAULT_USER: ChatGPTUser = {
  userId: "owner-thanhtranscm",
  displayName: "Thanh Tran",
  email: process.env.OWNER_EMAIL || "thanhtranscm@gmail.com",
  fullName: "Thanh Tran",
};

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  try {
    const requestHeaders = await headers();

    const cfEmail =
      requestHeaders.get(CF_EMAIL_HEADER)?.trim().toLowerCase() ||
      extractEmailFromCfCookie(requestHeaders.get("cookie"));

    if (cfEmail) {
      if (cfEmail === DEFAULT_USER.email.trim().toLowerCase()) {
        return DEFAULT_USER;
      }
      const cfUserId = requestHeaders.get(CF_USER_ID_HEADER)?.trim();
      const shortName = cfEmail.split("@")[0] || cfEmail;
      return {
        userId: cfUserId || cfEmail,
        displayName: shortName,
        email: cfEmail,
        fullName: shortName,
      };
    }

    const userId = requestHeaders.get(USER_ID_HEADER);
    const email = requestHeaders.get(USER_EMAIL_HEADER);
    if (userId && email) {
      const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
      const fullName =
        encodedFullName &&
        requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
          ? safeDecodeURIComponent(encodedFullName)
          : null;

      return {
        userId,
        displayName: fullName ?? email,
        email,
        fullName,
      };
    }
  } catch {
    // Fallback during build or local run
  }

  return DEFAULT_USER;
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  void returnTo;
  const user = await getChatGPTUser();
  return user ?? DEFAULT_USER;
}

export function chatGPTSignInPath(returnTo: string): string {
  void returnTo;
  return "/";
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  void returnTo;
  return "/";
}

function extractEmailFromCfCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  if (!match || !match[1]) return null;
  try {
    const parts = match[1].split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { email?: unknown };
    return typeof payload.email === "string"
      ? payload.email.trim().toLowerCase()
      : null;
  } catch {
    return null;
  }
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}