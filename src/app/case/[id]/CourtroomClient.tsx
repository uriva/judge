"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import type { CaseRecord } from "@/lib/db";
import {
  ensureAliceIdentity,
  loadLocalCredentials,
  createCaseConversation,
  sendOpeningCaseBrief,
  type Credentials,
} from "@/lib/alice-and-bot";
import { saveLocalCaseId } from "@/lib/case-storage";
import { PERSONA_DESCRIPTIONS } from "@/lib/judge-prompt";
import { Navbar } from "@/components/Navbar";
import { WhatsAppTranscriptView } from "@/components/WhatsAppTranscriptView";
import { VerdictCertificateModal } from "@/components/VerdictCertificateModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Gavel,
  Scale,
  Share2,
  FileText,
  Globe,
  AlertTriangle,
  CheckCircle2,
  Upload,
  Copy,
  Check,
  ArrowLeft,
  Quote,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  MessageSquareQuote,
} from "lucide-react";

const AliceChat = dynamic(() => import("@/components/AliceChat"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-card min-h-[500px] rounded-2xl border-2 border-border">
      <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
        Opening Courtroom Bench...
      </span>
    </div>
  ),
});

interface CourtroomClientProps {
  caseIdOrCode: string;
}

export default function CourtroomClient({
  caseIdOrCode,
}: CourtroomClientProps) {
  const [caseData, setCaseData] = useState<CaseRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [credentials, setCredentials] = useState<Credentials | null>(
    loadLocalCredentials
  );
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Additional Exhibit form state
  const [exhibitTitle, setExhibitTitle] = useState("");
  const [exhibitContent, setExhibitContent] = useState("");
  const [exhibitImage, setExhibitImage] = useState<string | null>(null);
  const [submittingExhibit, setSubmittingExhibit] = useState(false);

  // Counter-Appeal form state
  const [appellantName, setAppellantName] = useState("");
  const [appealTestimony, setAppealTestimony] = useState("");
  const [appealImage, setAppealImage] = useState<string | null>(null);
  const [submittingAppeal, setSubmittingAppeal] = useState(false);

  const provisioningRef = useRef(false);
  const celebratedVerdictRef = useRef<string | null>(null);

  const fetchCase = useCallback(async () => {
    try {
      const res = await fetch(`/api/cases/${encodeURIComponent(caseIdOrCode)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setIsLoading(false);
        return;
      }
      const data = await res.json();
      if (data.case) {
        setCaseData(data.case);
        saveLocalCaseId(data.case.id);
      }
    } catch (err) {
      console.error("Error polling case:", err);
    } finally {
      setIsLoading(false);
    }
  }, [caseIdOrCode]);

  useEffect(() => {
    fetchCase();
    const interval = setInterval(fetchCase, 2500);
    return () => clearInterval(interval);
  }, [fetchCase]);

  // Ensure Alice identity
  useEffect(() => {
    if (!credentials) {
      ensureAliceIdentity(caseData?.submitterRole || "Petitioner").then((c) =>
        setCredentials(c)
      );
    }
  }, [credentials, caseData?.submitterRole]);

  // Trigger confetti when a verdict first arrives
  useEffect(() => {
    if (
      caseData?.verdictHeadline &&
      celebratedVerdictRef.current !== caseData.verdictHeadline
    ) {
      if (celebratedVerdictRef.current !== null) {
        // Live transition to verdict!
        toast.success(`Verdict Rendered: "${caseData.verdictHeadline}"`);
        try {
          confetti({
            particleCount: 70,
            spread: 65,
            origin: { y: 0.6 },
          });
        } catch {
          // ignore confetti errors
        }
      }
      celebratedVerdictRef.current = caseData.verdictHeadline;
    } else if (caseData && !caseData.verdictHeadline) {
      celebratedVerdictRef.current = "";
    }
  }, [caseData]);

  // Auto-provision Alice & Bot conversation if case doesn't have one yet (e.g. seed case or direct visit)
  useEffect(() => {
    if (
      !caseData ||
      caseData.conversationId ||
      !credentials ||
      provisioningRef.current
    ) {
      return;
    }

    provisioningRef.current = true;
    (async () => {
      try {
        const convRes = await createCaseConversation({
          caseNumber: caseData.caseNumber,
          title: caseData.title,
          participantKeys: [credentials.publicSignKey],
          credentials,
        });

        if ("conversationId" in convRes && convRes.conversationId) {
          await fetch(`/api/cases/${caseData.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "link_conversation",
              conversationId: convRes.conversationId,
              triggerJudge: false,
            }),
          });

          // Send the opening brief into the chat so the user sees it and the Judge deliberates immediately!
          const briefLines = [
            `⚖️ **OFFICIAL CASE FILING — ${caseData.caseNumber}**`,
            `**Case:** ${caseData.title} (${caseData.partyAName} v. ${caseData.partyBName})`,
            `**Filed by:** ${caseData.submitterRole}`,
            `**Charge / Question:** ${caseData.summary}`,
          ];
          if (caseData.rawCorrespondence) {
            briefLines.push(
              `\n**Submitted WhatsApp / Chat Correspondence:**\n\`\`\`\n${caseData.rawCorrespondence.slice(
                0,
                3500
              )}\n\`\`\``
            );
          }
          if (caseData.imageCaption) {
            briefLines.push(
              `\n**Attached Photo Evidence Note:** ${caseData.imageCaption}`
            );
          }
          briefLines.push(
            `\nYour Honor, please analyze the evidence, log your findings of fact, and issue your official verdict and fault split.`
          );

          let imageFile: File | null = null;
          if (
            caseData.imageDataUrl &&
            caseData.imageDataUrl.startsWith("data:")
          ) {
            try {
              const resp = await fetch(caseData.imageDataUrl);
              const blob = await resp.blob();
              imageFile = new File([blob], "evidence-exhibit.png", {
                type: blob.type || "image/png",
              });
            } catch {
              // ignore conversion error
            }
          }

          await sendOpeningCaseBrief({
            conversationId: convRes.conversationId,
            credentials,
            briefText: briefLines.join("\n"),
            imageFile,
          });

          await fetchCase();
        }
      } catch (err) {
        console.error("Failed to provision courtroom session:", err);
        provisioningRef.current = false;
      }
    })();
  }, [caseData, credentials, fetchCase]);

  const handleImageFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string | null) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setter(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddExhibit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseData) return;
    if (!exhibitTitle.trim() && !exhibitContent.trim() && !exhibitImage) {
      toast.error("Please provide an exhibit description or upload an image.");
      return;
    }

    setSubmittingExhibit(true);
    try {
      const res = await fetch(`/api/cases/${caseData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_exhibit",
          submittedBy: caseData.submitterRole,
          partySide: caseData.partyAName,
          title: exhibitTitle.trim() || "Supplementary Evidence",
          content: exhibitContent.trim() || undefined,
          imageUrl: exhibitImage || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to submit exhibit");
      const data = await res.json();
      setCaseData(data.case);
      setExhibitTitle("");
      setExhibitContent("");
      setExhibitImage(null);
      toast.success(
        "Exhibit added to the Docket! The Honorable Judge has been notified."
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to add exhibit");
    } finally {
      setSubmittingExhibit(false);
    }
  };

  const handleSubmitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseData) return;
    if (!appealTestimony.trim() && !appealImage) {
      toast.error("Please enter your counter-testimony or upload proof.");
      return;
    }

    setSubmittingAppeal(true);
    try {
      const res = await fetch(`/api/cases/${caseData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_appeal",
          appellantName: appellantName.trim() || caseData.partyBName,
          testimony: appealTestimony.trim(),
          imageUrl: appealImage || undefined,
          publicSignKey: credentials?.publicSignKey,
        }),
      });
      if (!res.ok) throw new Error("Failed to file appeal");
      const data = await res.json();
      setCaseData(data.case);
      setAppealTestimony("");
      setAppealImage(null);
      toast.success(
        "Official Appeal Filed! The Judge is conducting an Appellate Review."
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to submit appeal");
    } finally {
      setSubmittingAppeal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar showNewCaseButton />
        <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-4">
          <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <div className="text-center space-y-1">
            <h3 className="font-serif font-bold text-xl text-foreground">
              Convening The Courtroom...
            </h3>
            <p className="text-xs font-mono text-muted-foreground">
              Loading evidentiary record and swearing in The Honorable Judge
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar showNewCaseButton />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Gavel className="w-6 h-6" />
          </div>
          <h2 className="font-serif text-2xl font-bold">Case Not Found</h2>
          <p className="text-xs text-muted-foreground">
            No case docket matched &ldquo;{caseIdOrCode}&rdquo;. Check your 6-character Summons Code or file a new case.
          </p>
          <Link href="/">
            <Button className="rounded-xl text-xs">Return to Filing Desk</Button>
          </Link>
        </div>
      </div>
    );
  }

  const hasVerdict = Boolean(caseData.verdictHeadline);
  const faultA = caseData.faultPctA ?? 50;
  const faultB = caseData.faultPctB ?? 50;
  const personaInfo =
    PERSONA_DESCRIPTIONS[caseData.judgePersona] || PERSONA_DESCRIPTIONS.supreme;

  const caseUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/case/${caseData.id}`
      : `https://judge-khaki-sigma.vercel.app/case/${caseData.id}`;

  const handleShareToWhatsApp = () => {
    const text = hasVerdict
      ? `⚖️ *OFFICIAL AI VERDICT (${caseData.caseNumber})*\n*${caseData.partyAName} v. ${caseData.partyBName}*\n\n🏆 *Prevailing:* ${caseData.verdictWinner}\n📊 *Fault Split:* ${caseData.partyAName} (${faultA}%) | ${caseData.partyBName} (${faultB}%)\n💬 *Ruling:* "${caseData.verdictHeadline}"\n📜 *Order:* ${caseData.orderedRemedy}\n\n👉 View the evidence or file an appeal (Summons Code: ${caseData.appealCode}):\n${caseUrl}`
      : `⚖️ *COURT SUMMONS (${caseData.caseNumber})*\nI just submitted our dispute (${caseData.title}) to The AI Judge.\n\n👉 Enter the courtroom or submit your defense (Code: ${caseData.appealCode}):\n${caseUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handleCopySummons = () => {
    navigator.clipboard.writeText(caseUrl);
    setCopiedCode(true);
    toast.success("Courtroom & Appeal link copied!");
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar showNewCaseButton />

      {/* Courtroom Case Header */}
      <div className="border-b-2 border-border bg-card/85 backdrop-blur-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <Link
              href="/"
              className="mt-1 sm:mt-0 inline-flex items-center justify-center rounded-xl h-8 w-8 border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-secondary text-foreground border border-border">
                  {caseData.caseNumber}
                </span>

                <Badge
                  variant="outline"
                  className={`font-mono text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full ${
                    hasVerdict
                      ? "bg-primary/15 text-primary border-primary/40"
                      : "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30"
                  }`}
                >
                  {caseData.status === "final_verdict"
                    ? "Final Appellate Ruling"
                    : hasVerdict
                    ? "Verdict Issued"
                    : caseData.status === "appealed"
                    ? "Under Appellate Review"
                    : "Judge Deliberating"}
                </Badge>

                <span className="text-[11px] font-mono text-muted-foreground">
                  • {personaInfo.title}
                </span>
              </div>

              <h1 className="font-serif text-lg sm:text-2xl font-extrabold text-foreground leading-tight mt-0.5">
                {caseData.partyAName}{" "}
                <span className="italic font-normal text-muted-foreground">
                  v.
                </span>{" "}
                {caseData.partyBName}{" "}
                <span className="text-muted-foreground font-normal text-sm sm:text-base">
                  — {caseData.title}
                </span>
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {hasVerdict && (
              <Button
                size="sm"
                onClick={() => setCertificateOpen(true)}
                className="h-9 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold gap-1.5 shadow-xs"
              >
                <Gavel className="w-3.5 h-3.5" />
                <span>Verdict Certificate</span>
              </Button>
            )}

            <Button
              size="sm"
              onClick={handleShareToWhatsApp}
              className="h-9 rounded-xl bg-[#1E7E52] hover:bg-[#176642] text-white text-xs font-semibold gap-1.5 shadow-xs"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>
                {hasVerdict ? "Send Verdict to WhatsApp" : "Summon via WhatsApp"}
              </span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopySummons}
              className="h-9 rounded-xl text-xs font-mono gap-1.5"
            >
              {copiedCode ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>Code: {caseData.appealCode}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Live Verdict Banner (appears as soon as issue_verdict is called!) */}
      {hasVerdict && (
        <div className="border-b-2 border-primary/30 bg-gradient-to-r from-primary/10 via-card to-primary/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary text-primary-foreground font-mono text-[10px] font-bold uppercase tracking-widest">
                  <Gavel className="w-3 h-3" /> Official Ruling
                </span>
                <span className="font-mono text-xs font-bold text-foreground">
                  Prevailing Party: {caseData.verdictWinner}
                </span>
              </div>
              <p className="font-serif text-base sm:text-lg font-bold text-foreground">
                &ldquo;{caseData.verdictHeadline}&rdquo;
              </p>
            </div>

            {/* Compact Fault Split Meter */}
            <div className="w-full lg:w-80 bg-card/90 p-2.5 rounded-xl border border-border shrink-0 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono font-bold">
                <span className="text-red-700 dark:text-red-400">
                  {caseData.partyAName}: {faultA}% Fault
                </span>
                <span className="text-blue-700 dark:text-blue-400">
                  {caseData.partyBName}: {faultB}% Fault
                </span>
              </div>
              <div className="w-full h-3 rounded-full overflow-hidden bg-muted flex">
                <div
                  className="h-full bg-red-600 transition-all duration-500"
                  style={{ width: `${faultA}%` }}
                />
                <div
                  className="h-full bg-blue-600 transition-all duration-500"
                  style={{ width: `${faultB}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Split Courtroom Layout */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5 flex flex-col lg:flex-row gap-5 min-h-0">
        {/* Left Column: Live Hearing with The Honorable Judge */}
        <div className="w-full lg:w-[56%] flex flex-col flex-1 min-h-[540px]">
          <div className="flex items-center justify-between pb-2 px-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              <span className="font-serif font-bold text-sm text-foreground">
                Live Courtroom Bench — Cross-Examination & Hearing
              </span>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">
              Answer questions, object, or drop extra proof in chat
            </span>
          </div>

          {credentials && caseData.conversationId ? (
            <AliceChat
              conversationId={caseData.conversationId}
              credentials={credentials}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-card rounded-2xl border-2 border-border text-center space-y-3 min-h-[500px]">
              <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="font-serif font-bold text-base text-foreground">
                Delivering Case File {caseData.caseNumber} to the Bench...
              </p>
              <p className="text-xs text-muted-foreground max-w-xs">
                The Honorable Judge is reading the correspondence and preparing findings of fact.
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Live Courtroom Docket */}
        <div className="w-full lg:w-[44%] flex flex-col bg-card rounded-2xl border-2 border-border p-4 sm:p-5 shadow-xs overflow-hidden min-h-[540px]">
          <div className="flex items-center justify-between border-b-2 border-double border-border pb-3 mb-3">
            <div>
              <h2 className="font-serif font-extrabold text-base sm:text-lg text-foreground flex items-center gap-2">
                <Scale className="w-4 h-4 text-primary" />
                <span>Official Case Docket</span>
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Live findings, web fact-checks, exhibits & appellate record
              </p>
            </div>

            <Badge
              variant="outline"
              className="font-mono text-[10px] border-primary/30 text-primary bg-primary/5"
            >
              {caseData.findings.length} Findings • {caseData.exhibits.length} Exhibits
            </Badge>
          </div>

          <Tabs
            defaultValue="verdict"
            className="flex-1 flex flex-col overflow-hidden"
          >
            <TabsList className="grid grid-cols-4 h-9 rounded-xl bg-secondary p-1 mb-3">
              <TabsTrigger
                value="verdict"
                className="rounded-lg text-[11px] font-semibold"
              >
                Ruling
              </TabsTrigger>
              <TabsTrigger
                value="findings"
                className="rounded-lg text-[11px] font-semibold"
              >
                Findings ({caseData.findings.length + caseData.research.length})
              </TabsTrigger>
              <TabsTrigger
                value="exhibits"
                className="rounded-lg text-[11px] font-semibold"
              >
                Exhibits ({caseData.exhibits.length})
              </TabsTrigger>
              <TabsTrigger
                value="appeal"
                className="rounded-lg text-[11px] font-semibold"
              >
                Appeal
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: VERDICT & REMEDY */}
            <TabsContent
              value="verdict"
              className="flex-1 overflow-y-auto space-y-3.5 pr-1"
            >
              {!hasVerdict ? (
                <div className="p-6 rounded-xl border-2 border-dashed border-border bg-background/50 text-center space-y-3 my-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary">
                    <Gavel className="w-6 h-6 animate-bounce" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-serif font-bold text-lg text-foreground">
                      The Honorable Judge is Deliberating
                    </h3>
                    <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
                      As the Judge examines your WhatsApp correspondence and evidence in the hearing on the left, the official Ruling, Fault Split Meter, and Ordered Remedy will appear here automatically.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5">
                  <div className="p-4 rounded-xl bg-primary/8 border-l-4 border-primary space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-primary font-bold">
                        Official Court Ruling
                      </span>
                      <Badge className="bg-primary text-primary-foreground font-mono text-[10px]">
                        Winner: {caseData.verdictWinner}
                      </Badge>
                    </div>
                    <p className="font-serif text-base sm:text-lg font-bold text-foreground leading-snug">
                      &ldquo;{caseData.verdictHeadline}&rdquo;
                    </p>
                  </div>

                  {/* Fault Split Meter */}
                  <div className="p-3.5 rounded-xl bg-secondary/60 border border-border space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono font-bold">
                      <span className="text-red-700 dark:text-red-400">
                        {caseData.partyAName}: {faultA}% Fault
                      </span>
                      <span className="text-blue-700 dark:text-blue-400">
                        {caseData.partyBName}: {faultB}% Fault
                      </span>
                    </div>
                    <div className="w-full h-3.5 rounded-full overflow-hidden bg-muted flex border border-border">
                      <div
                        className="h-full bg-red-600 transition-all duration-500"
                        style={{ width: `${faultA}%` }}
                      />
                      <div
                        className="h-full bg-blue-600 transition-all duration-500"
                        style={{ width: `${faultB}%` }}
                      />
                    </div>
                  </div>

                  {/* Golden Quote */}
                  {caseData.goldenQuote && (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-600/30 space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-amber-800 dark:text-amber-300 font-bold">
                        <Quote className="w-3 h-3" />
                        <span>Exhibit Quote Cited by the Bench</span>
                      </div>
                      <p className="text-xs italic text-foreground/90">
                        &ldquo;{caseData.goldenQuote}&rdquo;
                      </p>
                    </div>
                  )}

                  {/* Judicial Reasoning */}
                  {caseData.verdictReasoning && (
                    <div className="p-3.5 rounded-xl border border-border bg-background/60 space-y-1.5">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-bold block">
                        Judicial Opinion
                      </span>
                      <p className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap">
                        {caseData.verdictReasoning}
                      </p>
                    </div>
                  )}

                  {/* Ordered Remedy */}
                  {caseData.orderedRemedy && (
                    <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-600/30 space-y-1">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-800 dark:text-emerald-300 font-bold block">
                        Ordered Remedy & Sentence
                      </span>
                      <p className="text-xs font-semibold text-foreground leading-relaxed">
                        {caseData.orderedRemedy}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <Button
                      onClick={() => setCertificateOpen(true)}
                      className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-semibold gap-1.5"
                    >
                      <Gavel className="w-3.5 h-3.5" />
                      Open Verdict Card
                    </Button>
                    <Button
                      onClick={handleShareToWhatsApp}
                      className="flex-1 h-9 rounded-xl bg-[#1E7E52] hover:bg-[#176642] text-white text-xs font-semibold gap-1.5"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      Share on WhatsApp
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* TAB 2: FINDINGS OF FACT & WEB RESEARCH */}
            <TabsContent
              value="findings"
              className="flex-1 overflow-y-auto space-y-3 pr-1"
            >
              {caseData.findings.length === 0 &&
              caseData.research.length === 0 ? (
                <div className="py-10 px-4 text-center space-y-2 text-muted-foreground">
                  <Sparkles className="w-6 h-6 text-primary mx-auto" />
                  <p className="font-serif font-bold text-sm text-foreground">
                    Analyzing Admissions & Receipts
                  </p>
                  <p className="text-xs max-w-xs mx-auto">
                    As the Judge examines the chat timestamps, contradictions, and facts, official Findings of Fact and Web Research citations will populate here.
                  </p>
                </div>
              ) : (
                <>
                  {caseData.findings.map((f) => (
                    <div
                      key={f.id}
                      className="p-3.5 rounded-xl border border-border bg-background/70 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge
                          variant="outline"
                          className={`font-mono text-[9px] uppercase font-bold ${
                            f.impact === "damning"
                              ? "bg-red-500/15 text-red-700 border-red-500/30"
                              : f.impact === "exonerating"
                              ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
                              : "bg-amber-500/15 text-amber-800 border-amber-500/30"
                          }`}
                        >
                          {f.findingType.replace("_", " ")} • {f.impact}
                        </Badge>
                        <span className="font-mono text-[10px] font-bold text-muted-foreground">
                          Re: {f.attributedTo}
                        </span>
                      </div>

                      <p className="text-xs font-medium text-foreground leading-snug">
                        {f.statement}
                      </p>

                      {f.quoteOrProof && (
                        <div className="text-[11px] italic text-muted-foreground bg-secondary/60 px-2.5 py-1.5 rounded-lg border-l-2 border-primary">
                          &ldquo;{f.quoteOrProof}&rdquo;
                        </div>
                      )}
                    </div>
                  ))}

                  {caseData.research.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-primary font-bold">
                        <Globe className="w-3.5 h-3.5" />
                        <span>Judicial Web Research & Fact-Checks</span>
                      </div>
                      {caseData.research.map((r) => (
                        <div
                          key={r.id}
                          className="p-3.5 rounded-xl border border-primary/25 bg-primary/5 space-y-1.5"
                        >
                          <div className="text-[11px] font-mono text-primary font-semibold">
                            Fact-Check: &ldquo;{r.query}&rdquo;
                          </div>
                          <p className="text-xs text-foreground/90 leading-relaxed">
                            {r.factSummary}
                          </p>
                          {r.sourceUrl && (
                            <a
                              href={r.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                            >
                              {r.sourceTitle || "View Source"}{" "}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {/* TAB 3: EXHIBITS & WHATSAPP LOG */}
            <TabsContent
              value="exhibits"
              className="flex-1 overflow-y-auto space-y-4 pr-1"
            >
              {caseData.rawCorrespondence && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                      Exhibit A — WhatsApp Correspondence
                    </span>
                    <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400">
                      {caseData.parsedMessages.length} messages
                    </span>
                  </div>
                  <WhatsAppTranscriptView
                    messages={caseData.parsedMessages}
                    rawText={caseData.rawCorrespondence}
                    partyAName={caseData.partyAName}
                    maxHeightClass="max-h-60"
                  />
                </div>
              )}

              {caseData.imageDataUrl && (
                <div className="space-y-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-bold block">
                    Photographic / Screenshot Evidence
                  </span>
                  <div className="rounded-xl overflow-hidden border border-border bg-secondary/30 p-2">
                    <img
                      src={caseData.imageDataUrl}
                      alt={caseData.imageCaption || "Case visual evidence"}
                      className="max-h-56 w-auto mx-auto rounded-lg object-contain"
                    />
                    {caseData.imageCaption && (
                      <p className="text-[11px] text-center text-muted-foreground mt-1.5">
                        {caseData.imageCaption}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Additional Exhibits list */}
              {caseData.exhibits
                .filter((ex) => ex.exhibitLabel !== "Exhibit A")
                .map((ex) => (
                  <div
                    key={ex.id}
                    className="p-3 rounded-xl border border-border bg-background/70 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="font-bold text-primary uppercase">
                        {ex.exhibitLabel}: {ex.title}
                      </span>
                      <span className="text-muted-foreground">
                        by {ex.submittedBy}
                      </span>
                    </div>
                    {ex.content && (
                      <p className="text-xs whitespace-pre-wrap text-foreground/90">
                        {ex.content}
                      </p>
                    )}
                    {ex.imageUrl && (
                      <img
                        src={ex.imageUrl}
                        alt={ex.title}
                        className="max-h-40 rounded-lg border border-border object-contain"
                      />
                    )}
                  </div>
                ))}

              {/* Add New Exhibit Form */}
              <form
                onSubmit={handleAddExhibit}
                className="p-3.5 rounded-xl border border-border bg-secondary/40 space-y-2.5"
              >
                <span className="font-mono text-[10px] uppercase tracking-wider font-bold text-foreground block">
                  + Submit Additional Receipt / Photo to Docket
                </span>
                <Input
                  placeholder="Exhibit title (e.g. Uber Receipt, Earlier Text)"
                  value={exhibitTitle}
                  onChange={(e) => setExhibitTitle(e.target.value)}
                  className="h-8 text-xs bg-card"
                />
                <Textarea
                  placeholder="Paste additional messages or context..."
                  value={exhibitContent}
                  onChange={(e) => setExhibitContent(e.target.value)}
                  rows={2}
                  className="text-xs bg-card"
                />
                <div className="flex items-center justify-between gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline">
                    <Upload className="w-3.5 h-3.5" />
                    <span>
                      {exhibitImage ? "Image Attached ✓" : "Attach Screenshot"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        handleImageFileSelect(e, setExhibitImage)
                      }
                    />
                  </label>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={submittingExhibit}
                    className="h-8 rounded-lg text-xs"
                  >
                    {submittingExhibit ? "Filing..." : "File Exhibit"}
                  </Button>
                </div>
              </form>
            </TabsContent>

            {/* TAB 4: SUMMON COUNTERPARTY / FILE APPEAL */}
            <TabsContent
              value="appeal"
              className="flex-1 overflow-y-auto space-y-4 pr-1"
            >
              <div className="p-3.5 rounded-xl bg-primary/8 border border-primary/25 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-primary font-bold">
                    Summon {caseData.partyBName} to the Stand
                  </span>
                  <span className="font-mono text-xs font-bold">
                    Code: {caseData.appealCode}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Think {caseData.partyBName} will dispute this ruling? Send them the official Summons link on WhatsApp so they can enter the courtroom or file a formal Counter-Appeal below.
                </p>
                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleShareToWhatsApp}
                    className="flex-1 h-8 rounded-lg bg-[#1E7E52] hover:bg-[#176642] text-white text-xs gap-1.5"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Summon via WhatsApp
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopySummons}
                    className="h-8 rounded-lg text-xs gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    Copy Link
                  </Button>
                </div>
              </div>

              <form
                onSubmit={handleSubmitAppeal}
                className="p-4 rounded-xl border-2 border-border bg-background/70 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-primary" />
                  <h4 className="font-serif font-bold text-sm text-foreground">
                    File Counter-Appeal / Defense ({caseData.partyBName})
                  </h4>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Are you {caseData.partyBName} (or presenting new defense testimony)? Submit your side of the story below. The Honorable Judge will immediately review your appeal and either UPHOLD or OVERTURN the verdict.
                </p>

                <Input
                  placeholder={`Your Name (e.g. ${caseData.partyBName})`}
                  value={appellantName}
                  onChange={(e) => setAppellantName(e.target.value)}
                  className="h-9 text-xs bg-card"
                />

                <Textarea
                  placeholder="State your defense, missing context, or paste the rest of the WhatsApp thread they conveniently left out..."
                  value={appealTestimony}
                  onChange={(e) => setAppealTestimony(e.target.value)}
                  rows={4}
                  className="text-xs bg-card"
                />

                <div className="flex items-center justify-between gap-2 pt-1">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                    <Upload className="w-3.5 h-3.5" />
                    <span>
                      {appealImage
                        ? "Counter-Proof Attached ✓"
                        : "Attach Counter-Screenshot"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleImageFileSelect(e, setAppealImage)}
                    />
                  </label>

                  <Button
                    type="submit"
                    size="sm"
                    disabled={submittingAppeal}
                    className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-semibold gap-1.5"
                  >
                    <Gavel className="w-3.5 h-3.5" />
                    {submittingAppeal
                      ? "Submitting to Bench..."
                      : "File Official Appeal"}
                  </Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <VerdictCertificateModal
        open={certificateOpen}
        onOpenChange={setCertificateOpen}
        caseData={caseData}
      />
    </div>
  );
}
