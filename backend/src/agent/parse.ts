import { complete } from "../claude.js";
import { EventInputSchema, type EventInput } from "../events.js";
import { canonicalArtist } from "../brand/profile.js";
import { temporalContext } from "../util/time.js";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["events"],
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["artist", "date", "venue", "eventType", "supportingActs", "doorsTime", "notes", "status"],
        properties: {
          artist: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
          venue: { type: "string", enum: ["XS", "XS Nightswim", "Encore Beach Club", "EBC at Night", "Other"] },
          eventType: { type: "string", enum: ["regular", "residency", "special", "holiday"] },
          supportingActs: { type: "array", items: { type: "string" } },
          doorsTime: { type: ["string", "null"], description: "HH:MM 24h or null" },
          notes: { type: ["string", "null"] },
          status: { type: "string", enum: ["confirmed", "tentative", "cancelled"] },
        },
      },
    },
  },
};

/** Parse pasted lineup text (emails, calendar exports, press copy) into calendar events. Preview only. */
export async function parseLineup(text: string): Promise<{ events: EventInput[]; rejected: string[] }> {
  const t = temporalContext();
  const out = await complete({
    system:
      "You convert nightlife lineup text into structured calendar events for XS Nightclub / Wynn Nightlife. Resolve dates to YYYY-MM-DD in Las Vegas time; when the year is omitted choose the next occurrence on or after today. Keep artist names exactly as styled in the text (umlauts, lowercase, punctuation). Put billing qualifiers like [DJ SET], B2B partner, special guests into the artist string exactly as billed (e.g. 'Diplo B2B HUGEL') and list special guests in supportingActs. Only include what the text states; mark anything hedged ('TBA', 'rumoured', 'pending') as tentative. Never invent doors times.",
    content: [{ type: "text", text: `Today in Las Vegas: ${t.nowLocal}.\n\nText:\n${text.slice(0, 20000)}` }],
    effort: "medium",
    maxTokens: 8000,
    jsonSchema: SCHEMA,
  });
  const data = JSON.parse(out) as { events: unknown[] };
  const events: EventInput[] = [];
  const rejected: string[] = [];
  for (const raw of data.events ?? []) {
    const r = EventInputSchema.safeParse(raw);
    if (r.success) events.push({ ...r.data, artist: canonicalArtist(r.data.artist) });
    else rejected.push(JSON.stringify(raw));
  }
  return { events, rejected };
}
