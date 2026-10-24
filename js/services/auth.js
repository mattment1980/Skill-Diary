// Microsoft-Anmeldung (MSAL, persönliches Microsoft-Konto).
// Die Anmeldung bleibt im Browser gespeichert, damit nicht bei jedem Start neu angemeldet werden muss.
import { CONFIG } from '../core/config.js';

let app = null;

/** Weiterleitungsadresse = aktuelle App-Adresse ohne "index.html". */
function redirectUri() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

/** Initialisiert MSAL und verarbeitet eine eventuelle Rückkehr vom Login. Gibt true zurück, wenn angemeldet. */
export async function initAuth() {
  app = new msal.PublicClientApplication({
    auth: { clientId: CONFIG.clientId, authority: CONFIG.authority, redirectUri: redirectUri() },
    cache: { cacheLocation: 'localStorage' },
  });
  await app.initialize();
  const res = await app.handleRedirectPromise();
  const account = res?.account || app.getAllAccounts()[0];
  if (account) app.setActiveAccount(account);
  return !!account;
}

export function login() {
  return app.loginRedirect({ scopes: CONFIG.scopes, prompt: 'select_account' });
}

/**
 * Alle Daten dieser App im Browser löschen: Einstellungen inkl. KI-Schlüssel, Entwurf, Vormerkungen,
 * Spielerliste, Anmelde-Zwischenspeicher dieser App, Offline-Dateien und Sprachmodell.
 * Andere Apps unter derselben Adresse (z. B. Dokumentenmanager) bleiben unberührt: gelöscht werden nur
 * Schlüssel mit Präfix "sd." bzw. mit der Client-ID dieser App und die eigenen Caches.
 */
export async function clearLocalData() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('sd.') || k.includes(CONFIG.clientId))
      .forEach(k => localStorage.removeItem(k));
  } catch { /* */ }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('sd-') || k === 'transformers-cache').map(k => caches.delete(k)));
  } catch { /* */ }
  try {
    const regs = await navigator.serviceWorker?.getRegistrations() || [];
    // nur den Service Worker dieser App (Bereich endet auf ihren Pfad), nicht den des Dokumentenmanagers
    const scope = new URL('./', location.href).href;
    await Promise.all(regs.filter(r => r.scope === scope).map(r => r.unregister()));
  } catch { /* */ }
}

export async function logout() {
  const account = app.getActiveAccount();
  await clearLocalData();
  return app.logoutRedirect({ account });
}

export function accountName() {
  return app?.getActiveAccount()?.username || '';
}

/**
 * Fehler, bei denen eine sichtbare Anmeldung nötig ist. Neben InteractionRequired gehören dazu die
 * Zeitüberschreitungen der unsichtbaren Anmeldung im versteckten Fenster: Die ist durch die
 * Cross-Origin-Isolation (sw.js, für die schnelle Spracherkennung) blockiert.
 */
function needsInteraction(e) {
  if (e instanceof msal.InteractionRequiredAuthError) return true;
  return /monitor_window_timeout|timed_out|block_iframe|no_tokens_found|login_required|consent_required|interaction_required/i
    .test(`${e?.errorCode || ''} ${e?.message || ''}`);
}

let redirecting = false;

/** Holt ein Zugriffstoken für Microsoft Graph; leitet bei Bedarf zur Microsoft-Anmeldung weiter. */
export async function getToken() {
  const account = app.getActiveAccount();
  try {
    const r = await app.acquireTokenSilent({ scopes: CONFIG.scopes, account });
    return r.accessToken;
  } catch (e) {
    if (needsInteraction(e)) {
      // Schutz vor Endlosschleife: höchstens eine Weiterleitung pro Minute
      let last = 0;
      try { last = Number(sessionStorage.getItem('sd.authRedirect') || 0); } catch { /* */ }
      if (!redirecting && Date.now() - last > 60000) {
        redirecting = true;
        try { sessionStorage.setItem('sd.authRedirect', String(Date.now())); } catch { /* */ }
        await app.acquireTokenRedirect({ scopes: CONFIG.scopes, account });
      }
      throw new Error('Microsoft-Anmeldung erforderlich – bitte App neu öffnen.');
    }
    throw e;
  }
}
