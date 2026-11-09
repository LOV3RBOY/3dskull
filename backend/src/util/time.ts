import { DateTime } from "luxon";
import { config } from "../config.js";

/** Current moment in Las Vegas. */
export const vegasNow = () => DateTime.now().setZone(config.timezone);

export function vegasDate(isoDate: string): DateTime {
  return DateTime.fromISO(isoDate, { zone: config.timezone });
}

/**
 * Describe "today" for the agent so relative phrases ("this weekend", "Saturday",
 * "next Friday") resolve deterministically. Nightlife convention: before 6am the
 * club night still belongs to the previous calendar date.
 */
export function temporalContext(now = vegasNow()) {
  const clubNight = now.hour < 6 ? now.minus({ days: 1 }) : now;
  const upcoming: { label: string; date: string }[] = [];
  for (let i = 0; i < 21; i++) {
    const d = clubNight.plus({ days: i });
    upcoming.push({ label: d.toFormat("cccc"), date: d.toISODate()! });
  }
  return {
    nowLocal: now.toFormat("cccc, LLLL d, yyyy 'at' h:mm a ZZZZ"),
    clubNightDate: clubNight.toISODate()!,
    next21Days: upcoming,
  };
}

/** Common XS date treatments, all derived deterministically from an ISO date. */
export function dateTreatments(isoDate: string) {
  const d = vegasDate(isoDate);
  return {
    iso: isoDate,
    dowShort: d.toFormat("ccc").toUpperCase(), // FRI
    dowLong: d.toFormat("cccc").toUpperCase(), // FRIDAY
    monthShort: d.toFormat("LLL").toUpperCase(), // NOV
    monthLong: d.toFormat("LLLL").toUpperCase(), // NOVEMBER
    day: d.toFormat("d"),
    dotted: d.toFormat("M.d"), // 11.14
    dottedPadded: d.toFormat("MM.dd"), // 11.14
    dottedYear: d.toFormat("MM.dd.yy"),
    slash: d.toFormat("M/d"),
    long: d.toFormat("cccc, LLLL d").toUpperCase(), // FRIDAY, NOVEMBER 14
    medium: d.toFormat("ccc LLL d").toUpperCase(), // FRI NOV 14
  };
}
