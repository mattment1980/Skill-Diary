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

export function logout() {
  return app.logoutRedirect({ account: app.getActiveAccount() });
}

export function accountName() {
  return app?.getActiveAccount()?.username || '';
}

/** Holt ein Zugriffstoken für Microsoft Graph; meldet bei Bedarf neu an. */
export async function getToken() {
  const account = app.getActiveAccount();
  try {
    const r = await app.acquireTokenSilent({ scopes: CONFIG.scopes, account });
    return r.accessToken;
  } catch (e) {
    if (e instanceof msal.InteractionRequiredAuthError) {
      await app.acquireTokenRedirect({ scopes: CONFIG.scopes, account });
    }
    throw e;
  }
}
