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
const CF_JWT_HEADER = "cf-access-jwt-assertion";
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
      extractEmailFromJwt(requestHeaders.get(CF_JWT_HEADER)) ||
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

    const host = requestHeaders.get("host") || "";
    if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
      return DEFAULT_USER;
    }
  } catch {
    // Ignore header errors
  }

  return null;
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  void returnTo;
  const user = await getChatGPTUser();
  if (!user) {
    throw new Error("Sign in required");
  }
  return user;
}

export function chatGPTSignInPath(returnTo: string): string {
  void returnTo;
  return "/";
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  void returnTo;
  return "/";
}

function extractEmailFromJwt(token: string | null): string | null {
  if (!token) return null;
  try {
    const parts = token.trim().split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const jsonText = new TextDecoder().decode(bytes);
    const payload = JSON.parse(jsonText) as { email?: unknown };
    return typeof payload.email === "string"
      ? payload.email.trim().toLowerCase()
      : null;
  } catch {
    return null;
  }
}

function extractEmailFromCfCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  if (!match || !match[1]) return null;
  return extractEmailFromJwt(match[1]);
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}