// Einstiegspunkt: Service Worker, Anmeldung, erste Synchronisation.
// Aufbau und Konventionen: docs/ARCHITEKTUR.md
import { settings } from './core/config.js';
import { syncConfig, flushPending } from './core/data.js';
import { initAuth } from './services/auth.js';
import { whisperCached, localStatus, loadWhisper } from './services/speech.js';
import { toast, render } from './ui/dom.js';
import { loginView } from './ui/shell.js';

async function start() {
  if ('serviceWorker' in navigator) {
    // Neue Version aktiv -> Seite einmal neu laden, damit sie sofort genutzt wird.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) location.reload(); });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  }
  let signedIn = false;
  try { signedIn = await initAuth(); } catch (e) { console.error(e); toast(`Anmeldung: ${e.message}`, 'error'); }
  if (!signedIn) return loginView();
  render();
  try {
    await syncConfig();
    await flushPending();
  } catch (e) { toast(e.message, 'error'); }
  render();
  // Sprachmodell im Hintergrund in den Speicher holen, damit das erste Diktat nicht warten muss.
  if (!settings.allowCloudSpeech && await whisperCached() && (await localStatus()) !== 'available') loadWhisper().catch(() => {});
}

start();
