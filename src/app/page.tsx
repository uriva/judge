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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Gavel,
  ImagePlus,
  ArrowRight,
  X,
} from "lucide-react";

export default function HomePage() {
  const router = useRouter();

  // Single unified input state
  const [inputText, setInputText] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState("");

  // Docket Lists
  const [publicCases, setPublicCases] = useState<CaseRecord[]>([]);
  const [myCases, setMyCases] = useState<CaseRecord[]>([]);
  const [loadingDocket, setLoadingDocket] = useState(true);

  const parsedPreview = useMemo(
    () => parseWhatsAppCorrespondence(inputText),
    [inputText]
  );

  const attachFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please attach an image or screenshot.");
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImageDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Global paste listener for screenshots (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            attachFile(file);
            toast.success("Screenshot attached!");
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
    setInputText(`${sample.correspondence}\n\n${sample.contextNote}`);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) attachFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) attachFile(file);
  };

  const handleSummonJudge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !imageDataUrl) {
      toast.error("Paste a WhatsApp chat, describe the dispute, or drop a screenshot first.");
      return;
    }

    setIsSubmitting(true);
    try {
      const effectivePartyA = parsedPreview.speakers[0] || "Party A";
      const effectivePartyB = parsedPreview.speakers[1] || "Party B";

      const autoTitle =
        parsedPreview.speakers.length >= 2
          ? `${effectivePartyA} v. ${effectivePartyB}`
          : inputText.trim()
          ? inputText.trim().split("\n")[0].slice(0, 60)
          : "Visual Evidence Dispute";

      setSubmitStep("Opening courtroom...");
      const creds = await ensureAliceIdentity(effectivePartyA);

      const createRes = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: autoTitle,
          summary:
            inputText.trim().slice(0, 280) ||
            "Analyze the attached visual evidence and issue a decisive verdict.",
          category: imageDataUrl && !inputText.trim() ? "screenshot" : "whatsapp",
          judgePersona: "supreme",
          rawCorrespondence: inputText.trim() || undefined,
          partyAName: effectivePartyA,
          partyBName: effectivePartyB,
          submitterRole: effectivePartyA,
          imageDataUrl: imageDataUrl || undefined,
          isPublic: true,
          publicSignKey: creds.publicSignKey,
        }),
      });

      if (!createRes.ok) {
        throw new Error("Failed to register case");
      }

      const { case: createdCase } = (await createRes.json()) as {
        case: CaseRecord;
      };
      saveLocalCaseId(createdCase.id);

      setSubmitStep("Summoning The Judge...");
      const convRes = await createCaseConversation({
        caseNumber: createdCase.caseNumber,
        title: createdCase.title,
        participantKeys: [creds.publicSignKey],
        credentials: creds,
      });

      if ("conversationId" in convRes && convRes.conversationId) {
        await fetch(`/api/cases/${createdCase.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "link_conversation",
            conversationId: convRes.conversationId,
            triggerJudge: false,
          }),
        });

        const briefLines = [
          `⚖️ **CASE ${createdCase.caseNumber}**`,
        ];
        if (createdCase.rawCorrespondence) {
          briefLines.push(
            `\n\`\`\`\n${createdCase.rawCorrespondence.slice(0, 3500)}\n\`\`\``
          );
        }
        briefLines.push(
          `\nYour Honor, analyze this evidence, log your findings of fact, and issue your official verdict and fault split.`
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
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-10 sm:py-16">
        {/* Clean, focused hero */}
        <div className="text-center space-y-3 mb-8">
          <h1 className="font-serif text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-[1.1]">
            Paste the WhatsApp chat.{" "}
            <span className="italic font-normal text-primary">
              Get a verdict.
            </span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
            Paste a conversation, describe the argument, or drop a screenshot. The AI Judge analyzes the receipts and rules who is at fault.
          </p>
        </div>

        {/* Single Unified Composer */}
        <form
          onSubmit={handleSummonJudge}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`rounded-2xl bg-card border-2 transition-all shadow-sm overflow-hidden ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border focus-within:border-primary/60"
          }`}
        >
          <div className="p-4 sm:p-5 space-y-3">
            <Textarea
              placeholder={`Paste WhatsApp messages, explain the dispute, or press Ctrl+V to paste a screenshot...\n\n[10/18/26, 11:42 PM] Liam: Total for dinner was $840, so $120 each!\n[10/18/26, 11:44 PM] Maya: Wait I only had a $22 salad and tap water...`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={6}
              className="border-0 shadow-none focus-visible:ring-0 p-0 resize-none font-mono text-xs sm:text-sm bg-transparent leading-relaxed"
            />

            {/* Attached Image Preview Chip */}
            {imageDataUrl && (
              <div className="inline-flex items-center gap-3 p-2 pr-3 rounded-xl bg-secondary/70 border border-border">
                <img
                  src={imageDataUrl}
                  alt="Attached evidence"
                  className="h-14 w-14 rounded-lg object-cover border border-border"
                />
                <div className="text-xs">
                  <p className="font-medium text-foreground">Photo Exhibit Attached</p>
                  <p className="text-[11px] text-muted-foreground">
                    Ready for judicial inspection
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setImageDataUrl(null);
                    setImageFile(null);
                  }}
                  className="ml-1 p-1 rounded-full hover:bg-background text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Unified Bottom Action Bar */}
          <div className="px-4 sm:px-5 py-3 bg-secondary/40 border-t border-border flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-card hover:bg-secondary border border-border text-foreground transition-colors">
                <ImagePlus className="w-4 h-4 text-primary" />
                <span>{imageDataUrl ? "Change Photo" : "Add Screenshot / Photo"}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>

              {parsedPreview.isStructuredChat && (
                <span className="hidden sm:inline-block font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                  ✓ {parsedPreview.messages.length} messages ({parsedPreview.speakers.slice(0, 2).join(" vs. ")})
                </span>
              )}
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-10 px-6 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-serif font-bold text-sm gap-2 cursor-pointer"
            >
              <Gavel className="w-4 h-4" />
              <span>
                {isSubmitting ? submitStep || "Summoning..." : "Get Verdict"}
              </span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </form>

        {/* Minimal 1-Click Samples */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
          <span className="text-muted-foreground font-mono text-[11px]">
            Try an example:
          </span>
          {SAMPLE_CASE_PRESETS.map((sample) => (
            <button
              key={sample.label}
              type="button"
              onClick={() => handleLoadSample(sample)}
              className="text-[11px] px-2.5 py-1 rounded-full bg-secondary/70 hover:bg-secondary text-foreground border border-border transition-colors cursor-pointer"
            >
              {sample.label}
            </button>
          ))}
        </div>

        {/* User's Filed Cases (if any) */}
        {myCases.length > 0 && (
          <section className="mt-14">
            <h2 className="font-serif text-lg font-bold text-foreground mb-3">
              Your Cases
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {myCases.map((c) => (
                <CaseDocketCard key={c.id} caseData={c} />
              ))}
            </div>
          </section>
        )}

        {/* Recent Public Rulings */}
        <section className="mt-14">
          <div className="flex items-baseline justify-between mb-4 border-b border-border pb-2">
            <h2 className="font-serif text-xl font-bold text-foreground">
              Recent Verdicts
            </h2>
            <span className="text-xs text-muted-foreground font-mono">
              Public Docket
            </span>
          </div>

          {loadingDocket ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2].map((n) => (
                <div
                  key={n}
                  className="h-44 rounded-2xl bg-card border border-border p-5 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {publicCases.slice(0, 6).map((c) => (
                <CaseDocketCard key={c.id} caseData={c} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function CaseDocketCard({ caseData }: { caseData: CaseRecord }) {
  const hasVerdict = Boolean(caseData.verdictHeadline);
  const faultA = caseData.faultPctA ?? 50;
  const faultB = caseData.faultPctB ?? 50;

  return (
    <Link
      href={`/case/${caseData.id}`}
      className="group flex flex-col justify-between p-4 sm:p-5 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all"
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-mono font-bold text-muted-foreground">
            {caseData.partyAName} v. {caseData.partyBName}
          </span>
          {hasVerdict ? (
            <Badge
              variant="outline"
              className="font-mono text-[10px] bg-primary/10 text-primary border-primary/30"
            >
              Winner: {caseData.verdictWinner}
            </Badge>
          ) : (
            <Badge variant="outline" className="font-mono text-[10px]">
              Deliberating
            </Badge>
          )}
        </div>

        <h3 className="font-serif font-bold text-base text-foreground group-hover:text-primary transition-colors line-clamp-1">
          {caseData.title}
        </h3>

        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {hasVerdict ? `"${caseData.verdictHeadline}"` : caseData.summary}
        </p>
      </div>

      {hasVerdict && (
        <div className="pt-3 mt-3 border-t border-border/70 space-y-1.5">
          <div className="flex justify-between text-[10px] font-mono font-semibold text-muted-foreground">
            <span>
              {caseData.partyAName}: {faultA}% fault
            </span>
            <span>
              {caseData.partyBName}: {faultB}% fault
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden bg-muted flex">
            <div className="h-full bg-red-600" style={{ width: `${faultA}%` }} />
            <div className="h-full bg-blue-600" style={{ width: `${faultB}%` }} />
          </div>
        </div>
      )}
    </Link>
  );
}
