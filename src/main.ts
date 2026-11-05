/**
 * Wiring: input → scene and sound, plus the title screen, the camera preview and the test hooks.
 *
 * Gestures:
 *   open palm  → the tree unleashes into a nebula
 *   fist       → the nebula gathers back into the tree
 *   palm left/right → orbit the tree;  palm up/down → raise or lower the view;  hand roll → a slight tilt
 *
 * URL flags:
 *   ?autostart=1  skip the title (pointer mode)
 *   ?mute=1       no sound
 */
import '@fontsource/fraunces/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/700.css';
import './style.css';
import { drawHand } from './hand-gesture-kit';
import { Input } from './input';
import { Scene } from './scene';
import { Sound } from './audio';

const q = new URLSearchParams(location.search);
const flag = (k: string) => q.get(k) === '1';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const scene = new Scene($('stage'));
const input = new Input($<HTMLVideoElement>('cam'), document.body);
const sound = new Sound();
sound.muted = flag('mute');

// The planet textures load asynchronously; keep the start buttons disabled until the scene is ready.
const startBtns = [$<HTMLButtonElement>('b-cam'), $<HTMLButtonElement>('b-mouse')];
startBtns.forEach((b) => { b.disabled = true; });
scene.ready
  .then(() => startBtns.forEach((b) => { b.disabled = false; }))
  .catch((e: Error) => { $('err').textContent = '行星贴图加载失败：' + (e?.message || e); });

// Hand-right → scene-right is a matter of taste; X flips it and the choice sticks.
const INVERT_KEY = 'tree.invertX';
let invertX = true;
try { invertX = localStorage.getItem(INVERT_KEY) !== '0'; } catch { /* storage blocked: keep the default */ }
scene.invertX = invertX;

let flashT = 0;
const hintEl = document.querySelector('.hud .hint') as HTMLElement | null;
const hintDefault = hintEl?.textContent ?? '';
function flash(msg: string) {
  if (!hintEl) return;
  hintEl.textContent = msg;
  clearTimeout(flashT);
  flashT = window.setTimeout(() => { hintEl.textContent = hintDefault; }, 1900);
}

addEventListener('keydown', (e) => {
  if (e.key !== 'x' && e.key !== 'X') return;
  invertX = !invertX;
  scene.invertX = invertX;
  try { localStorage.setItem(INVERT_KEY, invertX ? '1' : '0'); } catch { /* ignore */ }
  flash(invertX ? '左右已反转（X 再切）' : '左右已恢复（X 再切）');
});

let lockOpen = false;
let prevOpen = 0;

// ------------------------------------------------------------------ screens
function show(id: 'title' | null) {
  $('title').classList.toggle('hidden', id !== 'title');
  $('hud').classList.toggle('hidden', id === 'title');
}

function begin() {
  sound.start();
  show(null);
}

$('b-cam').addEventListener('click', async () => {
  sound.start();
  $('err').textContent = '';
  const btn = $<HTMLButtonElement>('b-cam');
  btn.textContent = '正在启动摄像头…';
  btn.disabled = true;
  try {
    await input.startCamera();
    $('preview').classList.remove('hidden');
    begin();
  } catch (e) {
    btn.textContent = '使用摄像头';
    btn.disabled = false;
    const err = e as Error & { name?: string };
    $('err').textContent = [advice(err), '', ...(await diagnose(err))].join('\n');
  }
});

/** A plain-language cause for the error name, so the message is actionable. */
function advice(e: Error & { name?: string }): string {
  switch (e?.name) {
    case 'NotAllowedError':
      return '权限被拒绝。点地址栏左侧的锁形图标 → 摄像头 → 改为「允许」→ 刷新页面。';
    case 'NotReadableError':
      return '摄像头被别的程序占用了（视频会议、OBS、另一个浏览器标签）。关掉它们再试。';
    case 'NotFoundError':
      return '系统里没有可用的摄像头设备。';
    case 'NotSupportedError':
      return '这个页面不是安全上下文，浏览器不给摄像头。必须用 localhost 或 https 打开。';
    case 'OverconstrainedError':
      return '摄像头不支持请求的分辨率。';
    default:
      return '启动失败：' + (e?.message || '未知错误') + '（若提示与模型有关，说明摄像头没问题，是模型文件没取到）。';
  }
}

/** Facts that tell a camera problem apart from a model problem. */
async function diagnose(e: Error): Promise<string[]> {
  const out: string[] = [];
  out.push('错误类型：' + (e?.name || 'Error'));
  out.push('安全上下文：' + (window.isSecureContext ? '正常' : '异常'));
  try {
    const p = await navigator.permissions.query({ name: 'camera' as PermissionName });
    out.push('权限状态：' + p.state);
  } catch { /* not queryable here */ }
  try {
    const ds = await navigator.mediaDevices.enumerateDevices();
    const cams = ds.filter((d) => d.kind === 'videoinput');
    out.push('摄像头数量：' + cams.length + (cams[0]?.label ? '（' + cams[0].label + '）' : ''));
  } catch { /* ignore */ }
  try {
    const r = await fetch('models/hand_landmarker.task', { method: 'HEAD' });
    out.push('手部模型：HTTP ' + r.status);
  } catch {
    out.push('手部模型：取不到');
  }
  return out;
}

$('b-mouse').addEventListener('click', () => { input.setMode('pointer'); begin(); });

addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (!lockOpen) { if (input.mode === 'none') { input.setMode('pointer'); begin(); } }
    lockOpen = !lockOpen;
    input.setOpen(lockOpen);
  }
  if (e.key === 'm') sound.setMuted(!sound.muted);
});
addEventListener('keyup', (e) => { if (e.code === 'Space' && !lockOpen) input.setOpen(false); });

addEventListener('resize', () => scene.resize());

if (flag('autostart')) { input.setMode('pointer'); begin(); }
else show('title');

// ------------------------------------------------------------------ camera preview (mirrored, with the tracked hand)
const pv = $<HTMLCanvasElement>('preview'), pg = pv.getContext('2d')!;
function drawPreview() {
  if (input.mode !== 'camera') return;
  const v = input.hands.video, w = pv.width, h = pv.height;
  pg.save(); pg.scale(-1, 1); pg.drawImage(v, -w, 0, w, h); pg.restore();
  if (input.hand) drawHand(pg, input.hand.landmarks, w, h, { color: '#c8ffe4', lineWidth: 2, jointRadius: 2 });
}

// ------------------------------------------------------------------ loop
let last = performance.now(), t = 0, fps = 60;
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (dt > 0) fps += (1 / dt - fps) * 0.05;
  t += dt;

  input.update(dt);
  const h = input.hand;

  // sound on the moment the hand crosses over
  if (h) {
    const open = h.openness;
    if (prevOpen < 0.55 && open >= 0.55) sound.unleash();
    else if (prevOpen > 0.55 && open <= 0.55) sound.form();
    prevOpen = open;
  }

  scene.render(h ? { x: h.screen.x, y: h.screen.y, openness: h.openness, roll: h.roll, pinch: h.pinch } : null, dt, t);

  // HUD
  const state = !h ? '未检测到手'
    : h.openness > 0.62 ? '张开 · 放大'
    : h.openness < 0.32 ? '握拳 · 缩小'
    : '调整中';
  const el = $('mode');
  if (el.textContent !== state) el.textContent = state;
  el.dataset.state = !h ? 'none' : h.openness > 0.62 ? 'open' : h.openness < 0.32 ? 'fist' : 'mid';

  drawPreview();
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ test hooks (Playwright reads these)
Object.defineProperty(window, '__tree', {
  get: () => ({
    mode: input.mode,
    hand: input.hand ? { ...input.hand.screen, openness: input.hand.openness, roll: input.hand.roll } : null,
    planets: scene.planetScreen,
    cam: scene.camState,
    fps: Math.round(fps),
    dpr: scene.renderer.getPixelRatio(),
    aspect: scene.aspect,
  }),
});
