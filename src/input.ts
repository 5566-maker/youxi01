/**
 * Every input source becomes the same thing: one hand with a screen position, an openness and a roll.
 *
 *  - Camera: MediaPipe through the kit (`createHands`).
 *  - Mouse / touch: a synthetic hand (kit `syntheticHand`) is injected at the pointer. Holding the button opens the
 *    hand (unleash), releasing it closes the fist (form the tree).
 *
 * Pointer hands are real synthetic landmarks fed through the real gesture engine, so the scene reads them exactly as
 * it reads a camera hand.
 */
import { createHands, fromScreen, toScreen, syntheticHand, type Hands, type HandInput, type Region, type Vec3 } from './hand-gesture-kit';

/** The part of the camera image that maps onto the whole screen, so players never have to reach the frame edges. */
export const REGION: Region = { x0: 0.14, x1: 0.86, y0: 0.1, y1: 0.8 };

export type Mode = 'none' | 'camera' | 'pointer';

export interface HandView {
  /** Palm centre on screen, 0..1. */
  screen: { x: number; y: number };
  /** Thumb-index pinch strength 0..1. */
  pinch: number;
  /** Mean finger extension: 0 fist … 1 open palm. */
  openness: number;
  /** Hand tilt in the image plane, radians. */
  roll: number;
  /** Debounced pose id from the engine, e.g. 'open' or 'fist'. */
  pose: string | null;
  landmarks: Vec3[];
}

/** Seconds for a held pointer to fully open the synthetic hand. */
const OPEN_S = 0.1;

export class Input {
  readonly hands: Hands;
  mode: Mode = 'none';
  /** The first tracked hand this frame, or null. */
  hand: HandView | null = null;
  private ptr = { x: 0.5, y: 0.55, down: false, open: 0, seen: false, touch: false };

  constructor(video: HTMLVideoElement, el: HTMLElement) {
    this.hands = createHands({
      video,
      config: { pose: { experimental: false } },
      numHands: 1,
      onFrame: (f) => {
        const h = f.hands[0];
        this.hand = h ? {
          screen: toScreen(h.features.center, REGION),
          pinch: h.pinch,
          openness: h.features.openness,
          roll: h.features.roll,
          pose: h.pose,
          landmarks: h.landmarks,
        } : null;
      },
    });
    const move = (e: PointerEvent) => {
      this.ptr.x = e.clientX / innerWidth;
      this.ptr.y = e.clientY / innerHeight;
      this.ptr.seen = true;
      this.ptr.touch = e.pointerType === 'touch';
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerdown', (e) => { move(e); this.ptr.down = true; });
    const up = () => { this.ptr.down = false; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }

  async startCamera() { await this.hands.startCamera(); this.setMode('camera'); }

  setMode(m: Mode) {
    this.mode = m;
    this.hands.inject(m === 'camera' ? null : []);
  }

  /** Keyboard / scripted control: hold the synthetic hand open or closed. */
  setOpen(open: boolean) {
    this.ptr.down = open;
    this.ptr.seen = true;
  }

  update(dt: number) {
    if (this.mode === 'camera') return;
    const out: HandInput[] = [];
    if (this.mode === 'pointer' && this.ptr.seen) {
      const p = this.ptr;
      p.open += ((p.down ? 1 : 0) - p.open) * Math.min(1, dt / OPEN_S);
      // on touch the hand floats a little above the finger, so the finger doesn't hide what it's reaching for
      out.push(this.synth(p.x, p.touch ? p.y - 0.08 : p.y, p.open));
    }
    this.hands.inject(out);
  }

  private synth(sx: number, sy: number, open: number): HandInput {
    const c = fromScreen({ x: sx, y: sy }, REGION);
    const curl = 1 - open;
    return syntheticHand(c.x, c.y, {
      curl: [curl * 0.85, curl, curl, curl, curl],
      pinch: 0,
    }, { scale: 0.17 });
  }
}
