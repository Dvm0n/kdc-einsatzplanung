# KDC Einsatzplanung

Web-App für die Einsatzplanung im Kundendialogcenter: Wochenplan für Inbound/Outbound, Bedarfsberechnung aus der
Anrufhistorie (Prognose + Erlang C), automatischer Planvorschlag, Verfügbarkeiten, Urlaubs- und Änderungsanträge.

## Funktionen

| Bereich | Wer | Inhalt |
|---|---|---|
| **Wochenplan** `/plan` | alle | Wochen- und Tagesansicht, für Operator nur veröffentlichte Wochen. Planer: Schichten per Klick anlegen, Drag & Drop (Strg = kopieren), Vorlagen, Segmente (Inbound/Outbound/Pause …), Regelprüfung, Vorwoche übernehmen, Planvorschlag, Veröffentlichen, Drucken |
| **Mein Plan** `/mein-plan` | Operator | Eigene Schichten, Soll/Ist, Änderung beantragen (andere Zeit, frei, an Kollegen abgeben), Tauschanfragen annehmen |
| **Verfügbarkeit** `/verfuegbarkeit` | Operator | Regelmäßige Woche (bevorzugt/verfügbar/nicht verfügbar), einzelne Tage, Urlaubsanträge, Wunsch-Deadline |
| **Anträge** `/antraege` | Planer | Posteingang: genehmigen/ablehnen; Genehmigung passt den Plan automatisch an. Krankmeldungen direkt eintragen |
| **Bedarf** `/bedarf` | Planer | CSV/XLSX-Import mit Spaltenzuordnung, Prognose-Heatmap, Korrekturfaktoren pro Tag |
| **Verwaltung** `/admin` | Admin | Mitarbeiter & Einladungen, Call-Zeiten, Planungsparameter, Feiertage, Schichtvorlagen, Aktivitäten, Stundenauswertung |

### Bedarfsberechnung

1. **Prognose** (`src/lib/planning/forecast.ts`): je Wochentag und Intervall gewichteter Mittelwert der letzten *N* Wochen
   (jüngste Woche zählt am stärksten), Feiertage werden ausgelassen, optional Korrekturfaktor pro Tag.
2. **Erlang C** (`src/lib/planning/erlang.ts`): kleinste Anzahl Operator, die das Service-Level-Ziel (z. B. 80/20) und die
   maximale Auslastung erfüllt → **Netto-Bedarf**. Brutto = Netto / (1 − Shrinkage).
3. **Abdeckung** (`src/lib/planning/coverage.ts`): geplante Inbound-Zeit je Intervall vs. Bedarf, erwartetes Service Level.
4. **Planvorschlag** (`src/lib/planning/autoschedule.ts`): Greedy-Heuristik, deckt zuerst die größten Lücken, verlängert
   Schichten bei Restlücken, füllt übrige Vertragsstunden mit Outbound, staffelt Pausen. Hält Verfügbarkeit, Urlaub,
   Vertragsstunden, max. Tagesarbeitszeit, Ruhezeit (11 h) und Pausen nach ArbZG ein.

## Lokal starten

Voraussetzung: Node.js 22.

```bash
npm install
cp .env.example .env        # AUTH_SECRET setzen
npm run db:local            # eigenes Terminal: lokale Postgres-Instanz (Port 5433, ohne Docker)
npx prisma migrate dev      # Tabellen anlegen
npm run db:seed             # Demo-Daten: 10 Operator, 10 Wochen Anrufhistorie, Beispielwoche
npm run dev
```

Alternativ zur eingebauten Datenbank: `docker compose up -d`.

Demo-Zugänge nach dem Seed: `admin@kdc.local` bzw. `<vorname>@kdc.local` (z. B. `tim@kdc.local`),
Passwort siehe `prisma/seed.ts` (`SEED_PASSWORD`). **Nur für lokale Tests.**

Tests: `npm test` (Erlang C, Prognose, Abdeckung, Regeln, Planvorschlag, Import-Parser).

## Import-Format

Eine Zeile pro Intervall, Spalten frei benennbar (Zuordnung beim Import). Beispiel: `docs/beispiel-import.csv`

```
Datum;Intervall;Angeboten;Angenommen;AHT
05.10.2026;08:00;9;9;04:05
```

Unterstützt: Datum als `TT.MM.JJJJ`, `JJJJ-MM-TT` oder Excel-Datum, Uhrzeit separat oder im Datum; AHT in Sekunden oder
`mm:ss`, alternativ Gesamtgesprächszeit. Mehrere Zeilen pro Intervall (z. B. Queues) werden addiert.

## Deployment (Vercel + Neon)

1. Repository zu GitHub pushen und in Vercel importieren.
2. Über den Vercel Marketplace eine **Neon**-Datenbank hinzufügen (setzt `DATABASE_URL`; zusätzlich `DIRECT_URL` auf die
   nicht gepoolte Verbindung setzen).
3. Umgebungsvariablen setzen: `AUTH_SECRET`, `APP_URL` (z. B. `https://kdc-planung.vercel.app`), optional `RESEND_API_KEY` und `MAIL_FROM`.
4. Deploy – das Skript `vercel-build` führt die Migrationen automatisch aus.
5. Ersten Admin anlegen (lokal mit den Produktions-Variablen):
   `npm run create-admin -- name@firma.de` → Link öffnen und Passwort setzen. Danach alles Weitere in der App.

## Technik

Next.js 15 (App Router, Server Actions) · TypeScript · Tailwind CSS + shadcn/ui · Prisma + PostgreSQL · Auth.js ·
Recharts · Vitest. Zeiten werden als Datum + Minuten seit Mitternacht (Europe/Berlin) gespeichert.
