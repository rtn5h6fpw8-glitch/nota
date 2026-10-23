// Speech recognition for lyrics, run in its own thread so the app stays smooth.
// Whisper runs on the phone itself; the model is downloaded once and kept by the browser.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';

env.allowLocalModels = false;
/* GitHub Pages cannot turn on shared memory, so the engine runs on one thread */
env.backends.onnx.wasm.numThreads = 1;

const pipes = {};
self.onmessage = async ({ data }) => {
  const { id, model, audio } = data;
  try {
    if (!pipes[model]) {
      pipes[model] = pipeline('automatic-speech-recognition', model, {
        dtype: 'q8', device: 'wasm',
        progress_callback: (p) => { if (p.status === 'progress' && p.total) self.postMessage({ id, type: 'load', file: p.file, loaded: p.loaded, total: p.total }); },
      });
    }
    const asr = await pipes[model];
    self.postMessage({ id, type: 'run' });
    const out = await asr(audio, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true, task: 'transcribe' });
    self.postMessage({ id, type: 'done', chunks: (out.chunks || []).map((c) => ({ s: c.timestamp[0], e: c.timestamp[1], text: c.text })) });
  } catch (e) {
    pipes[model] = null;
    self.postMessage({ id, type: 'error', message: String((e && e.message) || e) });
  }
};
