"use client";

import type { CaseRecord } from "@/lib/db";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Gavel,
  Share2,
  Printer,
  Copy,
  Quote,
  Scale,
  Check,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface VerdictCertificateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseData: CaseRecord;
}

export function VerdictCertificateModal({
  open,
  onOpenChange,
  caseData,
}: VerdictCertificateModalProps) {
  const [copied, setCopied] = useState(false);

  const faultA = caseData.faultPctA ?? 50;
  const faultB = caseData.faultPctB ?? 50;

  const caseUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/case/${caseData.id}`
      : `https://judge-court.onrender.com/case/${caseData.id}`;

  const handleCopyVerdictLink = () => {
    navigator.clipboard.writeText(caseUrl);
    setCopied(true);
    toast.success("Official Verdict & Appeal link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsAppShare = () => {
    const shareText = `⚖️ *OFFICIAL AI COURT VERDICT (${caseData.caseNumber})*\n*${caseData.title}*\n\n🏆 *Prevailing Party:* ${caseData.verdictWinner}\n📊 *Fault Split:* ${caseData.partyAName} (${faultA}%) vs. ${caseData.partyBName} (${faultB}%)\n\n💬 *Ruling:* "${caseData.verdictHeadline}"\n📜 *Order:* ${caseData.orderedRemedy}\n\n👉 View full docket or file an appeal (Code: ${caseData.appealCode}):\n${caseUrl}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(shareText)}`,
      "_blank"
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-2 border-border p-0 overflow-hidden">
        <div className="p-6 sm:p-8 space-y-6 max-h-[88vh] overflow-y-auto">
          {/* Official Court Header */}
          <DialogHeader className="border-b-2 border-double border-border pb-5 text-center space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
              <span>{caseData.caseNumber}</span>
              <span>SUPREME DIGITAL TRIBUNAL</span>
              <span>APPEAL CODE: {caseData.appealCode}</span>
            </div>

            <div className="pt-2 flex justify-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-md border-2 border-primary text-primary font-mono font-bold text-xs uppercase tracking-widest animate-stamp">
                <Gavel className="w-4 h-4" />
                {caseData.status === "final_verdict"
                  ? "FINAL APPELLATE DECREE"
                  : "OFFICIAL VERDICT RENDERED"}
              </div>
            </div>

            <DialogTitle className="font-serif text-2xl sm:text-3xl font-extrabold text-foreground pt-1">
              {caseData.partyAName} <span className="italic font-normal text-muted-foreground">v.</span>{" "}
              {caseData.partyBName}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">{caseData.title}</p>
          </DialogHeader>

          {/* Headline Ruling */}
          <div className="p-5 rounded-xl bg-primary/8 border-l-4 border-primary space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-primary font-bold">
                Sylabus of the Court
              </span>
              <Badge className="bg-primary text-primary-foreground font-mono text-[10px]">
                Prevailing: {caseData.verdictWinner || "Split Liability"}
              </Badge>
            </div>
            <p className="font-serif text-lg sm:text-xl font-bold text-foreground leading-snug">
              &ldquo;{caseData.verdictHeadline}&rdquo;
            </p>
          </div>

          {/* Blame Split Bar */}
          <div className="p-4 rounded-xl bg-secondary/60 border border-border space-y-2.5">
            <div className="flex items-center justify-between text-xs font-mono font-bold">
              <span className="text-red-700 dark:text-red-400">
                {caseData.partyAName}: {faultA}% Fault
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Apportionment of Liability
              </span>
              <span className="text-blue-700 dark:text-blue-400">
                {caseData.partyBName}: {faultB}% Fault
              </span>
            </div>
            <div className="w-full h-4 rounded-full overflow-hidden bg-muted flex border border-border">
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
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-600/30 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-amber-800 dark:text-amber-300 font-bold">
                <Quote className="w-3.5 h-3.5" />
                <span>Key Exhibit Quote Cited by the Bench</span>
              </div>
              <p className="text-xs italic text-foreground/90 pl-5">
                &ldquo;{caseData.goldenQuote}&rdquo;
              </p>
            </div>
          )}

          {/* Judicial Reasoning */}
          {caseData.verdictReasoning && (
            <div className="space-y-1.5">
              <h4 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                Opinion of The Honorable Judge
              </h4>
              <p className="text-xs sm:text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                {caseData.verdictReasoning}
              </p>
            </div>
          )}

          {/* Ordered Remedy */}
          {caseData.orderedRemedy && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-600/30 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-emerald-800 dark:text-emerald-300 font-bold">
                <Scale className="w-3.5 h-3.5" />
                <span>Ordered Remedy & Restitution</span>
              </div>
              <p className="text-xs sm:text-sm font-semibold text-foreground leading-relaxed">
                {caseData.orderedRemedy}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-2.5">
            <Button
              onClick={handleWhatsAppShare}
              className="flex-1 min-w-[190px] h-10 rounded-xl bg-[#1E7E52] hover:bg-[#176642] text-white text-xs font-semibold gap-2"
            >
              <Share2 className="w-4 h-4" />
              Send Verdict to WhatsApp
            </Button>

            <Button
              variant="outline"
              onClick={handleCopyVerdictLink}
              className="h-10 rounded-xl text-xs font-medium gap-1.5"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {copied ? "Copied Link" : "Copy Appeal Link"}
            </Button>

            <Button
              variant="ghost"
              onClick={() => window.print()}
              className="h-10 rounded-xl text-xs font-medium gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
