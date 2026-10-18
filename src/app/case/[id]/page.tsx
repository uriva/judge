import type { Metadata } from "next";
import { getCaseByAppealCode, getCaseById } from "@/lib/db";
import CourtroomClient from "./CourtroomClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const c =
      (await getCaseById(id)) ||
      (id.length <= 8 ? await getCaseByAppealCode(id) : null);

    if (c) {
      const title = c.verdictHeadline
        ? `Verdict (${c.caseNumber}): ${c.title} — THE JUDGE`
        : `${c.caseNumber}: ${c.title} — THE JUDGE`;
      const description = c.verdictHeadline
        ? `Ruling: "${c.verdictHeadline}" (${c.partyAName} ${c.faultPctA ?? 50}% Fault vs. ${c.partyBName} ${c.faultPctB ?? 50}% Fault)`
        : c.summary;

      return {
        title,
        description,
        openGraph: {
          title,
          description,
          images: [`/api/og?id=${c.id}`],
        },
        twitter: {
          card: "summary_large_image",
          title,
          description,
          images: [`/api/og?id=${c.id}`],
        },
      };
    }
  } catch {
    // ignore metadata fetch error
  }

  return {
    title: "Courtroom Session — THE JUDGE",
  };
}

export default async function CasePage({ params }: PageProps) {
  const { id } = await params;
  return <CourtroomClient caseIdOrCode={id} />;
}
