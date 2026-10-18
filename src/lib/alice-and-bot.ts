"use client";

import {
  createConversation,
  createIdentity,
  getConversationKey,
  sendMessage,
  uploadAttachment,
  type Attachment,
  type Credentials,
} from "@alice-and-bot/core";

export type { Credentials, Attachment };

export const JUDGE_BOT_KEY =
  process.env.NEXT_PUBLIC_JUDGE_BOT_KEY ||
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAogqs5J4S7bMIv6kYh+NKiw0VhWBRm+iJFu7vBrsUd4rZ3l88X7zyhAh+PRHD7we3scZ7TH2pqVRTW3qpW4D42m7/Mto3ICRJBF3RXzDt56qlXnv7JaP9jOzl/yhkOX9Hb8MaIwR1/T9vYwWRBdw2tQCIrX0hiYKDVnXiZH6OaJMYY3rMizLvze2RJASFMLxnVNywtaDrvIMMG6/zc5bUELGKPQg/flc28Gr6S6U5NWHoDhjjAh1hjM86o81iRHTF1PCO4kZB7kf5SQOj7kRdDKMfwqWqH+MpHTHwbfpSfsWXEPWQg7yGhhGgDrivE9xWL/fJaF/2O6F2UubNOh7UEQIDAQAB";

const STORAGE_KEY = "judge_alice_credentials";

export const loadLocalCredentials = (): Credentials | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const storeLocalCredentials = (credentials: Credentials) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
  } catch (err) {
    console.error("Failed to store credentials in localStorage:", err);
  }
};

export const ensureAliceIdentity = async (
  displayName: string = "Petitioner"
): Promise<Credentials> => {
  const existing = loadLocalCredentials();
  if (existing) return existing;

  const created = await createIdentity(displayName);
  storeLocalCredentials(created);
  return created;
};

export const createCaseConversation = async ({
  caseNumber,
  title,
  participantKeys,
  credentials,
}: {
  caseNumber: string;
  title: string;
  participantKeys: string[];
  credentials: Credentials;
}): Promise<{ conversationId: string } | { error: string }> => {
  const allParticipants = Array.from(
    new Set([...participantKeys, JUDGE_BOT_KEY])
  );

  const result = await createConversation(
    allParticipants,
    `${caseNumber}: ${title}`,
    credentials
  );

  if ("conversationId" in result) {
    return { conversationId: result.conversationId };
  }

  return {
    error:
      ("error" in result && result.error) || "Failed to create courtroom session",
  };
};

export const sendOpeningCaseBrief = async ({
  conversationId,
  credentials,
  briefText,
  imageFile,
}: {
  conversationId: string;
  credentials: Credentials;
  briefText: string;
  imageFile?: File | null;
}) => {
  const attachments: Attachment[] = [];

  if (imageFile) {
    try {
      const conversationKey = await getConversationKey(
        credentials,
        conversationId
      );
      const uploaded = await uploadAttachment({
        credentials,
        conversationId,
        conversationKey,
        file: imageFile,
      });
      if (!("error" in uploaded)) {
        attachments.push(uploaded);
      }
    } catch (err) {
      console.warn("Could not upload attachment to AliceChat:", err);
    }
  }

  await sendMessage({
    credentials,
    conversation: conversationId,
    message: {
      type: "text",
      text: briefText,
      ...(attachments.length > 0 ? { attachments } : {}),
    },
  });
};
