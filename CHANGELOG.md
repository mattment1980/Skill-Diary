# Changelog

## 20 – 24.10.2026
- Zugriff nur noch auf den App-Ordner `OneDrive/Apps/Skill Diary` (Berechtigung `Files.ReadWrite.AppFolder`)
- Ordnerangaben relativ zum App-Ordner (`Datenbank`, `Exporte`); alte Pfade werden automatisch umgestellt
- Fehlt die Datenbank, erscheint ein Hinweis mit Umzugsanleitung statt einer automatisch angelegten leeren Datenbank

## 19 – 24.10.2026 (Sicherheit & Datenschutz)
- Vorschau des anonymisierten Texts vor dem Senden an die KI (bearbeitbar, abschaltbar)
- Whisper-Bibliothek und ONNX-Laufzeit fest im Repo statt von jsDelivr
- Content Security Policy und `no-referrer`
- Abmelden löscht alle lokalen App-Daten inkl. KI-Schlüssel (mit Warnung bei ausstehenden Einträgen)
- PowerPoint-Download aufs Handy nur noch auf Wunsch (Standard: nur OneDrive)
- Texte aus dem Excel in Diagrammen maskiert; neutrale Namen in Tests und Beispieltexten

## 18 – 24.10.2026
- Code neu strukturiert: `core/`, `services/`, `ui/`, `views/`, `export/`; `app.js` aufgeteilt
- Versionsnummer an einer Stelle (`js/version.js`), Service Worker als Modul
- Gemeinsame Berechnungen für Bildschirm und PowerPoint (`core/stats.js`)
- Automatische Tests (`npm test`), Vorlagen-Skripte in `tools/`, Architektur-Doku in `docs/`

## 17 – 24.10.2026
- PowerPoint-Export „Entwicklungsgespräch“ (Vereinsvorlage, Sterne je Bereich, Seite 2 mit Grafiken); ersetzt Word
- Niveau je Skill als Balkenliste mit Filter
- Niveau 1–5 je Eintrag (KI-Vorschlag, editierbar), Spinnendiagramm je Bereich mit Team-Schnitt, Excel-Spalte „Niveau“
- Zeitleiste Positiv/Neutral/Kritisch
- Einträge in der Auswertung bearbeiten und löschen
- Spracheingabe per Whisper im Browser (lokal, mehrere Kerne, Bildschirm bleibt an); Statusanzeigen
- KI: Rückfall ohne erzwungenes Tool (Sonnet), zuverlässige Updates, Versionsanzeige

## 1 – 24.10.2026
- Erste Version: Erfassen, KI-Zuordnung mit Anonymisierung, Prüfen, Excel auf OneDrive, Auswertung, Migration der Altnotizen
