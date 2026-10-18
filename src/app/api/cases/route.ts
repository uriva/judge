import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { ensureDb, getCaseById, listPublicCases } from "@/lib/db";
import { parseWhatsAppCorrespondence } from "@/lib/whatsapp-parser";

function generateCaseNumber(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `CASE-2026-${num}`;
}

function generateAppealCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const idsParam = searchParams.get("ids");

    const publicCases = await listPublicCases(18);

    if (!idsParam) {
      return NextResponse.json({ cases: publicCases, myCases: [] });
    }

    const ids = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 30);

    const myCasesResults = await Promise.all(ids.map((id) => getCaseById(id)));
    const myCases = myCasesResults.filter(Boolean);

    return NextResponse.json({
      cases: publicCases,
      myCases,
    });
  } catch (err: any) {
    console.error("[GET /api/cases] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load docket" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const pool = await ensureDb();

    const rawCorrespondence = String(body.rawCorrespondence || "").trim();
    const parsed = parseWhatsAppCorrespondence(rawCorrespondence);

    const partyAName =
      String(body.partyAName || "").trim() ||
      parsed.speakers[0] ||
      "Petitioner";
    const partyBName =
      String(body.partyBName || "").trim() ||
      parsed.speakers[1] ||
      "Counterparty";
    const submitterRole = String(body.submitterRole || partyAName).trim();

    const summary =
      String(body.summary || "").trim() ||
      (rawCorrespondence
        ? `Submitted WhatsApp correspondence between ${partyAName} and ${partyBName} (${
            parsed.messages.length || 1
          } messages) for judicial ruling.`
        : `Visual evidence submitted by ${partyAName} v. ${partyBName} for judicial ruling.`);

    const title =
      String(body.title || "").trim() ||
      `${partyAName} v. ${partyBName}`;

    const category = String(body.category || "whatsapp").trim();
    const judgePersona = ["supreme", "small_claims", "relationship", "roast"].includes(
      body.judgePersona
    )
      ? body.judgePersona
      : "supreme";

    const imageDataUrl = body.imageDataUrl
      ? String(body.imageDataUrl)
      : null;
    const imageCaption = body.imageCaption
      ? String(body.imageCaption).trim()
      : null;
    const isPublic = body.isPublic !== undefined ? Boolean(body.isPublic) : true;
    const publicSignKey = body.publicSignKey
      ? String(body.publicSignKey)
      : null;

    const id = randomUUID();
    const caseNumber = generateCaseNumber();
    const appealCode = generateAppealCode();
    const now = Date.now();

    await pool.query(
      `INSERT INTO cases (
        id, case_number, title, summary, category, judge_persona,
        raw_correspondence, parsed_messages, party_a_name, party_b_name,
        submitter_role, image_data_url, image_caption, status,
        appeal_code, is_public, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'deliberating',$14,$15,$16,$16
      )`,
      [
        id,
        caseNumber,
        title,
        summary,
        category,
        judgePersona,
        rawCorrespondence || null,
        JSON.stringify(parsed.messages),
        partyAName,
        partyBName,
        submitterRole,
        imageDataUrl,
        imageCaption,
        appealCode,
        isPublic,
        now,
      ]
    );

    // Record Petitioner as initial participant
    await pool.query(
      `INSERT INTO case_participants (id, case_id, name, role, public_sign_key, joined_at)
       VALUES ($1, $2, $3, 'Petitioner', $4, $5)`,
      [randomUUID(), id, submitterRole, publicSignKey, now]
    );

    // Record initial Exhibit A (WhatsApp log) and/or Exhibit B (Photo/Screenshot)
    if (rawCorrespondence) {
      await pool.query(
        `INSERT INTO case_exhibits (id, case_id, exhibit_label, submitted_by, party_side, kind, title, content, created_at)
         VALUES ($1, $2, 'Exhibit A', $3, $4, 'whatsapp_log', $5, $6, $7)`,
        [
          randomUUID(),
          id,
          submitterRole,
          partyAName,
          `WhatsApp Transcript (${parsed.messages.length || 1} entries)`,
          rawCorrespondence,
          now,
        ]
      );
    }

    if (imageDataUrl) {
      await pool.query(
        `INSERT INTO case_exhibits (id, case_id, exhibit_label, submitted_by, party_side, kind, title, content, image_url, created_at)
         VALUES ($1, $2, $3, $4, $5, 'image', $6, $7, $8, $9)`,
        [
          randomUUID(),
          id,
          rawCorrespondence ? "Exhibit B" : "Exhibit A",
          submitterRole,
          partyAName,
          imageCaption || "Photographic / Screenshot Evidence",
          imageCaption || "Submitted visual evidence",
          imageDataUrl,
          now,
        ]
      );
    }

    const created = await getCaseById(id);
    return NextResponse.json({ case: created }, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/cases] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to file case" },
      { status: 500 }
    );
  }
}
