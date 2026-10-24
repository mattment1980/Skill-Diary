# Herkunft (fest eingebunden statt per CDN – siehe docs/ARCHITEKTUR.md → Sicherheit)

- `transformers.min.js` – @huggingface/transformers 4.3.1 (Apache-2.0), `dist/transformers.min.js`
- `ort-wasm-simd-threaded.asyncify.mjs/.wasm` – onnxruntime-web 1.31.0-dev.20260914-8d85527a0 (MIT), `dist/`

Aktualisieren: `npm pack @huggingface/transformers@<v>`, passende onnxruntime-web-Version aus deren
`dependencies` packen, die drei Dateien ersetzen, Version oben und in `js/services/speech.js` anpassen.
