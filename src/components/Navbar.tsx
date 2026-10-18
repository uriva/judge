"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Gavel, Scale, ArrowRight, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface NavbarProps {
  onNewCaseClick?: () => void;
}

export function Navbar({ onNewCaseClick }: NavbarProps) {
  const router = useRouter();
  const [appealCode, setAppealCode] = useState("");

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = appealCode.trim().toUpperCase();
    if (!cleaned) return;
    router.push(`/case/${cleaned}`);
  };

  return (
    <header className="sticky top-0 z-40 border-b-2 border-border bg-card/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
            <Gavel className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-serif font-extrabold text-lg sm:text-xl tracking-tight text-foreground">
                THE JUDGE
              </span>
              <span className="hidden sm:inline-block font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded bg-secondary text-secondary-foreground border border-border">
                AI Tribunal
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground hidden sm:block">
              Paste WhatsApp Receipts or Photo Evidence • Instant Ruling
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-2.5">
          <form
            onSubmit={handleCodeSubmit}
            className="hidden md:flex items-center gap-1.5"
          >
            <Input
              type="text"
              placeholder="Summons Code (e.g. LISBON)"
              value={appealCode}
              onChange={(e) => setAppealCode(e.target.value)}
              className="h-9 w-48 font-mono text-xs uppercase bg-background/80 border-border"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="h-9 px-3 text-xs font-medium gap-1"
            >
              Open Docket
              <ArrowRight className="w-3 h-3" />
            </Button>
          </form>

          {onNewCaseClick ? (
            <Button
              size="sm"
              onClick={onNewCaseClick}
              className="h-9 px-3.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold gap-1.5 shadow-xs"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>File New Case</span>
            </Button>
          ) : (
            <Link href="/#file-case">
              <Button
                size="sm"
                className="h-9 px-3.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold gap-1.5 shadow-xs"
              >
                <Scale className="w-3.5 h-3.5" />
                <span>File New Case</span>
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
