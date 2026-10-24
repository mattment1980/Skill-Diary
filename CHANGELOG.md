# Changelog

## 26 – 24.10.2026 (Aufräumen)
- `core/data.js` ohne Oberflächenaufrufe; Datenbank-Import aus dem Rahmen in `core/data.js` verlagert
- PowerPoint-Export aufgeteilt in `export/charts.js` (Grafiken) und `export/report.js` (Vorlage befüllen)
- Zählungen der Auswertung aus `core/stats.js`; ungenutzte Exporte entfernt
- Offline-Cache um PowerPoint-Export, JSZip und Vorlage ergänzt

## 25 (Umzug) – 24.10.2026
- Eigene Adresse `skilldiary.mentschel.com` (getrennt vom Dokumentenmanager)

## 25 – 24.10.2026
- Abmelden entfernt zusätzlich Sprachmodell, Offline-Dateien, Service Worker und Anmelde-Zwischenspeicher dieser App (Vorbereitung Umzug auf eigene Domain)

## 24 – 24.10.2026
- Spracherkennung: Sicherheitsrichtlinie erlaubt das interne Laden des Rechenwerks über `blob:` (Fehler „no available backend found“)

## 23 – 24.10.2026
- Hinweistexte nennen den deutschen Ordnernamen „Anwendungen“

## 22 – 24.10.2026
- Umzug: bestehende Datenbank per Dateiauswahl übernehmen (lädt sie in den App-Ordner)

## 21 – 24.10.2026
- Anmeldung: Zeitüberschreitung der unsichtbaren Anmeldung führt jetzt zur Microsoft-Anmeldeseite (statt Fehlermeldung)

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
