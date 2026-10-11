/**
 * Erlang-C-Berechnungen für den Netto-Personalbedarf.
 *
 * A  = Verkehrslast in Erlang = Anrufe × AHT / Intervalllänge
 * N  = Anzahl Agenten
 * Pw = Wahrscheinlichkeit, dass ein Anruf warten muss (Erlang C)
 * SL = 1 − Pw · e^(−(N − A) · T / AHT)
 */

export interface ErlangParams {
  /** Erwartete Anrufe im Intervall */
  calls: number;
  /** Durchschnittliche Bearbeitungszeit in Sekunden */
  ahtSeconds: number;
  /** Intervalllänge in Sekunden (z. B. 1800) */
  intervalSeconds: number;
  /** Service-Level-Ziel als Anteil, z. B. 0.8 */
  serviceLevelTarget: number;
  /** Service-Level-Zeit in Sekunden, z. B. 20 */
  serviceLevelSeconds: number;
  /** Maximale Auslastung, z. B. 0.85 (optional) */
  maxOccupancy?: number;
}

export function trafficIntensity(calls: number, ahtSeconds: number, intervalSeconds: number): number {
  if (calls <= 0 || ahtSeconds <= 0 || intervalSeconds <= 0) return 0;
  return (calls * ahtSeconds) / intervalSeconds;
}

/**
 * Erlang-C-Wartewahrscheinlichkeit, numerisch stabil über die Erlang-B-Rekursion:
 *   B(0) = 1, B(k) = A·B(k−1) / (k + A·B(k−1))
 *   C = N·B / (N − A·(1 − B))
 */
export function erlangC(agents: number, traffic: number): number {
  if (traffic <= 0) return 0;
  if (agents <= traffic) return 1;
  let b = 1;
  for (let k = 1; k <= agents; k++) {
    b = (traffic * b) / (k + traffic * b);
  }
  return (agents * b) / (agents - traffic * (1 - b));
}

export function serviceLevel(agents: number, traffic: number, ahtSeconds: number, slSeconds: number): number {
  if (traffic <= 0) return 1;
  if (agents <= traffic) return 0;
  const pw = erlangC(agents, traffic);
  return 1 - pw * Math.exp((-(agents - traffic) * slSeconds) / ahtSeconds);
}

/** Durchschnittliche Wartezeit (ASA) in Sekunden */
export function averageSpeedOfAnswer(agents: number, traffic: number, ahtSeconds: number): number {
  if (traffic <= 0) return 0;
  if (agents <= traffic) return Infinity;
  return (erlangC(agents, traffic) * ahtSeconds) / (agents - traffic);
}

export interface StaffingResult {
  traffic: number;
  agents: number;
  serviceLevel: number;
  occupancy: number;
  asaSeconds: number;
}

/** Kleinste Agentenzahl, die Service-Level-Ziel und max. Auslastung erfüllt. */
export function requiredAgents(p: ErlangParams): StaffingResult {
  const traffic = trafficIntensity(p.calls, p.ahtSeconds, p.intervalSeconds);
  if (traffic === 0) {
    return { traffic: 0, agents: 0, serviceLevel: 1, occupancy: 0, asaSeconds: 0 };
  }
  let n = Math.max(1, Math.ceil(traffic));
  if (n === traffic) n += 1;
  if (p.maxOccupancy && p.maxOccupancy > 0) {
    n = Math.max(n, Math.ceil(traffic / p.maxOccupancy));
  }
  // Obergrenze als Schutz gegen Endlosschleifen
  const limit = Math.ceil(traffic) + 500;
  while (n < limit) {
    const sl = serviceLevel(n, traffic, p.ahtSeconds, p.serviceLevelSeconds);
    if (sl >= p.serviceLevelTarget) {
      return {
        traffic,
        agents: n,
        serviceLevel: sl,
        occupancy: traffic / n,
        asaSeconds: averageSpeedOfAnswer(n, traffic, p.ahtSeconds),
      };
    }
    n++;
  }
  return { traffic, agents: n, serviceLevel: 1, occupancy: traffic / n, asaSeconds: 0 };
}

/** Brutto-Bedarf inkl. Shrinkage (Pausen, Krankheit, Schulung …) */
export function grossAgents(netAgents: number, shrinkage: number): number {
  if (netAgents <= 0) return 0;
  const s = Math.min(Math.max(shrinkage, 0), 0.95);
  return netAgents / (1 - s);
}
