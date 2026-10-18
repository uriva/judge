import { setPrompt, setCustomTools } from "../src/lib/p2b-client";
import { BASE_JUDGE_PROMPT } from "../src/lib/judge-prompt";
import { getJudgeTools } from "../src/lib/judge-tools";

const baseUrl = process.env.BASE_URL || "https://judge-court.onrender.com";
const apiToken =
  process.env.PROMPT2BOT_API_TOKEN ||
  "p2b_95a4a7fd33ae84a54a2cb205c491675409d6a54a";
const botId =
  process.env.PROMPT2BOT_BOT_ID || "ddfea796-534c-4eb9-b824-d729dfe1f31c";

async function main() {
  console.log(`[register-agent] Target Judge bot: ${botId}`);
  console.log(`[register-agent] Base URL: ${baseUrl}`);

  console.log("[register-agent] Updating Judge base prompt...");
  const promptRes = await setPrompt({
    apiToken,
    botId,
    prompt: BASE_JUDGE_PROMPT,
  });

  if (!promptRes.success) {
    console.error("[register-agent] Failed to set prompt:", promptRes.error);
    process.exit(1);
  }
  console.log("[register-agent] ✓ Judge prompt updated successfully.");

  const tools = getJudgeTools(baseUrl);
  console.log(
    `[register-agent] Registering ${tools.length} tools: ${tools
      .map((t) => t.name)
      .join(", ")}...`
  );

  const toolsRes = await setCustomTools({
    apiToken,
    botId,
    tools,
    skills: [],
  });

  if (!toolsRes.success) {
    console.error(
      "[register-agent] Failed to register tools:",
      toolsRes.error
    );
    process.exit(1);
  }

  console.log(
    "[register-agent] ✓ Custom tools & remote_config registered with prompt2bot!"
  );
}

main().catch((err) => {
  console.error("[register-agent] Unexpected error:", err);
  process.exit(1);
});
