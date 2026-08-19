// gamepad.ts — real controller & Bluetooth input layer.
//
// The official Play! web port is KEYBOARD-ONLY. This module is the remix:
// it reads real gamepads (Bluetooth or USB, OS-paired) via the Web Gamepad API,
// maps them to the PS2 controller layout, and synthesizes the keyboard events
// the core already understands — dispatched at the canvas the core listens on.
// So a real DualShock / DualSense / Xbox / 8BitDo pad actually controls games.
//
// Includes a Web Bluetooth hook for raw HID devices that aren't OS-paired.

export type PS2Button =
  | 'cross' | 'circle' | 'square' | 'triangle'
  | 'l1' | 'r1' | 'l2' | 'r2' | 'l3' | 'r3'
  | 'select' | 'start'
  | 'up' | 'down' | 'left' | 'right'
  | 'lUp' | 'lDown' | 'lLeft' | 'lRight' // left analog
  | 'rUp' | 'rDown' | 'rLeft' | 'rRight'; // right analog

// Default PS2 → keyboard code mapping (same keys the official port uses).
export const DEFAULT_BINDING: Record<PS2Button, string> = {
  cross: 'KeyZ', circle: 'KeyX', square: 'KeyA', triangle: 'KeyS',
  l1: 'Digit1', r1: 'Digit8', l2: 'Digit2', r2: 'Digit9', l3: 'Digit3', r3: 'Digit0',
  select: 'Backspace', start: 'Enter',
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
  lUp: 'KeyT', lDown: 'KeyG', lLeft: 'KeyF', lRight: 'KeyH',
  rUp: 'KeyI', rDown: 'KeyK', rLeft: 'KeyJ', rRight: 'KeyL',
};

// Standard gamepad button index → PS2 button.
const GP_BUTTON: Record<number, PS2Button> = {
  0: 'cross', 1: 'circle', 2: 'square', 3: 'triangle',
  4: 'l1', 5: 'r1', 6: 'l2', 7: 'r2',
  8: 'select', 9: 'start', 10: 'l3', 11: 'r3',
  12: 'up', 13: 'down', 14: 'left', 15: 'right',
};

// Deadzone for analog sticks.
const DEAD = 0.45;

export type GamepadInfo = { index: number; id: string; connected: boolean };

export class GamepadLayer {
  private target: HTMLElement;
  private binding: Record<PS2Button, string>;
  private pressed = new Set<string>();
  private raf = 0;
  private onConnectCb: ((pads: GamepadInfo[]) => void) | null = null;
  private prevConnected = 0;

  constructor(target: HTMLElement, binding: Record<PS2Button, string> = DEFAULT_BINDING) {
    this.target = target;
    this.binding = { ...binding };
  }

  setBinding(b: Record<PS2Button, string>) { this.binding = { ...b }; }

  start() {
    if (this.raf) return;
    window.addEventListener('gamepadconnected', this.handleConn);
    window.addEventListener('gamepaddisconnected', this.handleConn);
    this.loop();
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.removeEventListener('gamepadconnected', this.handleConn);
    window.removeEventListener('gamepaddisconnected', this.handleConn);
    // release any held keys
    this.pressed.forEach((code) => this.emit(code, false));
    this.pressed.clear();
  }

  onConnect(cb: (pads: GamepadInfo[]) => void) { this.onConnectCb = cb; }

  private handleConn = () => {
    if (this.onConnectCb) this.onConnectCb(this.list());
  };

  list(): GamepadInfo[] {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const out: GamepadInfo[] = [];
    for (const p of pads || []) if (p) out.push({ index: p.index, id: p.id, connected: true });
    if (out.length !== this.prevConnected) { this.prevConnected = out.length; if (this.onConnectCb) this.onConnectCb(out); }
    return out;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const active = new Set<string>();

    for (const gp of pads || []) {
      if (!gp) continue;
      // buttons
      for (const [idxStr, ps2] of Object.entries(GP_BUTTON)) {
        const b = gp.buttons[Number(idxStr)];
        if (b && b.pressed) active.add(this.codeFor(ps2));
      }
      // analog sticks → directional keys
      const ax = gp.axes;
      if (ax.length >= 2) {
        if (ax[0] < -DEAD) active.add(this.codeFor('lLeft'));
        if (ax[0] > DEAD) active.add(this.codeFor('lRight'));
        if (ax[1] < -DEAD) active.add(this.codeFor('lUp'));
        if (ax[1] > DEAD) active.add(this.codeFor('lDown'));
      }
      if (ax.length >= 4) {
        if (ax[2] < -DEAD) active.add(this.codeFor('rLeft'));
        if (ax[2] > DEAD) active.add(this.codeFor('rRight'));
        if (ax[3] < -DEAD) active.add(this.codeFor('rUp'));
        if (ax[3] > DEAD) active.add(this.codeFor('rDown'));
      }
    }

    // emit newly pressed
    for (const code of active) if (!this.pressed.has(code)) this.emit(code, true);
    // emit released
    for (const code of this.pressed) if (!active.has(code)) this.emit(code, false);
    this.pressed = active;
  };

  private codeFor(ps2: PS2Button): string { return this.binding[ps2]; }

  private emit(code: string, down: boolean) {
    const ev = new KeyboardEvent(down ? 'keydown' : 'keyup', {
      code, key: codeKey(code), bubbles: true, cancelable: true,
    });
    Object.defineProperty(ev, 'keyCode', { value: codeKeyCode(code) });
    this.target.dispatchEvent(ev);
  }
}

function codeKey(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ArrowUp') return 'ArrowUp';
  if (code === 'ArrowDown') return 'ArrowDown';
  if (code === 'ArrowLeft') return 'ArrowLeft';
  if (code === 'ArrowRight') return 'ArrowRight';
  if (code === 'Enter') return 'Enter';
  if (code === 'Backspace') return 'Backspace';
  return code;
}
function codeKeyCode(code: string): number {
  const map: Record<string, number> = {
    ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39,
    Enter: 13, Backspace: 8,
  };
  if (map[code] != null) return map[code];
  if (code.startsWith('Key')) return code.charCodeAt(3);
  if (code.startsWith('Digit')) return code.charCodeAt(5);
  return 0;
}

// --- Web Bluetooth (raw HID) hook for unpaired devices ---
// Limited & experimental: only works for devices exposing a GATT HID service
// and only after an explicit user gesture. Kept as an opt-in helper.
export async function connectBluetoothHid(): Promise<any> {
  const nav = navigator as any;
  if (!nav.bluetooth) return null;
  try {
    const device = await nav.bluetooth.requestDevice({
      // DualShock/DualSense expose HID over GATT; accept all for user choice.
      acceptAllDevices: true,
      optionalServices: ['00001812-0000-1000-8000-00805f9b34fb'],
    });
    await device.gatt.connect();
    // Real HID parsing is device-specific; we connect & expose the device so
    // the OS/Gamepad API can often pick it up afterwards.
    return device;
  } catch {
    return null;
  }
}
