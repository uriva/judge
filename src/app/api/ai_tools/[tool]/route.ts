import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomUUID } from "crypto";
import {
  ensureDb,
  getCaseByConversationId,
  getCaseById,
  type CaseRecord,
} from "@/lib/db";
import { TOOL_NAMES } from "@/lib/judge-tools";
import { BASE_JUDGE_PROMPT, buildDynamicJudgePrompt } from "@/lib/judge-prompt";

const PROMPT2BOT_WEBHOOK_SECRET =
  process.env.PROMPT2BOT_WEBHOOK_SECRET || "3f3880f7-e058-4b0e-919f-75f4f58776e3";
const PROMPT2BOT_API_TOKEN =
  process.env.PROMPT2BOT_API_TOKEN || "p2b_95a4a7fd33ae84a54a2cb205c491675409d6a54a";

const secretsToTry = [PROMPT2BOT_WEBHOOK_SECRET, PROMPT2BOT_API_TOKEN].filter(
  Boolean
);

interface SignedToolPayload<T> {
  payload: {
    meta: {
      botId: string;
      conversationId: string;
      userId: string;
      network: string;
      timestamp: string;
      nonce: string;
      toolCallId?: string;
      toolName?: string;
    };
    params: T;
  };
  signature: string;
}

function verifySignature<T>(body: SignedToolPayload<T>) {
  if (!body || typeof body !== "object" || !body.payload) {
    throw new Error("Invalid signed tool payload");
  }

  const payloadStr = JSON.stringify(body.payload);
  const signature = body.signature;

  let verified = false;
  for (const sec of secretsToTry) {
    const computed = createHmac("sha256", sec).update(payloadStr).digest("hex");
    if (computed === signature) {
      verified = true;
      break;
    }
  }

  return {
    verified,
    meta: body.payload.meta,
    params: body.payload.params,
  };
}

async function resolveTargetCase(
  caseIdParam: string | undefined,
  conversationId: string | undefined
): Promise<CaseRecord | null> {
  if (caseIdParam) {
    const byId = await getCaseById(caseIdParam);
    if (byId) return byId;
  }
  if (conversationId) {
    const byConv = await getCaseByConversationId(conversationId);
    if (byConv) return byConv;
  }
  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  const { tool } = await params;

  let rawBody: SignedToolPayload<any>;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { verified, meta, params: toolParams } = verifySignature(rawBody);
  if (!verified) {
    console.warn(`[ai_tools] Unverified signature for tool ${tool}`);
  }

  const convId = meta?.conversationId;
  console.log(`[ai_tools] Tool=${tool} convId=${convId}`);

  try {
    // 1. REMOTE CONFIG
    if (tool === TOOL_NAMES.REMOTE_CONFIG) {
      if (!convId) {
        return NextResponse.json({
          prompt: BASE_JUDGE_PROMPT,
          timezoneIANA: "UTC",
        });
      }

      const activeCase = await getCaseByConversationId(convId);
      if (!activeCase) {
        return NextResponse.json({
          prompt: `${BASE_JUDGE_PROMPT}\n\nNote: Courtroom session active. If the user pastes a WhatsApp chat or describes a dispute directly in chat, analyze it and deliver a decisive judicial ruling.`,
          timezoneIANA: "UTC",
        });
      }

      return NextResponse.json({
        prompt: buildDynamicJudgePrompt(activeCase),
        timezoneIANA: "UTC",
      });
    }

    const pool = await ensureDb();

    // 2. LOG FINDING OF FACT
    if (tool === TOOL_NAMES.LOG_FINDING) {
      const targetCase = await resolveTargetCase(toolParams?.caseId, convId);
      if (!targetCase) {
        return NextResponse.json(
          { error: "Active case not found for this courtroom session." },
          { status: 404 }
        );
      }

      const findingId = randomUUID();
      const findingType = toolParams.findingType || "admission";
      const attributedTo = toolParams.attributedTo || targetCase.partyAName;
      const statement = String(toolParams.statement || "").trim();
      const quoteOrProof = toolParams.quoteOrProof
        ? String(toolParams.quoteOrProof).trim()
        : null;
      const impact = toolParams.impact || "significant";
      const now = Date.now();

      await pool.query(
        `INSERT INTO case_findings (id, case_id, finding_type, attributed_to, statement, quote_or_proof, impact, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          findingId,
          targetCase.id,
          findingType,
          attributedTo,
          statement,
          quoteOrProof,
          impact,
          now,
        ]
      );

      await pool.query(`UPDATE cases SET updated_at = $1 WHERE id = $2`, [
        now,
        targetCase.id,
      ]);

      return NextResponse.json({
        success: true,
        findingId,
        caseId: targetCase.id,
        message: `Finding of fact logged to Docket ${targetCase.caseNumber}: "${statement}"`,
      });
    }

    // 3. LOG WEB RESEARCH
    if (tool === TOOL_NAMES.LOG_WEB_RESEARCH) {
      const targetCase = await resolveTargetCase(toolParams?.caseId, convId);
      if (!targetCase) {
        return NextResponse.json(
          { error: "Active case not found for this courtroom session." },
          { status: 404 }
        );
      }

      const researchId = randomUUID();
      const query = String(toolParams.query || "").trim();
      const factSummary = String(toolParams.factSummary || "").trim();
      const sourceTitle = toolParams.sourceTitle
        ? String(toolParams.sourceTitle).trim()
        : null;
      const sourceUrl = toolParams.sourceUrl
        ? String(toolParams.sourceUrl).trim()
        : null;
      const now = Date.now();

      await pool.query(
        `INSERT INTO case_research (id, case_id, query, fact_summary, source_title, source_url, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          researchId,
          targetCase.id,
          query,
          factSummary,
          sourceTitle,
          sourceUrl,
          now,
        ]
      );

      await pool.query(`UPDATE cases SET updated_at = $1 WHERE id = $2`, [
        now,
        targetCase.id,
      ]);

      return NextResponse.json({
        success: true,
        researchId,
        caseId: targetCase.id,
        message: `Web research precedent pinned to Docket ${targetCase.caseNumber}.`,
      });
    }

    // 4. ISSUE VERDICT or 5. AMEND VERDICT
    if (
      tool === TOOL_NAMES.ISSUE_VERDICT ||
      tool === TOOL_NAMES.AMEND_VERDICT
    ) {
      const targetCase = await resolveTargetCase(toolParams?.caseId, convId);
      if (!targetCase) {
        return NextResponse.json(
          { error: "Active case not found for this courtroom session." },
          { status: 404 }
        );
      }

      const rawA = Number(toolParams.faultPctA ?? 50);
      const rawB = Number(toolParams.faultPctB ?? 100 - rawA);
      const total = rawA + rawB;
      const faultPctA =
        total > 0 ? Math.round((rawA / total) * 100) : 50;
      const faultPctB = 100 - faultPctA;

      const verdictWinner = String(
        toolParams.verdictWinner || "Split Liability"
      ).trim();
      const verdictHeadline = String(
        toolParams.verdictHeadline || "The Court has reached a verdict."
      ).trim();
      const verdictReasoning = String(
        toolParams.verdictReasoning || ""
      ).trim();
      const orderedRemedy = String(toolParams.orderedRemedy || "").trim();
      const goldenQuote = toolParams.goldenQuote
        ? String(toolParams.goldenQuote).trim()
        : targetCase.goldenQuote || null;

      const updatedTitle = toolParams.caseTitle
        ? String(toolParams.caseTitle).trim()
        : targetCase.title;
      const updatedPartyA = toolParams.partyAName
        ? String(toolParams.partyAName).trim()
        : targetCase.partyAName;
      const updatedPartyB = toolParams.partyBName
        ? String(toolParams.partyBName).trim()
        : targetCase.partyBName;

      const newStatus =
        tool === TOOL_NAMES.AMEND_VERDICT ? "final_verdict" : "verdict_issued";
      const now = Date.now();

      await pool.query(
        `UPDATE cases
         SET status = $1,
             verdict_winner = $2,
             verdict_headline = $3,
             fault_pct_a = $4,
             fault_pct_b = $5,
             verdict_reasoning = $6,
             ordered_remedy = $7,
             golden_quote = COALESCE($8, golden_quote),
             verdict_issued_at = $9,
             updated_at = $9,
             title = $10,
             party_a_name = $11,
             party_b_name = $12
         WHERE id = $13`,
        [
          newStatus,
          verdictWinner,
          verdictHeadline,
          faultPctA,
          faultPctB,
          verdictReasoning,
          orderedRemedy,
          goldenQuote,
          now,
          updatedTitle,
          updatedPartyA,
          updatedPartyB,
          targetCase.id,
        ]
      );

      return NextResponse.json({
        success: true,
        caseId: targetCase.id,
        caseNumber: targetCase.caseNumber,
        status: newStatus,
        verdictWinner,
        verdictHeadline,
        faultSplit: {
          [targetCase.partyAName]: `${faultPctA}%`,
          [targetCase.partyBName]: `${faultPctB}%`,
        },
        orderedRemedy,
        message: `Official Verdict recorded on Docket ${targetCase.caseNumber}. The Verdict Banner and Blame Meter are now live for the parties.`,
      });
    }

    return NextResponse.json({ error: `Unknown tool: ${tool}` }, { status: 404 });
  } catch (err: any) {
    console.error(`[ai_tools] Error in ${tool}:`, err);
    return NextResponse.json(
      { error: err?.message || "Internal tool execution error" },
      { status: 500 }
    );
  }
}
