// Spracheingabe – Reihenfolge der Verfahren:
// 1. Chrome-Spracherkennung direkt auf dem Gerät (processLocally), falls verfügbar – Live-Text.
// 2. Cloud-Erkennung von Chrome (Google) – nur, wenn in den Einstellungen ausdrücklich erlaubt.
// 3. Whisper im Browser (transformers.js): Aufnahme läuft lokal, Umwandlung in Text auf dem Handy.
//    Bibliothek liegt in lib/transformers; das Modell wird einmalig von Hugging Face geladen und im Browser zwischengespeichert;
//    dabei werden keine Audiodaten gesendet.
import { settings } from '../core/config.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const LANG = 'de-DE';
// Fest eingebunden (lib/transformers, siehe HERKUNFT.md) – kein fremder Code zur Laufzeit.
// Von Hugging Face werden nur die Modelldaten (Gewichte, keine Programme) geladen.
const LIB = new URL('../../lib/transformers/', import.meta.url).href;
const TRANSFORMERS = LIB + 'transformers.min.js';
const ORT_PATHS = { mjs: LIB + 'ort-wasm-simd-threaded.asyncify.mjs', wasm: LIB + 'ort-wasm-simd-threaded.asyncify.wasm' };

export const WHISPER_DEVICES = { cpu: 'Prozessor (empfohlen)', gpu: 'Grafikchip (WebGPU)' };

export const WHISPER_MODELS = {
  'onnx-community/whisper-small': 'Genau (ca. 250 MB, empfohlen)',
  'onnx-community/whisper-base': 'Schnell (ca. 80 MB)',
};

/* ---------- Chrome-Spracherkennung ---------- */

/** Prüft, ob Chrome lokal erkennen kann (und lädt das Sprachpaket bei Bedarf). */
export async function localStatus() {
  if (!SR) return 'unsupported';
  if (typeof SR.available !== 'function') return 'unknown';
  try {
    const st = await SR.available({ langs: [LANG], processLocally: true });
    if (st === 'downloadable' && typeof SR.install === 'function') {
      const ok = await SR.install({ langs: [LANG], processLocally: true });
      return ok ? 'available' : 'unavailable';
    }
    return st;
  } catch { return 'unknown'; }
}

function startWebSpeech({ local, onText, onInterim, onEnd }) {
  let active = true;
  const rec = new SR();
  rec.lang = LANG;
  rec.continuous = true;
  rec.interimResults = true;
  if (local && 'processLocally' in rec) rec.processLocally = true;
  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) onText(r[0].transcript.trim());
      else interim += r[0].transcript;
    }
    onInterim(interim);
  };
  rec.onerror = e => { if (e.error === 'not-allowed') { active = false; onEnd?.('Mikrofonzugriff wurde verweigert.'); } };
  // Android beendet die Erkennung nach Sprechpausen – solange aktiv, neu starten.
  rec.onend = () => { if (active) { try { rec.start(); } catch { active = false; onEnd?.(); } } else onEnd?.(); };
  rec.start();
  return { mode: local ? 'local' : 'cloud', async stop() { active = false; rec.stop(); } };
}

/* ---------- Whisper im Browser ---------- */

let transcriberPromise = null;
let transcriberModel = '';
/** Info zur letzten Umwandlung (für die Anzeige): backend 'WebGPU' | 'Prozessor', threads, Dauer. */
export const whisperInfo = { backend: '', threads: 1 };

/** Lädt das Whisper-Modell (einmalig, danach aus dem Browser-Cache). onProgress(0..100). */
export function loadWhisper(onProgress = () => {}) {
  const model = settings.whisperModel || Object.keys(WHISPER_MODELS)[0];
  const device = settings.whisperDevice || 'cpu'; // Auf Handys ist der Prozessor meist schneller als WebGPU
  const key = `${model}|${device}`;
  if (transcriberPromise && transcriberModel === key) return transcriberPromise;
  transcriberModel = key;
  const files = {};
  transcriberPromise = (async () => {
    const { pipeline, env } = await import(TRANSFORMERS);
    // Mehrere Prozessorkerne nur mit Cross-Origin-Isolation möglich (wird über sw.js gesetzt).
    const threads = self.crossOriginIsolated ? Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 2)) : 1;
    if (env?.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.numThreads = threads;
      env.backends.onnx.wasm.wasmPaths = ORT_PATHS; // sonst lädt die Bibliothek ihr Rechenwerk von jsDelivr
    }
    const progress_callback = p => {
      if (p.status === 'progress' && p.total) {
        files[p.file] = [p.loaded, p.total];
        const [l, t] = Object.values(files).reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
        onProgress(Math.round((l / t) * 100));
      }
    };
    const webgpu = device === 'gpu' && !!navigator.gpu && !!(await navigator.gpu.requestAdapter().catch(() => null));
    if (webgpu) {
      try {
        const t = await pipeline('automatic-speech-recognition', model, {
          device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, progress_callback,
        });
        Object.assign(whisperInfo, { backend: 'Grafikchip (WebGPU)', threads: 0 });
        return t;
      } catch (e) { console.warn('WebGPU nicht nutzbar, nutze Prozessor', e); }
    }
    const t = await pipeline('automatic-speech-recognition', model, { device: 'wasm', dtype: 'q8', progress_callback });
    Object.assign(whisperInfo, { backend: 'Prozessor', threads });
    return t;
  })();
  transcriberPromise.catch(() => { transcriberPromise = null; });
  return transcriberPromise;
}

/** Audio-Blob -> Float32Array mit 16 kHz Mono (Eingabeformat von Whisper). */
async function toPcm16k(blob) {
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    return buf.getChannelData(0);
  } finally { ctx.close(); }
}

/** Hält den Bildschirm an (sonst bricht der Bildschirmschoner die Umwandlung optisch ab). */
async function keepAwake() {
  try { return await navigator.wakeLock?.request('screen'); } catch { return null; }
}

async function startWhisper({ onText, onEnd, onStatus, onInfo }) {
  const lock = await keepAwake();
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch { throw new Error('Mikrofonzugriff wurde verweigert.'); }
  // Modell schon während der Aufnahme laden, damit es danach schneller geht.
  loadWhisper(p => onStatus?.(`Sprachmodell wird geladen … ${p}%`)).catch(() => {});
  const chunks = [];
  const rec = new MediaRecorder(stream);
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const stopped = new Promise(r => { rec.onstop = r; });
  rec.start();
  return {
    mode: 'whisper',
    async stop() {
      rec.stop();
      await stopped;
      stream.getTracks().forEach(t => t.stop());
      try {
        onStatus?.('Sprache wird umgewandelt …');
        const audio = await toPcm16k(new Blob(chunks, { type: rec.mimeType }));
        const transcriber = await loadWhisper(p => onStatus?.(`Sprachmodell wird geladen … ${p}%`));
        onStatus?.('Sprache wird umgewandelt …');
        const t0 = performance.now();
        const out = await transcriber(audio, { language: 'german', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 });
        const secs = Math.round((performance.now() - t0) / 1000);
        const cores = whisperInfo.threads ? `, ${whisperInfo.threads} ${whisperInfo.threads === 1 ? 'Kern' : 'Kerne'}` : '';
        const info = `Umgewandelt in ${secs} s (${Math.round(audio.length / 16000)} s Aufnahme, ${whisperInfo.backend}${cores}, ${(settings.whisperModel || '').includes('base') ? 'Schnell' : 'Genau'})`;
        try { localStorage.setItem('sd.lastSpeech', info); } catch { /* */ }
        onInfo?.(info);
        const text = (Array.isArray(out) ? out.map(o => o.text).join(' ') : out.text || '').trim();
        if (text) onText(text);
        onEnd?.();
      } catch (e) {
        console.error(e);
        onEnd?.(`Spracherkennung fehlgeschlagen: ${e.message}`);
      } finally { lock?.release().catch(() => {}); }
    },
  };
}

/** Prüft, ob das gewählte Whisper-Modell schon im Browser-Speicher liegt (transformers.js-Cache). */
export async function whisperCached() {
  const model = settings.whisperModel || Object.keys(WHISPER_MODELS)[0];
  try {
    const keys = await (await caches.open('transformers-cache')).keys();
    const files = keys.map(k => k.url).filter(u => u.includes(model) && u.endsWith('.onnx'));
    return files.length >= 2; // Encoder + Decoder
  } catch { return false; }
}

/* ---------- Einstieg ---------- */

/**
 * Startet die Spracheingabe mit dem besten verfügbaren Verfahren.
 * Rückgabe: { mode: 'local'|'cloud'|'whisper', stop(): Promise }
 */
export async function startDictation({ onText, onInterim, onEnd, onStatus, onInfo }) {
  const status = await localStatus();
  if (status === 'available') return startWebSpeech({ local: true, onText, onInterim, onEnd });
  if (SR && settings.allowCloudSpeech) return startWebSpeech({ local: false, onText, onInterim, onEnd });
  if (navigator.mediaDevices?.getUserMedia && window.MediaRecorder) return startWhisper({ onText, onEnd, onStatus, onInfo });
  throw new Error('Spracheingabe wird von diesem Browser nicht unterstützt.');
}
