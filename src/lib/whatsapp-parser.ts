export interface ParsedChatMessage {
  id: string;
  sender: string;
  timestamp?: string;
  text: string;
}

export interface ParsedCorrespondence {
  messages: ParsedChatMessage[];
  speakers: string[];
  isStructuredChat: boolean;
}

// Supports iOS, Android, WhatsApp Web, and simple "Name: message" formats
const WHATSAPP_PATTERNS = [
  // [18/10/2026, 14:22:05] Name: Message or [10/18/26, 2:22 PM] Name: Message
  /^\[?(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\]?\s*(?:-\s*)?([^:\n]{1,40}):\s+(.+)$/,
  // [14:22, 18/10/2026] Name: Message (WhatsApp Web copy-paste)
  /^\[(\d{1,2}:\d{2}(?:\s*[APap][Mm])?,?\s+\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})\]\s*([^:\n]{1,40}):\s+(.+)$/,
  // 14:22 Name: Message or [14:22] Name: Message
  /^\[?(\d{1,2}:\d{2}(?:\s*[APap][Mm])?)\]?\s*(?:-\s*)?([^:\n]{1,35}):\s+(.+)$/,
];

const SIMPLE_SPEAKER_PATTERN = /^([A-Za-z\u0590-\u05FF0-9_][A-Za-z\u0590-\u05FF0-9_\s\.\-]{0,28}):\s+(.+)$/;

export function parseWhatsAppCorrespondence(raw: string): ParsedCorrespondence {
  if (!raw || !raw.trim()) {
    return { messages: [], speakers: [], isStructuredChat: false };
  }

  const lines = raw
    .replace(/\u200e|\u200f|\u202a|\u202c/g, "")
    .split(/\r?\n/);

  const messages: ParsedChatMessage[] = [];
  const speakerSet = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    let matched = false;

    for (const pattern of WHATSAPP_PATTERNS) {
      const m = line.match(pattern);
      if (m) {
        const timestamp = m[1].trim();
        const sender = m[2].trim();
        const text = m[3].trim();
        speakerSet.add(sender);
        messages.push({
          id: `msg-${messages.length + 1}`,
          sender,
          timestamp,
          text,
        });
        matched = true;
        break;
      }
    }

    if (!matched) {
      const simpleMatch = line.match(SIMPLE_SPEAKER_PATTERN);
      if (
        simpleMatch &&
        !simpleMatch[1].toLowerCase().startsWith("http") &&
        !simpleMatch[1].toLowerCase().startsWith("case") &&
        !simpleMatch[1].toLowerCase().startsWith("note")
      ) {
        const sender = simpleMatch[1].trim();
        const text = simpleMatch[2].trim();
        speakerSet.add(sender);
        messages.push({
          id: `msg-${messages.length + 1}`,
          sender,
          text,
        });
        matched = true;
      }
    }

    if (!matched) {
      if (messages.length > 0) {
        messages[messages.length - 1].text += `\n${line}`;
      }
    }
  }

  const speakers = Array.from(speakerSet);
  const isStructuredChat = messages.length >= 2 && speakers.length >= 2;

  return {
    messages,
    speakers,
    isStructuredChat,
  };
}

export interface SampleCasePreset {
  label: string;
  badge: string;
  title: string;
  category: string;
  persona: "supreme" | "small_claims" | "relationship" | "roast";
  partyA: string;
  partyB: string;
  correspondence: string;
  contextNote: string;
}

export const SAMPLE_CASE_PRESETS: SampleCasePreset[] = [
  {
    label: "The $240 Birthday Dinner Split",
    badge: "WhatsApp Group Drama",
    title: "Steak & Cocktails vs. One Caesar Salad",
    category: "money",
    persona: "small_claims",
    partyA: "Maya",
    partyB: "Liam",
    correspondence: `[10/17/26, 11:42 PM] Liam: Hey everyone!! Total for Chloe's birthday dinner came out to $840 with tip, so that's $120 each for the 7 of us. Venmo me @liam-chen!
[10/17/26, 11:44 PM] Maya: Wait Liam I don't drink alcohol and I literally only ordered the $22 Caesar salad and tap water because I had to leave early for my shift
[10/17/26, 11:45 PM] Liam: Maya it's a birthday dinner, we always split evenly. We ordered 3 pitchers of spicy margaritas and truffle ribeyes for the table
[10/17/26, 11:46 PM] Maya: Nobody asked me if I wanted table ribeyes!! I didn't touch them or the margaritas. I'm happy to chip in $15 toward Chloe's meal + $28 for my salad & tax/tip ($43 total), not $120!
[10/17/26, 11:48 PM] Liam: Honestly doing itemized math at a birthday dinner is super tacky. You knew it was a nice spot when you came.`,
    contextNote: "Maya sent $43. Liam is demanding the remaining $77 in the group chat.",
  },
  {
    label: "The Non-Refundable Airbnb Bailout",
    badge: "Travel Contract",
    title: "Bailed 48 Hours Before Lisbon Trip",
    category: "whatsapp",
    persona: "supreme",
    partyA: "Dan",
    partyB: "Omer",
    correspondence: `[10/02/26, 18:10] Omer: Book the 3-bedroom villa in Lisbon! I'm 100% in, $450 each for the 4 nights is a steal.
[10/02/26, 18:14] Dan: Booking now! Just heads up it's strict non-refundable once booked.
[10/02/26, 18:15] Omer: Send it 🔥
[10/15/26, 09:30] Omer: Bro bad news... my dog just ate a sock and needs observation at the vet, plus work is crazy this week. I can't fly out Thursday.
[10/15/26, 09:33] Dan: Oh no hope Rocco is okay! Regarding the Airbnb, since it's non-refundable can you still transfer your $450 share?
[10/15/26, 09:36] Omer: Wait why would I pay $450 for a bed I'm not sleeping in?? You guys still get the whole villa and now you each get a bigger room.`,
    contextNote: "Dan paid the full $1,350 upfront on his card. Should Omer still pay his $450?",
  },
  {
    label: "The 'I Saved Your Parking Spot' Incident",
    badge: "Street Etiquette",
    title: "Standing in an Empty Parking Space",
    category: "general",
    persona: "roast",
    partyA: "Noa",
    partyB: "Tomer",
    correspondence: `[10/16/26, 20:04] Tomer: You literally almost ran me over in Florentin just now
[10/16/26, 20:05] Noa: Tomer you were STANDING on foot in the middle of an empty street parking spot holding an iced coffee
[10/16/26, 20:06] Tomer: I was saving it for my girlfriend who was 4 minutes away on Ibn Gabirol!! I called dibs with my body
[10/16/26, 20:07] Noa: Humans cannot reserve street parking spots!! Cars go in car spots! I had my blinker on and pulled in!
[10/16/26, 20:08] Tomer: I was there first. Possession is 9/10ths of the law.`,
    contextNote: "Who has the legal and moral right to the street parking spot?",
  },
];
