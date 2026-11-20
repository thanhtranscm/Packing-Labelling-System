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

const DEFAULT_USER: ChatGPTUser = {
  userId: "owner-thanhtranscm",
  displayName: "Thanh Tran",
  email: process.env.OWNER_EMAIL || "thanhtranscm@gmail.com",
  fullName: "Thanh Tran",
};

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  try {
    const requestHeaders = await headers();
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
    // Fallback when running outside ChatGPT Sites
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

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}