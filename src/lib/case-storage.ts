"use client";

const CASES_STORAGE_KEY = "judge_my_case_ids";

export function getLocalCaseIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CASES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalCaseId(caseId: string): void {
  if (typeof window === "undefined" || !caseId) return;
  try {
    const existing = getLocalCaseIds();
    if (!existing.includes(caseId)) {
      localStorage.setItem(
        CASES_STORAGE_KEY,
        JSON.stringify([caseId, ...existing].slice(0, 50))
      );
    }
  } catch {
    // ignore storage errors
  }
}
