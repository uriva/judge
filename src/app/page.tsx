"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CaseRecord } from "@/lib/db";
import {
  parseWhatsAppCorrespondence,
  SAMPLE_CASE_PRESETS,
  type SampleCasePreset,
} from "@/lib/whatsapp-parser";
import {
  ensureAliceIdentity,
  createCaseConversation,
  sendOpeningCaseBrief,
} from "@/lib/alice-and-bot";
import { getLocalCaseIds, saveLocalCaseId } from "@/lib/case-storage";
import { Navbar } from "@/components/Navbar";
import { WhatsAppTranscriptView } from "@/components/WhatsAppTranscriptView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Gavel,
  Scale,
  Upload,
  Sparkles,
  MessageSquareQuote,
  Camera,
  ArrowRight,
  Flame,
  Receipt,
  HeartCrack,
  CheckCircle2,
  X,
  Globe,
  ShieldCheck,
  Quote,
} from "lucide-react";

const PERSONA_OPTIONS = [
  {
    id: "supreme" as const,
    name: "Supreme Arbitrator",
    tagline: "Objective, razor-sharp, cites logic & social contract",
    icon: Scale,
  },
  {
    id: "small_claims" as const,
    name: "Small Claims & Receipts",
    tagline: "Exact dollar splits, contracts & financial math",
    icon: Receipt,
  },
  {
    id: "relationship" as const,
    name: "Relationship Tribunal",
    tagline: "Roommates, dating, boundaries & texting tone",
    icon: HeartCrack,
  },
  {
    id: "roast" as const,
    name: "Roast Court (No Mercy)",
    tagline: "Brutally funny ruling that calls out delusion",
    icon: Flame,
  },
];

export default function HomePage() {
  const router = useRouter();

  // Intake Console State
  const [correspondence, setCorrespondence] = useState("");
  const [summaryQuestion, setSummaryQuestion] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [partyA, setPartyA] = useState("");
  const [partyB, setPartyB] = useState("");
  const [persona, setPersona] = useState<
    "supreme" | "small_claims" | "relationship" | "roast"
  >("supreme");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageCaption, setImageCaption] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState("");

  // Docket Lists
  const [publicCases, setPublicCases] = useState<CaseRecord[]>([]);
  const [myCases, setMyCases] = useState<CaseRecord[]>([]);
  const [loadingDocket, setLoadingDocket] = useState(true);

  // Live parse WhatsApp correspondence
  const parsedPreview = useMemo(
    () => parseWhatsAppCorrespondence(correspondence),
    [correspondence]
  );

  // Auto-populate Party A and Party B when speakers are detected in pasted WhatsApp text
  useEffect(() => {
    if (parsedPreview.speakers.length >= 1 && !partyA) {
      setPartyA(parsedPreview.speakers[0]);
    }
    if (parsedPreview.speakers.length >= 2 && !partyB) {
      setPartyB(parsedPreview.speakers[1]);
    }
  }, [parsedPreview.speakers, partyA, partyB]);

  // Global paste listener for screenshots (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === "string") {
                setImageDataUrl(reader.result);
                toast.success("Screenshot pasted into Evidence Locker!");
              }
            };
            reader.readAsDataURL(file);
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  // Load Public Docket & User's Local Cases
  useEffect(() => {
    const localIds = getLocalCaseIds();
    const query =
      localIds.length > 0 ? `?ids=${encodeURIComponent(localIds.join(","))}` : "";
    fetch(`/api/cases${query}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.cases) setPublicCases(data.cases);
        if (data.myCases) setMyCases(data.myCases);
      })
      .catch(console.error)
      .finally(() => setLoadingDocket(false));
  }, []);

  const handleLoadSample = (sample: SampleCasePreset) => {
    setCorrespondence(sample.correspondence);
    setSummaryQuestion(sample.contextNote);
    setCaseTitle(sample.title);
    setPartyA(sample.partyA);
    setPartyB(sample.partyB);
    setPersona(sample.persona);
    toast.info(`Loaded sample case: "${sample.label}"`);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImageDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSummonJudge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correspondence.trim() && !imageDataUrl && !summaryQuestion.trim()) {
      toast.error(
        "Paste a WhatsApp correspondence, upload a photo/screenshot, or describe the dispute first!"
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const effectivePartyA =
        partyA.trim() || parsedPreview.speakers[0] || "Party A";
      const effectivePartyB =
        partyB.trim() || parsedPreview.speakers[1] || "Party B";

      setSubmitStep("Swearing in your courtroom identity...");
      const creds = await ensureAliceIdentity(effectivePartyA);

      setSubmitStep("Filing exhibits onto the official docket...");
      const createRes = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:
            caseTitle.trim() ||
            (summaryQuestion.trim()
              ? summaryQuestion.trim().slice(0, 65)
              : `${effectivePartyA} v. ${effectivePartyB}`),
          summary:
            summaryQuestion.trim() ||
            `Determine who is in the right between ${effectivePartyA} and ${effectivePartyB} based on the submitted evidence.`,
          category: imageDataUrl && !correspondence.trim() ? "screenshot" : "whatsapp",
          judgePersona: persona,
          rawCorrespondence: correspondence.trim() || undefined,
          partyAName: effectivePartyA,
          partyBName: effectivePartyB,
          submitterRole: effectivePartyA,
          imageDataUrl: imageDataUrl || undefined,
          imageCaption: imageCaption.trim() || undefined,
          isPublic,
          publicSignKey: creds.publicSignKey,
        }),
      });

      if (!createRes.ok) {
        throw new Error("Failed to register case on docket");
      }

      const { case: createdCase } = (await createRes.json()) as {
        case: CaseRecord;
      };
      saveLocalCaseId(createdCase.id);

      setSubmitStep("Opening encrypted courtroom channel with The Judge...");
      const convRes = await createCaseConversation({
        caseNumber: createdCase.caseNumber,
        title: createdCase.title,
        participantKeys: [creds.publicSignKey],
        credentials: creds,
      });

      if ("conversationId" in convRes && convRes.conversationId) {
        // Link conversationId in Postgres BEFORE sending the first message so remote_config has full context!
        await fetch(`/api/cases/${createdCase.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "link_conversation",
            conversationId: convRes.conversationId,
            triggerJudge: false,
          }),
        });

        setSubmitStep("Delivering WhatsApp transcript & exhibits to the Bench...");
        const briefLines = [
          `⚖️ **OFFICIAL CASE FILING — ${createdCase.caseNumber}**`,
          `**Case:** ${createdCase.title} (${createdCase.partyAName} v. ${createdCase.partyBName})`,
          `**Filed by:** ${createdCase.submitterRole}`,
          `**Question Before the Court:** ${createdCase.summary}`,
        ];
        if (createdCase.rawCorrespondence) {
          briefLines.push(
            `\n**Submitted WhatsApp / Text Correspondence:**\n\`\`\`\n${createdCase.rawCorrespondence.slice(
              0,
              3500
            )}\n\`\`\``
          );
        }
        if (createdCase.imageCaption) {
          briefLines.push(
            `\n**Visual Evidence Note:** ${createdCase.imageCaption}`
          );
        }
        briefLines.push(
          `\nYour Honor, please analyze the evidence, log key findings of fact, and issue your official verdict and fault split.`
        );

        await sendOpeningCaseBrief({
          conversationId: convRes.conversationId,
          credentials: creds,
          briefText: briefLines.join("\n"),
          imageFile,
        });
      }

      router.push(`/case/${createdCase.id}`);
    } catch (err: any) {
      console.error("Error filing case:", err);
      toast.error(err?.message || "Could not file case");
      setIsSubmitting(false);
      setSubmitStep("");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar
        onNewCaseClick={() => {
          document
            .getElementById("file-case")
            ?.scrollIntoView({ behavior: "smooth" });
        }}
      />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Hero Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-primary/10 border border-primary/25 text-primary font-mono text-[11px] uppercase tracking-widest font-bold">
            <Gavel className="w-3.5 h-3.5" />
            <span>The People&apos;s AI Tribunal • Court is in Session</span>
          </div>

          <h1 className="font-serif text-4xl sm:text-6xl font-extrabold tracking-tight text-foreground leading-[1.08]">
            Paste the WhatsApp chat.{" "}
            <span className="italic font-normal text-primary">
              Drop the photo.
            </span>{" "}
            Get an official verdict.
          </h1>

          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Done arguing in circles? Submit your raw WhatsApp correspondence, a screenshot, or a photo of the crime scene. The Honorable AI Judge dissects the timestamps, fact-checks external claims on the web, assigns exact fault percentages, and issues a shareable Verdict Card.
          </p>
        </div>

        {/* Immediate Evidence Filing Console */}
        <section
          id="file-case"
          className="max-w-4xl mx-auto rounded-3xl bg-card border-2 border-border shadow-md overflow-hidden"
        >
          {/* Console Top Bar + Sample Case Presets */}
          <div className="bg-secondary/70 border-b border-border px-5 sm:px-7 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-primary" />
              <span className="font-mono text-xs uppercase tracking-wider font-bold text-foreground">
                Official Evidence Intake Desk
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-mono text-muted-foreground mr-1">
                Try a sample dispute:
              </span>
              {SAMPLE_CASE_PRESETS.map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  onClick={() => handleLoadSample(sample)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-card hover:bg-primary hover:text-primary-foreground border border-border transition-colors cursor-pointer"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSummonJudge} className="p-5 sm:p-7 space-y-6">
            {/* Step 1: WhatsApp Correspondence OR Photo Upload */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left 7 cols: Paste WhatsApp Chat */}
              <div className="lg:col-span-7 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono uppercase tracking-wider font-bold text-foreground flex items-center gap-1.5">
                    <MessageSquareQuote className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <span>1. Paste WhatsApp / Chat Correspondence</span>
                  </label>
                  {parsedPreview.messages.length > 0 && (
                    <Badge
                      variant="outline"
                      className="font-mono text-[10px] bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30"
                    >
                      ✓ {parsedPreview.messages.length} messages •{" "}
                      {parsedPreview.speakers.length} speakers detected
                    </Badge>
                  )}
                </div>

                <Textarea
                  placeholder={`Paste copied WhatsApp messages here...\nExample:\n[10/18/26, 2:14 PM] Maya: You said you'd split the Uber!!\n[10/18/26, 2:15 PM] Liam: I said if we left before midnight!`}
                  value={correspondence}
                  onChange={(e) => setCorrespondence(e.target.value)}
                  rows={6}
                  className="font-mono text-xs bg-background/70 border-border leading-relaxed"
                />

                {/* Live Parsed WhatsApp Bubble Preview */}
                {parsedPreview.isStructuredChat && (
                  <div className="pt-1">
                    <WhatsAppTranscriptView
                      messages={parsedPreview.messages}
                      partyAName={partyA || parsedPreview.speakers[0]}
                      maxHeightClass="max-h-44"
                    />
                  </div>
                )}
              </div>

              {/* Right 5 cols: Drop Photo / Screenshot */}
              <div className="lg:col-span-5 flex flex-col justify-between space-y-2">
                <label className="text-xs font-mono uppercase tracking-wider font-bold text-foreground flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-primary" />
                  <span>2. Or Drop a Photo / Screenshot (Ctrl+V)</span>
                </label>

                {!imageDataUrl ? (
                  <label className="flex-1 min-h-[148px] rounded-2xl border-2 border-dashed border-border hover:border-primary/60 bg-background/50 hover:bg-primary/5 transition-all flex flex-col items-center justify-center p-4 text-center cursor-pointer gap-2">
                    <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-primary">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-foreground">
                        Click to upload or press{" "}
                        <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono text-[10px]">
                          Ctrl+V
                        </kbd>
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        WhatsApp screenshot, receipt, parking job, or messy sink
                      </p>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                ) : (
                  <div className="flex-1 rounded-2xl border-2 border-primary/40 bg-background/70 p-3 space-y-2 relative">
                    <button
                      type="button"
                      onClick={() => {
                        setImageDataUrl(null);
                        setImageFile(null);
                      }}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <img
                      src={imageDataUrl}
                      alt="Uploaded Evidence Preview"
                      className="max-h-32 mx-auto rounded-lg object-contain"
                    />
                    <Input
                      placeholder="Caption this photo (e.g. 'How he left the kitchen')"
                      value={imageCaption}
                      onChange={(e) => setImageCaption(e.target.value)}
                      className="h-8 text-xs bg-card"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: Parties & The Core Question */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="space-y-1">
                <label className="text-[11px] font-mono uppercase text-muted-foreground font-semibold">
                  Party A (Petitioner / You)
                </label>
                <Input
                  placeholder="e.g. Maya"
                  value={partyA}
                  onChange={(e) => setPartyA(e.target.value)}
                  className="h-9 text-xs bg-background/70"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-mono uppercase text-muted-foreground font-semibold">
                  Party B (Counterparty)
                </label>
                <Input
                  placeholder="e.g. Liam"
                  value={partyB}
                  onChange={(e) => setPartyB(e.target.value)}
                  className="h-9 text-xs bg-background/70"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-mono uppercase text-muted-foreground font-semibold">
                  What is the question for the Judge?
                </label>
                <Input
                  placeholder="e.g. Should I pay $120 or $43?"
                  value={summaryQuestion}
                  onChange={(e) => setSummaryQuestion(e.target.value)}
                  className="h-9 text-xs bg-background/70"
                />
              </div>
            </div>

            {/* Step 3: Select Judicial Persona */}
            <div className="space-y-2">
              <label className="text-xs font-mono uppercase tracking-wider font-bold text-foreground block">
                3. Select Judicial Standard
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {PERSONA_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = persona === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPersona(opt.id)}
                      className={`text-left p-3 rounded-xl border-2 transition-all cursor-pointer ${
                        active
                          ? "border-primary bg-primary/10 shadow-2xs"
                          : "border-border bg-background/50 hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon
                          className={`w-4 h-4 ${
                            active ? "text-primary" : "text-muted-foreground"
                          }`}
                        />
                        <span className="font-serif font-bold text-xs text-foreground">
                          {opt.name}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {opt.tagline}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Submit Bar */}
            <div className="pt-2 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                <span>
                  Publish ruling to the Public Court Docket (uncheck for private chamber)
                </span>
              </label>

              <Button
                type="submit"
                size="lg"
                disabled={isSubmitting}
                className="w-full sm:w-auto h-12 px-8 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-serif font-bold text-base gap-2.5 shadow-sm cursor-pointer"
              >
                <Gavel className="w-5 h-5" />
                <span>
                  {isSubmitting
                    ? submitStep || "Summoning The Judge..."
                    : "Summon The Judge — Get Verdict"}
                </span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </form>
        </section>

        {/* Assurances / Capabilities Strip */}
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-6 pt-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            Instant Blame Split (0–100%)
          </span>
          <span className="flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-primary" />
            Live Web Fact-Checking & Precedents
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Counterparty Summons & Appeal Link
          </span>
        </div>

        {/* User's Filed Cases (if any) */}
        {myCases.length > 0 && (
          <section className="mt-14">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-serif text-2xl font-extrabold text-foreground">
                  Your Courtroom Dockets
                </h2>
                <p className="text-xs text-muted-foreground">
                  Cases you filed or joined from this browser
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {myCases.map((c) => (
                <CaseDocketCard key={c.id} caseData={c} />
              ))}
            </div>
          </section>
        )}

        {/* Public Court Docket: Recent Verdicts */}
        <section className="mt-16 sm:mt-20">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-6 border-b-2 border-double border-border pb-4">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-widest text-primary font-bold">
                Public Court Records
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl font-extrabold text-foreground">
                Recent Rulings from the Bench
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Inspect the WhatsApp evidence, fault splits, and judicial remedies—or enter any courtroom to cross-examine.
            </p>
          </div>

          {loadingDocket ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1, 2].map((n) => (
                <div
                  key={n}
                  className="h-64 rounded-2xl bg-card border-2 border-border p-6 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {publicCases.map((c) => (
                <CaseDocketCard key={c.id} caseData={c} featured />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-border py-8 px-4 sm:px-6 lg:px-8 bg-card/60 text-xs text-muted-foreground mt-16">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Gavel className="w-4 h-4 text-primary" />
            <span className="font-serif font-bold text-foreground">
              THE HONORABLE JUDGE
            </span>
            <span>—</span>
            <span>Settling WhatsApp disputes, group chat drama & real-world crimes</span>
          </div>
          <div className="font-mono text-[11px]">
            Powered by prompt2bot & Alice & Bot • Render Postgres
          </div>
        </div>
      </footer>
    </div>
  );
}

function CaseDocketCard({
  caseData,
  featured = false,
}: {
  caseData: CaseRecord;
  featured?: boolean;
}) {
  const hasVerdict = Boolean(caseData.verdictHeadline);
  const faultA = caseData.faultPctA ?? 50;
  const faultB = caseData.faultPctB ?? 50;

  return (
    <Link
      href={`/case/${caseData.id}`}
      className="group flex flex-col justify-between p-5 sm:p-6 rounded-2xl bg-card border-2 border-border hover:border-primary/60 shadow-2xs hover:shadow-md transition-all"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-secondary text-foreground border border-border">
              {caseData.caseNumber}
            </span>
            <Badge
              variant="outline"
              className={`font-mono text-[10px] uppercase font-bold ${
                hasVerdict
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-amber-500/10 text-amber-800 border-amber-500/30"
              }`}
            >
              {hasVerdict
                ? `Winner: ${caseData.verdictWinner}`
                : "Deliberating"}
            </Badge>
          </div>

          <span className="font-mono text-[10px] text-muted-foreground">
            Code: {caseData.appealCode}
          </span>
        </div>

        <div>
          <div className="text-xs font-mono font-bold text-muted-foreground">
            {caseData.partyAName} v. {caseData.partyBName}
          </div>
          <h3 className="font-serif font-extrabold text-lg sm:text-xl text-foreground group-hover:text-primary transition-colors line-clamp-1">
            {caseData.title}
          </h3>
        </div>

        {hasVerdict ? (
          <div className="p-3.5 rounded-xl bg-primary/6 border-l-4 border-primary space-y-1">
            <p className="font-serif font-bold text-sm text-foreground leading-snug line-clamp-2">
              &ldquo;{caseData.verdictHeadline}&rdquo;
            </p>
            {caseData.orderedRemedy && (
              <p className="text-[11px] text-muted-foreground line-clamp-2">
                <strong className="text-foreground">Order:</strong>{" "}
                {caseData.orderedRemedy}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {caseData.summary}
          </p>
        )}

        {featured && caseData.goldenQuote && (
          <div className="flex items-start gap-2 text-[11px] italic text-muted-foreground bg-secondary/50 px-3 py-2 rounded-lg">
            <Quote className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <span className="line-clamp-2">
              &ldquo;{caseData.goldenQuote}&rdquo;
            </span>
          </div>
        )}
      </div>

      <div className="pt-4 mt-4 border-t border-border space-y-2.5">
        {hasVerdict && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-mono font-bold">
              <span className="text-red-700 dark:text-red-400">
                {caseData.partyAName}: {faultA}% Fault
              </span>
              <span className="text-blue-700 dark:text-blue-400">
                {caseData.partyBName}: {faultB}% Fault
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full overflow-hidden bg-muted flex">
              <div
                className="h-full bg-red-600"
                style={{ width: `${faultA}%` }}
              />
              <div
                className="h-full bg-blue-600"
                style={{ width: `${faultB}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <span className="font-mono text-[11px]">
            {caseData.findings.length} findings •{" "}
            {caseData.parsedMessages.length || 1} chat msgs
          </span>
          <span className="text-primary font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
            Enter Courtroom <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
