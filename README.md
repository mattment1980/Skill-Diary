# Skill Diary

Web-App (Android/Chrome, als App installierbar) zum Erfassen von Spieler-Feedback im Jugendfußball:
diktieren oder tippen → KI ordnet Spieler, Kompetenzbereich, Skill, Bewertung und Position zu → prüfen →
Ablage als Zeilen in einer Excel-Datei im eigenen OneDrive (App-Ordner `Apps/Skill Diary`, im deutschen OneDrive `Anwendungen/Skill Diary`). Dazu Auswertung je Spieler (Verlauf, Niveau je Bereich/Skill) und ein
Entwicklungsgespräch als PowerPoint (KI-Zusammenfassung + Grafiken, im Vereinslayout).

App: https://skilldiary.mentschel.com

## Datenschutz

- Spieler- und Feedbackdaten liegen **nur im OneDrive** (`Apps/Skill Diary/Datenbank/Skill-Diary.xlsx`). Im Repo stehen keine Personendaten.
- Die App hat nur Zugriff auf ihren **eigenen App-Ordner** (`Files.ReadWrite.AppFolder`), nicht auf das übrige OneDrive.
- Vor jedem KI-Aufruf werden Namen **auf dem Handy** durch zufällige Codes ersetzt; der anonymisierte Text wird
  vor dem Senden angezeigt und kann bearbeitet werden.
- Spracheingabe läuft **auf dem Gerät** (Chrome lokal oder Whisper im Browser). Cloud-Erkennung nur nach Einstellung.
- Kein fremder Code zur Laufzeit; eine Content Security Policy begrenzt Verbindungen auf Microsoft, Anthropic
  und Hugging Face (nur Modelldaten).
- Abmelden löscht alle Daten der App auf dem Handy. Exporte landen nur auf Wunsch zusätzlich in den Downloads.
- Details und bekannte Restrisiken: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md#sicherheit-und-datenschutz).

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

1. GitHub Pages: Settings → Pages → Branch `main`, Ordner `/ (root)`, Custom domain `skilldiary.mentschel.com`
   (Datei `CNAME`; DNS bei IONOS: CNAME `skilldiary` → `mattment1980.github.io`), „Enforce HTTPS“ aktiv.
2. Azure App-Registrierung (SPA), Redirect-URI `https://skilldiary.mentschel.com/`,
   Berechtigungen `Files.ReadWrite.AppFolder`, `offline_access` (kein `Files.ReadWrite`). Client-ID steht in `js/core/config.js`.
3. In der App unter Einstellungen den Anthropic-Schlüssel eintragen.

Nach Änderungen `APP_VERSION` in `js/version.js` erhöhen, damit Handys die neue Version laden (siehe Release in der Architektur-Doku).
