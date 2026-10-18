"use client";

import type { ParsedChatMessage } from "@/lib/whatsapp-parser";
import { MessageSquareQuote } from "lucide-react";

interface WhatsAppTranscriptViewProps {
  messages: ParsedChatMessage[];
  rawText?: string;
  partyAName?: string;
  maxHeightClass?: string;
}

export function WhatsAppTranscriptView({
  messages,
  rawText,
  partyAName,
  maxHeightClass = "max-h-72",
}: WhatsAppTranscriptViewProps) {
  if ((!messages || messages.length === 0) && !rawText) {
    return null;
  }

  // Fallback for unstructured text
  if (!messages || messages.length < 2) {
    return (
      <div
        className={`rounded-xl border border-border bg-[#efeae2] dark:bg-[#161b18] p-3.5 overflow-y-auto ${maxHeightClass}`}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-emerald-800 dark:text-emerald-400 mb-2">
          <MessageSquareQuote className="w-3.5 h-3.5" />
          <span>Submitted Correspondence</span>
        </div>
        <pre className="text-xs font-sans whitespace-pre-wrap leading-relaxed text-foreground/90">
          {rawText}
        </pre>
      </div>
    );
  }

  const firstSpeaker = partyAName || messages[0]?.sender;

  return (
    <div
      className={`rounded-xl border border-emerald-900/20 bg-[#efeae2] dark:bg-[#121916] p-3.5 overflow-y-auto space-y-2 ${maxHeightClass}`}
    >
      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-emerald-900/70 dark:text-emerald-400/80 pb-1.5 border-b border-emerald-900/10">
        <span>WhatsApp Evidence Transcript</span>
        <span>{messages.length} Messages Verified</span>
      </div>

      <div className="space-y-2 pt-1">
        {messages.map((msg) => {
          const isPartyA =
            msg.sender.toLowerCase() === firstSpeaker?.toLowerCase();

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${
                isPartyA ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-xs shadow-2xs border ${
                  isPartyA
                    ? "bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] border-emerald-500/20 rounded-tr-xs"
                    : "bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] border-black/5 rounded-tl-xs"
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-0.5">
                  <span
                    className={`font-bold text-[11px] ${
                      isPartyA
                        ? "text-emerald-800 dark:text-emerald-300"
                        : "text-amber-800 dark:text-amber-300"
                    }`}
                  >
                    {msg.sender}
                  </span>
                  {msg.timestamp && (
                    <span className="font-mono text-[9px] opacity-60">
                      {msg.timestamp}
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap leading-snug">{msg.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
