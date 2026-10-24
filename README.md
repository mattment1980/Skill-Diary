# Skill Diary

Web-App (Android/Chrome, als App installierbar) zum Erfassen von Spieler-Feedback im Jugendfußball:
diktieren oder tippen → KI ordnet Spieler, Kompetenzbereich, Skill, Bewertung und Position zu → prüfen →
Ablage als Zeilen in einer Excel-Datei im eigenen OneDrive. Dazu Auswertung je Spieler (Verlauf, Niveau je Bereich/Skill) und ein
Entwicklungsgespräch als PowerPoint (KI-Zusammenfassung + Grafiken, im Vereinslayout).

App: https://mattment1980.github.io/Skill-Diary/

## Datenschutz

- Spieler- und Feedbackdaten liegen **nur im OneDrive** (`Skill-Diary.xlsx`). Im Repo stehen keine Personendaten.
- Vor jedem KI-Aufruf werden Namen **auf dem Handy** durch zufällige Codes ersetzt (`js/anon.js`);
  die Zuordnung existiert nur im Arbeitsspeicher. Bei doppeldeutigen Vornamen fragt die App nach.
- Spracheingabe nutzt bevorzugt die **lokale** Erkennung von Chrome. Cloud-Erkennung nur, wenn in den
  Einstellungen ausdrücklich erlaubt.
- Auf dem Handy zwischengespeichert: KI-Schlüssel, Einstellungen, Spielerliste (für die Anonymisierung ohne Netz),
  der aktuelle Entwurf und noch nicht hochgeladene Einträge (werden nach dem Upload gelöscht).

## Aufbau

| Datei | Zweck |
|---|---|
| `index.html`, `css/app.css` | Oberfläche, dunkles Vereinsdesign |
| `js/app.js` | Ansichten und Ablauf (Erfassen, Prüfen, Auswertung, Einstellungen) |
| `js/config.js` | Konstanten (Client-ID, Spalten) und lokale Einstellungen |
| `js/auth.js` | Microsoft-Anmeldung (MSAL, persönliches Konto) |
| `js/onedrive.js` | Microsoft Graph: Excel lesen/schreiben, Dateien hochladen |
| `js/anon.js` | Pseudonymisierung von Namen |
| `js/ai.js` | Anthropic-API: Zuordnung (kleines Modell) und Zusammenfassung |
| `js/speech.js` | Spracheingabe (Web Speech API, lokal bevorzugt) |
| `js/stats.js` | Gemeinsame Berechnungen (Zeitabschnitte, Durchschnittsniveau) |
| `js/report.js` | PowerPoint-Export: füllt `template/Auswertung-Vorlage.pptx`, zeichnet Grafiken |
| `template/Skill-Diary-Vorlage.xlsx` | Leere Datenbank; wird angelegt, falls im OneDrive keine existiert |
| `template/Auswertung-Vorlage.pptx` | Layout Entwicklungsgespräch mit Platzhaltern `{{…}}`, Sternen `STAR_<Bereich>_<n>` und Grafikflächen `CHART_*` |
| `lib/` | Mitgelieferte Bibliotheken (MSAL, JSZip – MIT-Lizenz) |

## Excel-Datenbank

- **Feedback** (Tabelle `Feedback`): ID, Zeitstempel, Datum, Art (Spiel/Training), Anlass, Spieler, Position,
  Bereich, Skill, Bewertung (Positiv/Neutral/Kritisch), Kommentar, Quelle (KI/manuell/Migration),
  Gruppe (verbindet Einträge aus einer Notiz), VideoLink (für später), Niveau (1–5 im Altersvergleich, 3 = altersgemäß).
- **Spieler** (Name, Aliase, Aktiv), **Kompetenzen** (Bereich, Skill), **Positionen** (Gruppe, Position, Bezeichnung) –
  in der App unter Einstellungen bearbeitbar oder direkt in Excel.

## Einrichtung

1. GitHub Pages: Settings → Pages → Branch `main`, Ordner `/ (root)`.
2. Azure App-Registrierung (SPA), Redirect-URI `https://mattment1980.github.io/Skill-Diary/`,
   Berechtigungen `Files.ReadWrite`, `offline_access`. Client-ID steht in `js/config.js`.
3. In der App unter Einstellungen den Anthropic-Schlüssel eintragen.

Nach Code-Änderungen in `sw.js` die `VERSION` erhöhen, damit Handys die neue Version laden.
