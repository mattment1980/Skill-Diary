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

Statische Web-App ohne Build-Schritt (ES-Module). Struktur, Datenfluss, Konventionen und Release-Ablauf:
**[docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md)**. Änderungen: [CHANGELOG.md](CHANGELOG.md).

```
js/main.js        Einstieg
js/version.js     Versionsnummer (einzige Stelle)
js/core/          Zustand, Datenabgleich, Berechnungen, Formate, Konfiguration
js/services/      Microsoft-Anmeldung, OneDrive/Excel, KI, Spracheingabe, Anonymisierung
js/ui/            DOM-Helfer, Rahmen, Diagramme
js/views/         Erfassen, Prüfen, Auswertung, Einstellungen
js/export/        PowerPoint-Export
template/         Leere Datenbank, PowerPoint-Vorlage
tools/            Skripte zum Erzeugen der Vorlagen
tests/            npm test
```

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

Nach Änderungen `APP_VERSION` in `js/version.js` erhöhen, damit Handys die neue Version laden (siehe Release in der Architektur-Doku).
