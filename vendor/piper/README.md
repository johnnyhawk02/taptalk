# Piper voice engine

Runs natural-sounding Piper voices inside TapTalk (see js/piper.js).

- `piper_phonemize.*`: from npm `@diffusionstudio/piper-wasm@1.0.0` (espeak-ng, GPL-3.0; piper-phonemize, MIT).
- `ort.wasm.bundle.min.mjs`, `ort-wasm-simd-threaded.wasm`: from npm `onnxruntime-web@1.24.3` (MIT).

Voice models are downloaded on the device from https://huggingface.co/rhasspy/piper-voices (v1.0.0).
