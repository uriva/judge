"use client";

import Link from "next/link";
import { Gavel, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NavbarProps {
  showNewCaseButton?: boolean;
}

export function Navbar({ showNewCaseButton = false }: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-md">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
            <Gavel className="w-4 h-4" />
          </div>
          <span className="font-serif font-extrabold text-lg tracking-tight text-foreground">
            THE JUDGE
          </span>
        </Link>

        {showNewCaseButton && (
          <Link href="/">
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 rounded-lg text-xs font-medium gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Case</span>
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
