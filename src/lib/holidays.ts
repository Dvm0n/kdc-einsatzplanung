/** Gesetzliche Feiertage in Deutschland je Bundesland. */

export const FEDERAL_STATES: Record<string, string> = {
  BW: "Baden-Württemberg",
  BY: "Bayern",
  BE: "Berlin",
  BB: "Brandenburg",
  HB: "Bremen",
  HH: "Hamburg",
  HE: "Hessen",
  MV: "Mecklenburg-Vorpommern",
  NI: "Niedersachsen",
  NW: "Nordrhein-Westfalen",
  RP: "Rheinland-Pfalz",
  SL: "Saarland",
  SN: "Sachsen",
  ST: "Sachsen-Anhalt",
  SH: "Schleswig-Holstein",
  TH: "Thüringen",
};

function d(y: number, m: number, day: number) {
  return new Date(Date.UTC(y, m - 1, day));
}
function plus(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Ostersonntag (Gauß/Meeus-Algorithmus) */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const dd = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - dd - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return d(year, month, day);
}

/** Buß- und Bettag: Mittwoch vor dem 23. November */
function repentanceDay(year: number) {
  const nov23 = d(year, 11, 23);
  const wd = nov23.getUTCDay(); // 0 = So
  const diff = (wd - 3 + 7) % 7 || 7;
  return plus(nov23, -diff);
}

export function holidaysFor(year: number, state: string): { date: Date; name: string }[] {
  const easter = easterSunday(year);
  const list: { date: Date; name: string; states?: string[] }[] = [
    { date: d(year, 1, 1), name: "Neujahr" },
    { date: d(year, 1, 6), name: "Heilige Drei Könige", states: ["BW", "BY", "ST"] },
    { date: d(year, 3, 8), name: "Internationaler Frauentag", states: ["BE", "MV"] },
    { date: plus(easter, -2), name: "Karfreitag" },
    { date: plus(easter, 1), name: "Ostermontag" },
    { date: d(year, 5, 1), name: "Tag der Arbeit" },
    { date: plus(easter, 39), name: "Christi Himmelfahrt" },
    { date: plus(easter, 50), name: "Pfingstmontag" },
    { date: plus(easter, 60), name: "Fronleichnam", states: ["BW", "BY", "HE", "NW", "RP", "SL"] },
    { date: d(year, 8, 15), name: "Mariä Himmelfahrt", states: ["SL"] },
    { date: d(year, 9, 20), name: "Weltkindertag", states: ["TH"] },
    { date: d(year, 10, 3), name: "Tag der Deutschen Einheit" },
    { date: d(year, 10, 31), name: "Reformationstag", states: ["BB", "HB", "HH", "MV", "NI", "SN", "ST", "SH", "TH"] },
    { date: d(year, 11, 1), name: "Allerheiligen", states: ["BW", "BY", "NW", "RP", "SL"] },
    { date: repentanceDay(year), name: "Buß- und Bettag", states: ["SN"] },
    { date: d(year, 12, 25), name: "1. Weihnachtstag" },
    { date: d(year, 12, 26), name: "2. Weihnachtstag" },
  ];
  return list.filter((h) => !h.states || h.states.includes(state)).map(({ date, name }) => ({ date, name }));
}
