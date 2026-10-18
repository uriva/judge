import type { RemoteTool } from "./judge-tools";

const P2B_API_URL = "https://api.prompt2bot.com/api";

async function callP2bEndpoint<TResult>(
  endpoint: string,
  payload: Record<string, unknown>
): Promise<TResult> {
  const res = await fetch(P2B_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint, payload }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`prompt2bot API error (${res.status}): ${text}`);
  }
  return (await res.json()) as TResult;
}

export async function setPrompt(params: {
  apiToken?: string;
  botId?: string;
  secret?: string;
  prompt: string;
}): Promise<{ success: boolean; error?: string }> {
  return callP2bEndpoint("set-prompt", params);
}

export async function setCustomTools(params: {
  apiToken?: string;
  botId?: string;
  secret?: string;
  tools: RemoteTool[];
  skills?: unknown[];
}): Promise<{ success: boolean; error?: string }> {
  return callP2bEndpoint("set-custom-tools", params);
}

export async function injectContext(params: {
  secret?: string;
  apiToken?: string;
  botId?: string;
  context: string;
  preferredNetwork: string;
  targetConversationId: string;
  attachments?: Array<{
    kind: "inline";
    mimeType: string;
    dataBase64: string;
    caption?: string;
  }>;
}): Promise<{ success: boolean; error?: string }> {
  return callP2bEndpoint("inject-context", params);
}
