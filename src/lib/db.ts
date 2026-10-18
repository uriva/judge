import { Pool } from "pg";
import { randomUUID } from "crypto";
import { parseWhatsAppCorrespondence, type ParsedChatMessage } from "./whatsapp-parser";

const globalForPg = globalThis as unknown as {
  pgPool?: Pool;
  schemaInitialized?: Promise<void>;
};

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  const needsSsl =
    connectionString.includes(".render.com") ||
    connectionString.includes("sslmode=require");

  return new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
  });
}

export function getPool(): Pool {
  if (!globalForPg.pgPool) {
    globalForPg.pgPool = createPool();
  }
  return globalForPg.pgPool;
}

export interface CaseFindingRow {
  id: string;
  caseId: string;
  findingType: "admission" | "contradiction" | "receipt" | "etiquette_breach" | "mitigating_factor" | "visual_evidence";
  attributedTo: string;
  statement: string;
  quoteOrProof?: string;
  impact: "damning" | "significant" | "minor" | "exonerating";
  createdAt: number;
}

export interface CaseResearchRow {
  id: string;
  caseId: string;
  query: string;
  factSummary: string;
  sourceTitle?: string;
  sourceUrl?: string;
  createdAt: number;
}

export interface CaseExhibitRow {
  id: string;
  caseId: string;
  exhibitLabel: string;
  submittedBy: string;
  partySide: string;
  kind: "whatsapp_log" | "image" | "appeal" | "receipt";
  title: string;
  content?: string;
  imageUrl?: string;
  createdAt: number;
}

export interface CaseParticipantRow {
  id: string;
  caseId: string;
  name: string;
  role: "Petitioner" | "Respondent" | "Observer";
  publicSignKey?: string;
  joinedAt: number;
}

export interface CaseRecord {
  id: string;
  caseNumber: string;
  title: string;
  summary: string;
  category: string;
  judgePersona: "supreme" | "small_claims" | "relationship" | "roast";
  rawCorrespondence?: string;
  parsedMessages: ParsedChatMessage[];
  partyAName: string;
  partyBName: string;
  submitterRole: string;
  imageDataUrl?: string;
  imageCaption?: string;
  status: "deliberating" | "cross_examination" | "verdict_issued" | "appealed" | "final_verdict";
  conversationId?: string;
  appealCode: string;
  isPublic: boolean;
  verdictWinner?: string;
  verdictHeadline?: string;
  faultPctA?: number;
  faultPctB?: number;
  verdictReasoning?: string;
  orderedRemedy?: string;
  goldenQuote?: string;
  verdictIssuedAt?: number;
  createdAt: number;
  updatedAt: number;
  findings: CaseFindingRow[];
  research: CaseResearchRow[];
  exhibits: CaseExhibitRow[];
  participants: CaseParticipantRow[];
}

async function initSchema(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      case_number TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'whatsapp',
      judge_persona TEXT NOT NULL DEFAULT 'supreme',
      raw_correspondence TEXT,
      parsed_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
      party_a_name TEXT NOT NULL DEFAULT 'Party A',
      party_b_name TEXT NOT NULL DEFAULT 'Party B',
      submitter_role TEXT NOT NULL DEFAULT 'Party A',
      image_data_url TEXT,
      image_caption TEXT,
      status TEXT NOT NULL DEFAULT 'deliberating',
      conversation_id TEXT,
      appeal_code TEXT UNIQUE NOT NULL,
      is_public BOOLEAN NOT NULL DEFAULT true,
      verdict_winner TEXT,
      verdict_headline TEXT,
      fault_pct_a INTEGER,
      fault_pct_b INTEGER,
      verdict_reasoning TEXT,
      ordered_remedy TEXT,
      golden_quote TEXT,
      verdict_issued_at BIGINT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cases_conversation_id ON cases(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_cases_appeal_code ON cases(appeal_code);
    CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at DESC);

    CREATE TABLE IF NOT EXISTS case_findings (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      finding_type TEXT NOT NULL,
      attributed_to TEXT NOT NULL,
      statement TEXT NOT NULL,
      quote_or_proof TEXT,
      impact TEXT NOT NULL DEFAULT 'significant',
      created_at BIGINT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_case_findings_case_id ON case_findings(case_id);

    CREATE TABLE IF NOT EXISTS case_research (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      query TEXT NOT NULL,
      fact_summary TEXT NOT NULL,
      source_title TEXT,
      source_url TEXT,
      created_at BIGINT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_case_research_case_id ON case_research(case_id);

    CREATE TABLE IF NOT EXISTS case_exhibits (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      exhibit_label TEXT NOT NULL,
      submitted_by TEXT NOT NULL,
      party_side TEXT NOT NULL DEFAULT 'Party A',
      kind TEXT NOT NULL DEFAULT 'whatsapp_log',
      title TEXT NOT NULL,
      content TEXT,
      image_url TEXT,
      created_at BIGINT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_case_exhibits_case_id ON case_exhibits(case_id);

    CREATE TABLE IF NOT EXISTS case_participants (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Petitioner',
      public_sign_key TEXT,
      joined_at BIGINT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_case_participants_case_id ON case_participants(case_id);
  `);

  // Seed initial public docket cases if table is empty
  const countRes = await pool.query(`SELECT COUNT(*)::int AS cnt FROM cases`);
  if ((countRes.rows[0]?.cnt ?? 0) === 0) {
    await seedInitialCases(pool);
  }
}

async function seedInitialCases(pool: Pool) {
  const now = Date.now();
  const seeds = [
    {
      id: "seed-case-airbnb-lisbon",
      caseNumber: "CASE-2026-1042",
      title: "The Lisbon Villa Bailout vs. The Sock-Eating Dog",
      summary:
        "Omer committed to a non-refundable $450/person Airbnb share in Lisbon on WhatsApp, then cancelled 48 hours before departure and refused to pay because 'he isn't sleeping in the bed.'",
      category: "whatsapp",
      judgePersona: "supreme",
      partyAName: "Dan",
      partyBName: "Omer",
      submitterRole: "Dan",
      rawCorrespondence: `[10/02/26, 18:10] Omer: Book the 3-bedroom villa in Lisbon! I'm 100% in, $450 each for the 4 nights is a steal.
[10/02/26, 18:14] Dan: Booking now! Just heads up it's strict non-refundable once booked.
[10/02/26, 18:15] Omer: Send it 🔥
[10/15/26, 09:30] Omer: Bro bad news... my dog just ate a sock and needs observation at the vet, plus work is crazy this week. I can't fly out Thursday.
[10/15/26, 09:33] Dan: Oh no hope Rocco is okay! Regarding the Airbnb, since it's non-refundable can you still transfer your $450 share?
[10/15/26, 09:36] Omer: Wait why would I pay $450 for a bed I'm not sleeping in?? You guys still get the whole villa and now you each get a bigger room.`,
      status: "verdict_issued",
      appealCode: "LISBON",
      verdictWinner: "Dan",
      verdictHeadline:
        "'Send it 🔥' is a binding contract in every group chat jurisdiction on Earth.",
      faultPctA: 5,
      faultPctB: 95,
      verdictReasoning:
        "The evidentiary record is unambiguous. At 18:14 on October 2, Dan explicitly disclosed the strict non-refundable policy prior to purchase. At 18:15, Omer replied 'Send it 🔥', constituting informed, enthusiastic assent. While the Court extends sympathy to Rocco the dog, a unilateral personal emergency (combined with suspiciously convenient 'work is crazy' padding) does not transfer financial liability onto friends who relied on Omer's commitment to book a 3-bedroom property they otherwise would not have rented.",
      orderedRemedy:
        "Omer is ordered to transfer the full $450.00 to Dan within 24 hours. If the group finds a last-minute replacement traveler for Omer's room, Omer is entitled to a pro-rata rebate.",
      goldenQuote:
        "Wait why would I pay $450 for a bed I'm not sleeping in?? You guys still get the whole villa and now you each get a bigger room.",
      findings: [
        {
          findingType: "admission",
          attributedTo: "Omer",
          statement:
            "Omer explicitly authorized a non-refundable booking after being warned of the cancellation terms.",
          quoteOrProof: "[10/02/26, 18:15] Omer: Send it 🔥",
          impact: "damning",
        },
        {
          findingType: "etiquette_breach",
          attributedTo: "Omer",
          statement:
            "Attempted to reframe sticking friends with a $450 sunk cost as a 'luxury upgrade' to a bigger room.",
          quoteOrProof: "now you each get a bigger room",
          impact: "significant",
        },
      ],
      research: [
        {
          query: "group travel etiquette non refundable airbnb cancellation who pays",
          factSummary:
            "Standard group travel precedent and small-claims promissory estoppel hold that once a participant agrees to a non-refundable lodging split, their share remains owed upon cancellation unless a replacement occupant is secured.",
          sourceTitle: "Group Trip Financial Etiquette & Promissory Estoppel",
          sourceUrl: "https://www.law.cornell.edu/wex/promissory_estoppel",
        },
      ],
    },
    {
      id: "seed-case-birthday-salad",
      caseNumber: "CASE-2026-1089",
      title: "The $840 Birthday Dinner Equal-Split Ambush",
      summary:
        "Maya ordered a $22 Caesar salad and tap water at a birthday dinner before leaving early for work. Liam ordered table pitchers of spicy margaritas and truffle ribeyes, then demanded $120 from everyone.",
      category: "money",
      judgePersona: "small_claims",
      partyAName: "Maya",
      partyBName: "Liam",
      submitterRole: "Maya",
      rawCorrespondence: `[10/17/26, 11:42 PM] Liam: Hey everyone!! Total for Chloe's birthday dinner came out to $840 with tip, so that's $120 each for the 7 of us. Venmo me @liam-chen!
[10/17/26, 11:44 PM] Maya: Wait Liam I don't drink alcohol and I literally only ordered the $22 Caesar salad and tap water because I had to leave early for my shift
[10/17/26, 11:45 PM] Liam: Maya it's a birthday dinner, we always split evenly. We ordered 3 pitchers of spicy margaritas and truffle ribeyes for the table
[10/17/26, 11:46 PM] Maya: Nobody asked me if I wanted table ribeyes!! I didn't touch them or the margaritas. I'm happy to chip in $15 toward Chloe's meal + $28 for my salad & tax/tip ($43 total), not $120!
[10/17/26, 11:48 PM] Liam: Honestly doing itemized math at a birthday dinner is super tacky. You knew it was a nice spot when you came.`,
      status: "verdict_issued",
      appealCode: "SALAD7",
      verdictWinner: "Maya",
      verdictHeadline:
        "You cannot subsidize your truffle ribeye habit on the back of a sober shift-worker's Caesar salad.",
      faultPctA: 10,
      faultPctB: 90,
      verdictReasoning:
        "Equal splitting is a convenience for roughly comparable consumption—not a blank check for high-rollers to socialize the cost of 3 margarita pitchers and shared ribeyes across non-drinkers who left early for work. Maya proactively offered $28 for her $22 salad (covering 27% tax & tip) plus $15 toward the birthday guest's share ($43 total). Calling itemized fairness 'tacky' while trying to extract a $77 alcohol subsidy from a friend is the true breach of dining decorum.",
      orderedRemedy:
        "Maya's $43.00 payment is ruled FULL AND FINAL SATISFACTION of her debt. The remaining $797.00 shall be divided among the 6 ribeye-and-margarita consumers ($132.83 each).",
      goldenQuote:
        "Honestly doing itemized math at a birthday dinner is super tacky. You knew it was a nice spot when you came.",
      findings: [
        {
          findingType: "receipt",
          attributedTo: "Maya",
          statement:
            "Maya consumed $22 of food, zero alcohol, and contributed $15 toward the birthday guest of honor ($43 total).",
          quoteOrProof: "I'm happy to chip in $15 toward Chloe's meal + $28 for my salad & tax/tip ($43 total)",
          impact: "exonerating",
        },
        {
          findingType: "contradiction",
          attributedTo: "Liam",
          statement:
            "Liam unilaterally ordered 'table' ribeyes and 3 margarita pitchers without table-wide consent, then weaponized 'birthday etiquette' to force a 445% markup on Maya.",
          quoteOrProof: "We ordered 3 pitchers of spicy margaritas and truffle ribeyes for the table",
          impact: "damning",
        },
      ],
      research: [],
    },
  ];

  for (const s of seeds) {
    const parsed = parseWhatsAppCorrespondence(s.rawCorrespondence);
    await pool.query(
      `INSERT INTO cases (
        id, case_number, title, summary, category, judge_persona,
        raw_correspondence, parsed_messages, party_a_name, party_b_name,
        submitter_role, status, appeal_code, is_public,
        verdict_winner, verdict_headline, fault_pct_a, fault_pct_b,
        verdict_reasoning, ordered_remedy, golden_quote, verdict_issued_at,
        created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
      ) ON CONFLICT (id) DO NOTHING`,
      [
        s.id,
        s.caseNumber,
        s.title,
        s.summary,
        s.category,
        s.judgePersona,
        s.rawCorrespondence,
        JSON.stringify(parsed.messages),
        s.partyAName,
        s.partyBName,
        s.submitterRole,
        s.status,
        s.appealCode,
        s.verdictWinner,
        s.verdictHeadline,
        s.faultPctA,
        s.faultPctB,
        s.verdictReasoning,
        s.orderedRemedy,
        s.goldenQuote,
        now - 3600_000,
        now - 7200_000,
        now - 3600_000,
      ]
    );

    for (const f of s.findings) {
      await pool.query(
        `INSERT INTO case_findings (id, case_id, finding_type, attributed_to, statement, quote_or_proof, impact, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          randomUUID(),
          s.id,
          f.findingType,
          f.attributedTo,
          f.statement,
          f.quoteOrProof,
          f.impact,
          now - 5000_000,
        ]
      );
    }

    for (const r of s.research) {
      await pool.query(
        `INSERT INTO case_research (id, case_id, query, fact_summary, source_title, source_url, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          randomUUID(),
          s.id,
          r.query,
          r.factSummary,
          r.sourceTitle,
          r.sourceUrl,
          now - 4500_000,
        ]
      );
    }
  }
}

export async function ensureDb(): Promise<Pool> {
  if (!globalForPg.schemaInitialized) {
    globalForPg.schemaInitialized = initSchema().catch((err) => {
      globalForPg.schemaInitialized = undefined;
      throw err;
    });
  }
  await globalForPg.schemaInitialized;
  return getPool();
}

function mapCaseRow(
  row: Record<string, any>,
  findings: CaseFindingRow[] = [],
  research: CaseResearchRow[] = [],
  exhibits: CaseExhibitRow[] = [],
  participants: CaseParticipantRow[] = []
): CaseRecord {
  return {
    id: row.id,
    caseNumber: row.case_number,
    title: row.title,
    summary: row.summary,
    category: row.category,
    judgePersona: row.judge_persona,
    rawCorrespondence: row.raw_correspondence ?? undefined,
    parsedMessages: Array.isArray(row.parsed_messages) ? row.parsed_messages : [],
    partyAName: row.party_a_name,
    partyBName: row.party_b_name,
    submitterRole: row.submitter_role,
    imageDataUrl: row.image_data_url ?? undefined,
    imageCaption: row.image_caption ?? undefined,
    status: row.status,
    conversationId: row.conversation_id ?? undefined,
    appealCode: row.appeal_code,
    isPublic: Boolean(row.is_public),
    verdictWinner: row.verdict_winner ?? undefined,
    verdictHeadline: row.verdict_headline ?? undefined,
    faultPctA: row.fault_pct_a !== null && row.fault_pct_a !== undefined ? Number(row.fault_pct_a) : undefined,
    faultPctB: row.fault_pct_b !== null && row.fault_pct_b !== undefined ? Number(row.fault_pct_b) : undefined,
    verdictReasoning: row.verdict_reasoning ?? undefined,
    orderedRemedy: row.ordered_remedy ?? undefined,
    goldenQuote: row.golden_quote ?? undefined,
    verdictIssuedAt: row.verdict_issued_at ? Number(row.verdict_issued_at) : undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    findings,
    research,
    exhibits,
    participants,
  };
}

export async function getCaseById(caseId: string): Promise<CaseRecord | null> {
  const pool = await ensureDb();
  const res = await pool.query(`SELECT * FROM cases WHERE id = $1`, [caseId]);
  if (res.rows.length === 0) return null;
  return populateCaseRelations(pool, res.rows[0]);
}

export async function getCaseByConversationId(conversationId: string): Promise<CaseRecord | null> {
  const pool = await ensureDb();
  const res = await pool.query(
    `SELECT * FROM cases WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [conversationId]
  );
  if (res.rows.length === 0) return null;
  return populateCaseRelations(pool, res.rows[0]);
}

export async function getCaseByAppealCode(appealCode: string): Promise<CaseRecord | null> {
  const pool = await ensureDb();
  const res = await pool.query(
    `SELECT * FROM cases WHERE UPPER(appeal_code) = UPPER($1) LIMIT 1`,
    [appealCode.trim()]
  );
  if (res.rows.length === 0) return null;
  return populateCaseRelations(pool, res.rows[0]);
}

async function populateCaseRelations(pool: Pool, caseRow: Record<string, any>): Promise<CaseRecord> {
  const caseId = caseRow.id;
  const [findingsRes, researchRes, exhibitsRes, participantsRes] = await Promise.all([
    pool.query(`SELECT * FROM case_findings WHERE case_id = $1 ORDER BY created_at ASC`, [caseId]),
    pool.query(`SELECT * FROM case_research WHERE case_id = $1 ORDER BY created_at ASC`, [caseId]),
    pool.query(`SELECT * FROM case_exhibits WHERE case_id = $1 ORDER BY created_at ASC`, [caseId]),
    pool.query(`SELECT * FROM case_participants WHERE case_id = $1 ORDER BY joined_at ASC`, [caseId]),
  ]);

  const findings: CaseFindingRow[] = findingsRes.rows.map((r) => ({
    id: r.id,
    caseId: r.case_id,
    findingType: r.finding_type,
    attributedTo: r.attributed_to,
    statement: r.statement,
    quoteOrProof: r.quote_or_proof ?? undefined,
    impact: r.impact,
    createdAt: Number(r.created_at),
  }));

  const research: CaseResearchRow[] = researchRes.rows.map((r) => ({
    id: r.id,
    caseId: r.case_id,
    query: r.query,
    factSummary: r.fact_summary,
    sourceTitle: r.source_title ?? undefined,
    sourceUrl: r.source_url ?? undefined,
    createdAt: Number(r.created_at),
  }));

  const exhibits: CaseExhibitRow[] = exhibitsRes.rows.map((r) => ({
    id: r.id,
    caseId: r.case_id,
    exhibitLabel: r.exhibit_label,
    submittedBy: r.submitted_by,
    partySide: r.party_side,
    kind: r.kind,
    title: r.title,
    content: r.content ?? undefined,
    imageUrl: r.image_url ?? undefined,
    createdAt: Number(r.created_at),
  }));

  const participants: CaseParticipantRow[] = participantsRes.rows.map((r) => ({
    id: r.id,
    caseId: r.case_id,
    name: r.name,
    role: r.role,
    publicSignKey: r.public_sign_key ?? undefined,
    joinedAt: Number(r.joined_at),
  }));

  return mapCaseRow(caseRow, findings, research, exhibits, participants);
}

export async function listPublicCases(limit = 20): Promise<CaseRecord[]> {
  const pool = await ensureDb();
  const res = await pool.query(
    `SELECT * FROM cases WHERE is_public = true ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return Promise.all(res.rows.map((row) => populateCaseRelations(pool, row)));
}
