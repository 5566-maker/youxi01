// Puts MediaPipe's files where the game loads them (runs before `dev` and `build`):
//   public/wasm/                         copied from node_modules/@mediapipe/tasks-vision/wasm (JS and wasm must match)
//   public/models/hand_landmarker.task   Google's hand model, downloaded once (about 7.8 MB)
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const src = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
if (!existsSync(src)) {
  console.error('Missing node_modules/@mediapipe/tasks-vision/wasm. Run `npm install` first.');
  process.exit(1);
}
const wasm = join(root, 'public/wasm');
mkdirSync(wasm, { recursive: true });
for (const f of readdirSync(src)) cpSync(join(src, f), join(wasm, f));

const model = join(root, 'public/models/hand_landmarker.task');
if (!existsSync(model)) {
  mkdirSync(dirname(model), { recursive: true });
  console.log('Downloading the MediaPipe hand model…');
  const res = await fetch(MODEL_URL);
  if (!res.ok) { console.error(`Model download failed: HTTP ${res.status}. Download it by hand from ${MODEL_URL}`); process.exit(1); }
  writeFileSync(model, Buffer.from(await res.arrayBuffer()));
}
console.log('MediaPipe assets ready in public/wasm and public/models');
