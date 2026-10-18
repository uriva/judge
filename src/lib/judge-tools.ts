export type RemoteTool = {
  name: string;
  description: string;
  url: string;
  parameters: Record<string, unknown>;
};

export const TOOL_NAMES = {
  REMOTE_CONFIG: "remote_config",
  LOG_FINDING: "log_finding",
  LOG_WEB_RESEARCH: "log_web_research",
  ISSUE_VERDICT: "issue_verdict",
  AMEND_VERDICT: "amend_verdict",
} as const;

export const getJudgeTools = (baseUrl: string): RemoteTool[] => [
  {
    name: TOOL_NAMES.REMOTE_CONFIG,
    description:
      "Internal infrastructure hook called on every message to supply the dynamic courtroom docket, pasted WhatsApp transcript, uploaded image evidence, and judicial persona instructions.",
    url: `${baseUrl}/api/ai_tools/${TOOL_NAMES.REMOTE_CONFIG}`,
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: TOOL_NAMES.LOG_FINDING,
    description:
      "Records an official Finding of Fact or evidentiary observation onto the live Courtroom Docket. Call this to pin key admissions, contradictions, receipts, etiquette breaches, or visual evidence details from the WhatsApp correspondence or photo before or alongside your ruling.",
    url: `${baseUrl}/api/ai_tools/${TOOL_NAMES.LOG_FINDING}`,
    parameters: {
      type: "object",
      properties: {
        caseId: {
          type: "string",
          description: "The unique ID of the case from the ACTIVE CASE FILE.",
        },
        findingType: {
          type: "string",
          enum: [
            "admission",
            "contradiction",
            "receipt",
            "etiquette_breach",
            "mitigating_factor",
            "visual_evidence",
          ],
          description: "Category of the evidentiary finding.",
        },
        attributedTo: {
          type: "string",
          description: "Name of the party this finding concerns (or 'Both').",
        },
        statement: {
          type: "string",
          description: "Crisp, objective judicial finding of fact.",
        },
        quoteOrProof: {
          type: "string",
          description:
            "Exact quote/timestamp from the WhatsApp log or specific visual observation from the photo.",
        },
        impact: {
          type: "string",
          enum: ["damning", "significant", "minor", "exonerating"],
          description: "How strongly this finding weighs on the verdict.",
        },
      },
      required: ["caseId", "findingType", "attributedTo", "statement", "impact"],
    },
  },
  {
    name: TOOL_NAMES.LOG_WEB_RESEARCH,
    description:
      "Pins a web research fact-check or external precedent citation onto the live Courtroom Docket after you look up prices, rules, laws, or facts via web search.",
    url: `${baseUrl}/api/ai_tools/${TOOL_NAMES.LOG_WEB_RESEARCH}`,
    parameters: {
      type: "object",
      properties: {
        caseId: {
          type: "string",
          description: "The unique ID of the case from the ACTIVE CASE FILE.",
        },
        query: {
          type: "string",
          description: "The topic or question researched.",
        },
        factSummary: {
          type: "string",
          description:
            "Clear summary of the external fact, price, policy, or standard discovered.",
        },
        sourceTitle: {
          type: "string",
          description: "Title or name of the source.",
        },
        sourceUrl: {
          type: "string",
          description: "URL of the source if available.",
        },
      },
      required: ["caseId", "query", "factSummary"],
    },
  },
  {
    name: TOOL_NAMES.ISSUE_VERDICT,
    description:
      "Slams the gavel and issues the official Court Verdict on the live docket. Always call this once you have analyzed the WhatsApp correspondence or photo evidence so the user gets their official Verdict Card, Blame Split Meter, and Ordered Remedy.",
    url: `${baseUrl}/api/ai_tools/${TOOL_NAMES.ISSUE_VERDICT}`,
    parameters: {
      type: "object",
      properties: {
        caseId: {
          type: "string",
          description: "The unique ID of the case from the ACTIVE CASE FILE.",
        },
        verdictWinner: {
          type: "string",
          description:
            "Name of the prevailing party (who is in the right), or 'Split Liability' / 'Both Guilty'.",
        },
        verdictHeadline: {
          type: "string",
          description:
            "A razor-sharp, memorable, quotable 1-sentence headline ruling suitable for sharing on a Verdict Card.",
        },
        faultPctA: {
          type: "number",
          description:
            "Percentage of fault (0-100) assigned to Party A. Must sum with faultPctB to 100.",
        },
        faultPctB: {
          type: "number",
          description:
            "Percentage of fault (0-100) assigned to Party B. Must sum with faultPctA to 100.",
        },
        verdictReasoning: {
          type: "string",
          description:
            "Authoritative judicial opinion explaining the ruling, citing specific messages, timestamps, or visual proof.",
        },
        orderedRemedy: {
          type: "string",
          description:
            "Concrete, actionable sentence or restitution order (exact dollar split, required apology text, or next step).",
        },
        goldenQuote: {
          type: "string",
          description:
            "The single most damning, revealing, or hilarious verbatim quote from the WhatsApp chat or submission.",
        },
      },
      required: [
        "caseId",
        "verdictWinner",
        "verdictHeadline",
        "faultPctA",
        "faultPctB",
        "verdictReasoning",
        "orderedRemedy",
      ],
    },
  },
  {
    name: TOOL_NAMES.AMEND_VERDICT,
    description:
      "Updates, upholds, or overturns an existing verdict after a counterparty appeal, cross-examination answer, or new exhibit is presented.",
    url: `${baseUrl}/api/ai_tools/${TOOL_NAMES.AMEND_VERDICT}`,
    parameters: {
      type: "object",
      properties: {
        caseId: {
          type: "string",
          description: "The unique ID of the case from the ACTIVE CASE FILE.",
        },
        verdictWinner: {
          type: "string",
          description: "Updated prevailing party or 'Split Liability'.",
        },
        verdictHeadline: {
          type: "string",
          description: "Updated headline ruling (note if upheld or overturned on appeal).",
        },
        faultPctA: {
          type: "number",
          description: "Updated fault percentage (0-100) for Party A.",
        },
        faultPctB: {
          type: "number",
          description: "Updated fault percentage (0-100) for Party B.",
        },
        verdictReasoning: {
          type: "string",
          description: "Updated judicial opinion addressing the new evidence or appeal.",
        },
        orderedRemedy: {
          type: "string",
          description: "Updated final restitution order.",
        },
      },
      required: [
        "caseId",
        "verdictWinner",
        "verdictHeadline",
        "faultPctA",
        "faultPctB",
        "verdictReasoning",
        "orderedRemedy",
      ],
    },
  },
];
