# Architektur

Skill Diary ist eine **statische Web-App ohne Build-Schritt**: reine ES-Module im Browser, gehostet über
GitHub Pages. Es gibt keinen eigenen Server und keine Datenbank – alle Spieler- und Feedbackdaten liegen
in einer Excel-Datei im OneDrive des Trainers.

## Schichten

```
index.html ─► js/main.js            Einstieg: Service Worker, Anmeldung, erste Synchronisation
                 │
   ┌─────────────┼───────────────────────────────────────────────┐
   │ ui/         │ shell.js   Rahmen (Kopf, Navigation, Login)   │  Oberfläche
   │             │ dom.js     h(), toast, Dialoge, Bausteine     │
   │             │ charts.js  SVG-Diagramme der Auswertung       │
   │ views/      │ capture · review · stats · settings           │  je Bildschirm eine Datei
   ├─────────────┼───────────────────────────────────────────────┤
   │ core/       │ state.js   Zustand S + Konfig-Helfer          │  Logik ohne Oberfläche
   │             │ data.js    Abgleich Zustand ⇄ OneDrive        │
   │             │ stats.js   Berechnungen (Bildschirm + Export) │
   │             │ format.js  Datums-/Textformate                │
   │             │ config.js  Konstanten, lokale Einstellungen   │
   ├─────────────┼───────────────────────────────────────────────┤
   │ services/   │ auth · onedrive · ai · speech · anon          │  Anbindung nach außen
   │ export/     │ report.js  PowerPoint-Export                  │
   └─────────────┴───────────────────────────────────────────────┘
```

**Abhängigkeitsregel:** Pfeile zeigen nur nach unten. `services/` und `core/` kennen keine Oberfläche
(Ausnahme: `core/data.js` meldet Fehler über `toast`). Ansichten importieren nie andere Ansichten;
neu gezeichnet wird über `render()` aus `ui/dom.js`, das `ui/shell.js` beim Start registriert.

## Datenfluss

1. **Erfassen** (`views/capture.js`): Notiz tippen oder diktieren (`services/speech.js`: Chrome lokal →
   Whisper im Browser → optional Cloud).
2. **Anonymisieren** (`services/anon.js`): Namen → Zufallscodes, nur im Arbeitsspeicher.
3. **KI-Zuordnung** (`services/ai.js`, kleines Modell): Spieler-Code, Bereich, Skill, Bewertung, Niveau,
   Position, Kommentar, Kontext. Codes werden danach zurück in Namen übersetzt.
4. **Prüfen** (`views/review.js`) → Zeilen in `S.pending` (lokal vorgemerkt) → `core/data.js`
   `flushPending()` → `services/onedrive.js` `appendFeedback()` → Excel-Tabelle `Feedback`.
5. **Auswertung** (`views/stats.js`): `loadFeedback()` lädt alle Zeilen in den Arbeitsspeicher;
   Diagramme aus `ui/charts.js` mit Zahlen aus `core/stats.js`.
6. **Entwicklungsgespräch**: Zusammenfassung (`services/ai.js`, größeres Modell, anonymisiert) →
   bearbeiten → `export/report.js` füllt `template/Auswertung-Vorlage.pptx` → OneDrive „Exporte“ + Download.

## Daten und Speicherorte

| Was | Wo | Hinweis |
|---|---|---|
| Feedback, Spieler, Kompetenzen, Positionen | OneDrive `Apps/Skill Diary/Datenbank/Skill-Diary.xlsx` (deutsch: `Anwendungen/…`) | einzige dauerhafte Ablage |
| Exporte (PowerPoint) | OneDrive `Apps/Skill Diary/Exporte/` | |
| Einstellungen, KI-Schlüssel | `localStorage` `sd.settings` | nur auf dem Handy, beim Abmelden gelöscht |
| Kopie der Konfiguration | `localStorage` `sd.cfg` | für Anonymisierung ohne Netz |
| Entwurf, ausstehende Einträge | `localStorage` `sd.draft`, `sd.pending` | werden nach Upload geleert |
| Sprachmodell | Cache `transformers-cache` | wird bei Updates nicht gelöscht |
| App-Dateien | Cache `sd-v<Version>` | Service Worker |

**Excel-Schema:** Spalten der Tabelle `Feedback` stehen in `CONFIG.feedbackColumns`
(`js/core/config.js`). Neue Spalten **hinten anhängen** – `migrateFeedbackColumns()` ergänzt sie in
bestehenden Dateien automatisch, ältere vorgemerkte Zeilen werden aufgefüllt.

## Konventionen

- Sprache im Code-Kommentar und in der Oberfläche: Deutsch. Jede Datei beginnt mit einem Kommentar zu ihrem Zweck.
- Oberfläche wird mit `h(tag, attrs, ...kinder)` gebaut, Zustand liegt zentral in `S` (`core/state.js`).
  Eingabefelder schreiben direkt in den Zustand; `render()` zeichnet die aktuelle Ansicht neu.
- Bibliotheken liegen fest in `lib/` (keine CDN-Abhängigkeit). Herkunft und Update-Anleitung für
  transformers.js/ONNX in `lib/transformers/HERKUNFT.md`.
- Keine Personendaten im Repo – auch nicht in Vorlagen, Tests oder Beispielen.

## Sicherheit und Datenschutz

| Maßnahme | Wo |
|---|---|
| Keine Personendaten im Repo (auch nicht in Tests, Vorlagen, Beispielen) | Konvention |
| Namen vor jedem KI-Aufruf durch Zufallscodes ersetzt; Zuordnung nur im Arbeitsspeicher | `services/anon.js` |
| Vorschau des anonymisierten Texts vor dem Senden, editierbar (abschaltbar, Standard: an) | `ui/dom.js` `confirmSend` |
| Alle Bibliotheken fest im Repo (`lib/`), kein fremder Code zur Laufzeit; von Hugging Face nur Modelldaten | `lib/`, `services/speech.js` |
| Content Security Policy: Code nur aus dem Repo; Verbindungen nur zu Microsoft, Anthropic, Hugging Face | `index.html` |
| Inhalte aus dem Excel werden vor `innerHTML` maskiert (`esc`) | `ui/charts.js` |
| Abmelden löscht alle lokalen App-Daten (`sd.*`) inkl. KI-Schlüssel | `services/auth.js` `clearLocalData` |
| Berechtigung nur für den App-Ordner (`Files.ReadWrite.AppFolder`); Pfade relativ zu `special/approot` | `core/config.js`, `services/onedrive.js` |
| Fehlt die Datenbank, wird nie automatisch eine leere angelegt (Hinweis mit Umzugsanleitung) | `services/onedrive.js` `NoWorkbookError`, `ui/shell.js` |
| Exporte nur ins OneDrive; Download aufs Handy nur auf Wunsch | `views/stats.js`, Einstellungen |
| Spracheingabe lokal (Chrome lokal bzw. Whisper im Browser); Cloud nur nach ausdrücklicher Einstellung | `services/speech.js` |

**Bekannte Restrisiken**
- *Gleiche Herkunft wie der Dokumentenmanager* (`mattment1980.github.io`): beide Apps teilen sich den
  Browser-Speicher (Anmeldungen, Schlüssel). Abhilfe: eigene Adresse für Skill Diary.
- *Video-Verknüpfungen* (geplant) funktionieren nur für Videos, die im App-Ordner liegen.
- *Pseudonymisierung ≠ Anonymisierung*: nicht hinterlegte Namen, falsch erkannte Namen und Inhalte
  (Gesundheit, Familie) gehen im Klartext an die KI, sofern sie in der Vorschau nicht entfernt werden.
- Entwurf und ausstehende Einträge liegen bis zum Upload unverschlüsselt im Browser-Speicher.

`blob:` ist für Skripte erlaubt, weil die ONNX-Laufzeit ihr Rechenwerk so lädt; blob-Adressen kann nur bereits
laufender eigener Code erzeugen. Neue externe Verbindungen erfordern eine Anpassung der Content Security Policy in `index.html` –
bewusst, damit jede neue Datenweitergabe sichtbar entschieden wird.

## Neue Funktion hinzufügen (Beispiele)

- **Neues Feld pro Eintrag:** Spalte hinten an `CONFIG.feedbackColumns` anhängen → in `views/review.js`
  (`saveReview`, Zeile bauen) und ggf. `views/stats.js` (`editCard`, `saveEdit`) ergänzen → bei KI-Vorschlag
  Schema in `services/ai.js` erweitern → Vorlage mit `tools/build_xlsx_template.py` neu erzeugen.
- **Neue Ansicht:** Datei in `views/` mit `export function xyView()`, in `ui/shell.js` bei `views` und in der
  Navigation eintragen, ins `SHELL`-Verzeichnis von `sw.js` aufnehmen.
- **Neue Grafik:** Berechnung nach `core/stats.js` (mit Test), Darstellung in `ui/charts.js` bzw. `export/report.js`.

## Release

1. `self.APP_VERSION` in `js/version.js` erhöhen (einzige Stelle; Service Worker und Anzeige lesen sie).
2. Neue Dateien in `SHELL` in `sw.js` eintragen.
3. `npm test` ausführen.
4. Eintrag in `CHANGELOG.md`, committen, pushen. GitHub Pages veröffentlicht automatisch;
   die App lädt die neue Version beim nächsten Öffnen selbst.

## Tests

`npm test` (Node ≥ 20, keine Abhängigkeiten) prüft die Pseudonymisierung (`tests/anon.test.mjs`)
und die Berechnungen (`tests/stats.test.mjs`). Oberflächentests laufen derzeit manuell.

## Vorlagen neu erzeugen

- Datenbank: `python3 tools/build_xlsx_template.py template/Skill-Diary-Vorlage.xlsx`
- PowerPoint: `python3 tools/build_report_template.py <eigene-vorlage.pptx> template/Auswertung-Vorlage.pptx`
  (Details und Platzhalter im Kopf des Skripts)
