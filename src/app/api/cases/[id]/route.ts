import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { injectContext } from "@/lib/p2b-client";
import {
  ensureDb,
  getCaseByAppealCode,
  getCaseById,
} from "@/lib/db";

const PROMPT2BOT_WEBHOOK_SECRET =
  process.env.PROMPT2BOT_WEBHOOK_SECRET || "3f3880f7-e058-4b0e-919f-75f4f58776e3";

function parseDataUrl(dataUrl?: string | null): {
  mimeType: string;
  dataBase64: string;
} | null {
  if (!dataUrl || !dataUrl.startsWith("data:")) return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    dataBase64: match[2],
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let caseRecord = await getCaseById(id);
    if (!caseRecord && id.length <= 8) {
      caseRecord = await getCaseByAppealCode(id);
    }
    if (!caseRecord) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }
    return NextResponse.json({ case: caseRecord });
  } catch (err: any) {
    console.error("[GET /api/cases/[id]] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to fetch case" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const pool = await ensureDb();

    const existing =
      (await getCaseById(id)) ||
      (id.length <= 8 ? await getCaseByAppealCode(id) : null);

    if (!existing) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const action = body.action as string;
    const now = Date.now();

    // 1. Link Alice & Bot conversationId to Case
    if (action === "link_conversation") {
      const conversationId = String(body.conversationId || "").trim();
      if (!conversationId) {
        return NextResponse.json(
          { error: "conversationId is required" },
          { status: 400 }
        );
      }

      await pool.query(
        `UPDATE cases SET conversation_id = $1, updated_at = $2 WHERE id = $3`,
        [conversationId, now, existing.id]
      );

      // If the case has an uploaded imageDataUrl, also inject it as a multimodal attachment
      // or let the client send the opening brief. If triggerJudge=true is passed, inject context directly.
      if (body.triggerJudge) {
        const inlineImg = parseDataUrl(existing.imageDataUrl);
        await injectContext({
          secret: PROMPT2BOT_WEBHOOK_SECRET,
          preferredNetwork: "alice-and-bot",
          targetConversationId: conversationId,
          context: `COURT CLERK NOTICE: Case ${existing.caseNumber} (${existing.title}) has been filed by ${existing.submitterRole}. Review the Active Case File in your instructions, log key findings with log_finding, issue an official ruling with issue_verdict, and address the courtroom.`,
          ...(inlineImg
            ? {
                attachments: [
                  {
                    kind: "inline" as const,
                    mimeType: inlineImg.mimeType,
                    dataBase64: inlineImg.dataBase64,
                    caption:
                      existing.imageCaption ||
                      `Evidence photo for ${existing.caseNumber}`,
                  },
                ],
              }
            : {}),
        }).catch((err: unknown) =>
          console.warn("[link_conversation] injectContext warning:", err)
        );
      }

      const updated = await getCaseById(existing.id);
      return NextResponse.json({ case: updated });
    }

    // 2. Add New Exhibit (Photo, Receipt, or Additional WhatsApp Messages)
    if (action === "add_exhibit") {
      const submittedBy =
        String(body.submittedBy || "").trim() || existing.partyAName;
      const partySide =
        String(body.partySide || "").trim() || existing.partyAName;
      const title = String(body.title || "Additional Evidence").trim();
      const content = body.content ? String(body.content).trim() : null;
      const imageUrl = body.imageUrl ? String(body.imageUrl) : null;
      const kind = imageUrl ? "image" : "receipt";
      const label = `Exhibit ${String.fromCharCode(
        65 + existing.exhibits.length
      )}`;

      await pool.query(
        `INSERT INTO case_exhibits (id, case_id, exhibit_label, submitted_by, party_side, kind, title, content, image_url, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          randomUUID(),
          existing.id,
          label,
          submittedBy,
          partySide,
          kind,
          title,
          content,
          imageUrl,
          now,
        ]
      );

      await pool.query(`UPDATE cases SET updated_at = $1 WHERE id = $2`, [
        now,
        existing.id,
      ]);

      // Notify the Judge in the active conversation if connected
      if (existing.conversationId) {
        const inlineImg = parseDataUrl(imageUrl);
        await injectContext({
          secret: PROMPT2BOT_WEBHOOK_SECRET,
          preferredNetwork: "alice-and-bot",
          targetConversationId: existing.conversationId,
          context: `COURT CLERK NOTICE: New evidence [${label}: "${title}"] was just submitted to the Docket by ${submittedBy} (${partySide}).${
            content ? ` Details: "${content}".` : ""
          } Examine this new exhibit, log a finding via log_finding, and if it changes the fault split or ruling, call amend_verdict or issue_verdict and announce your response in chat.`,
          ...(inlineImg
            ? {
                attachments: [
                  {
                    kind: "inline" as const,
                    mimeType: inlineImg.mimeType,
                    dataBase64: inlineImg.dataBase64,
                    caption: `${label}: ${title}`,
                  },
                ],
              }
            : {}),
        }).catch((err: unknown) =>
          console.warn("[add_exhibit] injectContext warning:", err)
        );
      }

      const updated = await getCaseById(existing.id);
      return NextResponse.json({ case: updated });
    }

    // 3. Submit Counterparty Appeal / Cross-Examination Testimony
    if (action === "submit_appeal") {
      const appellantName =
        String(body.appellantName || "").trim() || existing.partyBName;
      const testimony = String(body.testimony || "").trim();
      const imageUrl = body.imageUrl ? String(body.imageUrl) : null;
      const publicSignKey = body.publicSignKey
        ? String(body.publicSignKey)
        : null;

      if (!testimony && !imageUrl) {
        return NextResponse.json(
          { error: "Appeal testimony or counter-evidence is required" },
          { status: 400 }
        );
      }

      const label = `Appeal Brief (${appellantName})`;

      await pool.query(
        `INSERT INTO case_exhibits (id, case_id, exhibit_label, submitted_by, party_side, kind, title, content, image_url, created_at)
         VALUES ($1, $2, $3, $4, $5, 'appeal', $6, $7, $8, $9)`,
        [
          randomUUID(),
          existing.id,
          label,
          appellantName,
          existing.partyBName,
          `Counter-Appeal by ${appellantName}`,
          testimony,
          imageUrl,
          now,
        ]
      );

      // Add Respondent to participants if not already listed
      const alreadyJoined = existing.participants.some(
        (p) => p.name.toLowerCase() === appellantName.toLowerCase()
      );
      if (!alreadyJoined) {
        await pool.query(
          `INSERT INTO case_participants (id, case_id, name, role, public_sign_key, joined_at)
           VALUES ($1, $2, $3, 'Respondent', $4, $5)`,
          [randomUUID(), existing.id, appellantName, publicSignKey, now]
        );
      }

      await pool.query(
        `UPDATE cases SET status = 'appealed', updated_at = $1 WHERE id = $2`,
        [now, existing.id]
      );

      if (existing.conversationId) {
        const inlineImg = parseDataUrl(imageUrl);
        await injectContext({
          secret: PROMPT2BOT_WEBHOOK_SECRET,
          preferredNetwork: "alice-and-bot",
          targetConversationId: existing.conversationId,
          context: `APPELLATE COURT NOTICE: Counterparty ${appellantName} has answered the Court Summons and filed an Official Appeal / Counter-Testimony on Docket ${existing.caseNumber}: "${testimony}". Evaluate ${appellantName}'s defense against the existing record, call log_finding for any new facts, and call amend_verdict to either UPHOLD your original verdict or OVERTURN/MODIFY the fault split and remedy. Address both ${existing.partyAName} and ${appellantName} in the courtroom chat.`,
          ...(inlineImg
            ? {
                attachments: [
                  {
                    kind: "inline" as const,
                    mimeType: inlineImg.mimeType,
                    dataBase64: inlineImg.dataBase64,
                    caption: `Counter-evidence from ${appellantName}`,
                  },
                ],
              }
            : {}),
        }).catch((err: unknown) =>
          console.warn("[submit_appeal] injectContext warning:", err)
        );
      }

      const updated = await getCaseById(existing.id);
      return NextResponse.json({ case: updated });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("[PATCH /api/cases/[id]] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to update case" },
      { status: 500 }
    );
  }
}
