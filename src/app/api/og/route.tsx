import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { getCaseById } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  let caseNumber = "SUPREME DIGITAL TRIBUNAL";
  let title = "Paste a WhatsApp Chat or Photo. Get an Official AI Verdict.";
  let partyA = "Party A";
  let partyB = "Party B";
  let faultA = 50;
  let faultB = 50;
  let headline =
    "Instant, decisive rulings on group chat drama, bill splits, roommate crimes & real-world disputes.";
  let hasVerdict = false;
  let winner = "";

  if (id) {
    try {
      const c = await getCaseById(id);
      if (c) {
        caseNumber = c.caseNumber;
        title = c.title;
        partyA = c.partyAName;
        partyB = c.partyBName;
        if (c.verdictHeadline) {
          hasVerdict = true;
          headline = `"${c.verdictHeadline}"`;
          faultA = c.faultPctA ?? 50;
          faultB = c.faultPctB ?? 50;
          winner = c.verdictWinner || "";
        } else {
          headline = c.summary;
        }
      }
    } catch {
      // fallback to default OG
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#11100E",
          color: "#F6F1E6",
          padding: "56px 64px",
          border: "12px solid #2A251E",
          fontFamily: "serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                backgroundColor: "#C8322B",
                color: "#FFFFFF",
                padding: "8px 18px",
                borderRadius: "6px",
                fontSize: "20px",
                fontWeight: 800,
                letterSpacing: "2px",
              }}
            >
              {hasVerdict ? "OFFICIAL VERDICT" : "DOCKET FILED"}
            </div>
            <div
              style={{
                fontSize: "22px",
                color: "#D4AF37",
                letterSpacing: "1.5px",
              }}
            >
              {caseNumber}
            </div>
          </div>

          <div
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#D4AF37",
            }}
          >
            ⚖️ THE HONORABLE JUDGE
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div
            style={{
              fontSize: "52px",
              fontWeight: 800,
              lineHeight: 1.1,
              color: "#F6F1E6",
            }}
          >
            {title.length > 70 ? title.slice(0, 67) + "..." : title}
          </div>

          <div
            style={{
              fontSize: "28px",
              lineHeight: 1.35,
              color: hasVerdict ? "#E9C46A" : "#B8B0A2",
              fontStyle: hasVerdict ? "italic" : "normal",
            }}
          >
            {headline.length > 150 ? headline.slice(0, 147) + "..." : headline}
          </div>
        </div>

        {hasVerdict ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              width: "100%",
              backgroundColor: "#1B1916",
              padding: "24px 28px",
              borderRadius: "14px",
              border: "1px solid #332E26",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "22px",
                fontWeight: 700,
              }}
            >
              <span style={{ color: "#F87171" }}>
                {partyA}: {faultA}% Fault
              </span>
              <span style={{ color: "#D4AF37" }}>
                Prevailing: {winner}
              </span>
              <span style={{ color: "#60A5FA" }}>
                {partyB}: {faultB}% Fault
              </span>
            </div>
            <div
              style={{
                display: "flex",
                width: "100%",
                height: "18px",
                borderRadius: "999px",
                overflow: "hidden",
                backgroundColor: "#2D2923",
              }}
            >
              <div
                style={{
                  width: `${faultA}%`,
                  height: "100%",
                  backgroundColor: "#C8322B",
                }}
              />
              <div
                style={{
                  width: `${faultB}%`,
                  height: "100%",
                  backgroundColor: "#2563EB",
                }}
              />
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: "1px solid #2E2922",
              paddingTop: "24px",
              fontSize: "22px",
              color: "#A39B8B",
            }}
          >
            <span>Paste WhatsApp Chat • Upload Photo Evidence • Live Cross-Examination</span>
            <span style={{ color: "#D4AF37", fontWeight: 700 }}>
              Summon The Judge →
            </span>
          </div>
        )}
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
