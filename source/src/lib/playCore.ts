// playCore.ts — loads the real Play! WASM core and exposes a clean API.
//
// The core (Play.js / Play.wasm) is the official, precompiled Play! emulator.
// It uses SharedArrayBuffer for pthreads, so the document MUST be
// cross-origin isolated (COOP/COEP headers). Check `crossOriginIsolated`
// before calling init().

// Play.js is served from /core/Play.js (public/) so the pthread worker can
// fetch it again at runtime. Load it as a dynamic ES module import.
import type { DiscImageDevice } from './discImageDevice';
import { DiscImageDevice as DiscDevice } from './discImageDevice';

// Play.js default export: an async factory (Emscripten MODULARIZE + EXPORT_ES6).
type PlayModule = {
  FS: any;
  ccall: (name: string, ret: string, argTypes: string[], args: any[]) => any;
  cwrap: (name: string, ret: string, argTypes: string[]) => (...args: any[]) => any;
  bootDiscImage: (path: string) => void;
  bootElf: (path: string) => void;
  getFrames: () => number;
  clearStats: () => void;
  pause: () => void;
  resume: () => void;
  discImageDevice?: DiscImageDevice;
  HEAPU8: Uint8Array;
  [key: string]: any;
};

type Overrides = {
  locateFile: (path: string) => string;
  mainScriptUrlOrBlob: string;
  canvas: HTMLCanvasElement;
  print?: (t: string) => void;
  printErr?: (t: string) => void;
};

let modulePromise: Promise<PlayModule> | null = null;
let module: PlayModule | null = null;

export function isCrossOriginIsolated(): boolean {
  return typeof self !== 'undefined' && (self as any).crossOriginIsolated === true;
}

export function getCoreStatus(): 'isolated-missing' | 'loading' | 'ready' | 'error' {
  if (!isCrossOriginIsolated()) return 'isolated-missing';
  if (module) return 'ready';
  if (modulePromise) return 'loading';
  return 'loading';
}

const listeners = new Set<(state: { status: string; fps: number; message?: string }) => void>();
let lastFps = 0;

export function onCoreState(cb: (s: { status: string; fps: number; message?: string }) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function emit(s: { status: string; fps: number; message?: string }) {
  lastFps = s.fps ?? lastFps;
  listeners.forEach((cb) => cb(s));
}

export async function initCore(canvas: HTMLCanvasElement): Promise<PlayModule> {
  if (!isCrossOriginIsolated()) {
    emit({ status: 'isolated-missing', fps: 0, message: 'يحتاج عزل منشأ متقاطع (COOP/COEP). شغّل المشروع محلياً.' });
    throw new Error('cross-origin isolation required');
  }
  if (module) return module;
  if (modulePromise) return modulePromise;

  modulePromise = (async () => {
    const base = location.origin + location.pathname.replace(/[^/]*$/, '');
    const overrides: Overrides = {
      locateFile: (path: string) => base + 'core/' + path,
      mainScriptUrlOrBlob: base + 'core/Play.js',
      canvas,
      print: (t) => emit({ status: 'running', fps: lastFps, message: String(t) }),
      printErr: (t) => emit({ status: 'log', fps: lastFps, message: String(t) }),
    };
    emit({ status: 'loading', fps: 0, message: 'تحميل نواة Play!…' });
    // Dynamic import of the precompiled core served from /core/Play.js
    const coreMod = await import(/* @vite-ignore */ base + 'core/Play.js');
    const PlayFactory = coreMod.default;
    const M = (await PlayFactory(overrides)) as PlayModule;
    try { M.FS.mkdir('/work'); } catch {}
    emit({ status: 'init-vm', fps: 0, message: 'تهيئة الآلة الافتراضية…' });
    M.ccall('initVm', '', [], []);
    module = M;
    emit({ status: 'ready', fps: 0, message: 'النواة جاهزة — اختر لعبة.' });
    startFpsLoop(M);
    return M;
  })();

  try {
    return await modulePromise;
  } catch (e) {
    modulePromise = null;
    emit({ status: 'error', fps: 0, message: 'فشل تحميل النواة: ' + (e as Error).message });
    throw e;
  }
}

let fpsTimer: number | null = null;
function startFpsLoop(M: PlayModule) {
  if (fpsTimer) return;
  fpsTimer = window.setInterval(() => {
    try {
      const frames = M.getFrames();
      M.clearStats();
      emit({ status: 'running', fps: frames || 0 });
    } catch {}
  }, 1000);
}
export function stopFpsLoop() {
  if (fpsTimer) { clearInterval(fpsTimer); fpsTimer = null; }
}

export function getModule(): PlayModule | null {
  return module;
}

export function bootFile(file: File) {
  if (!module) throw new Error('Core not ready');
  const name = file.name;
  const dot = name.lastIndexOf('.');
  if (dot === -1) throw new Error('File must have an extension.');
  const ext = name.slice(dot).toLowerCase();
  if (ext === '.elf') {
    // ELF: read fully into MEMFS then boot.
    file.arrayBuffer().then((buf) => {
      const stream = module!.FS.open(name, 'w+');
      module!.FS.write(stream, new Uint8Array(buf), 0, buf.byteLength, 0);
      module!.FS.close(stream);
      module!.bootElf(name);
      emit({ status: 'running', fps: lastFps, message: 'تشغيل ELF…' });
    });
  } else {
    // Disc image (ISO/CSO/CHD/ISZ/BIN): stream via DiscImageDevice (no full RAM load).
    if (!module!.discImageDevice) module!.discImageDevice = new DiscDevice(module!);
    module!.discImageDevice.setFile(file);
    module!.bootDiscImage(name);
    emit({ status: 'running', fps: lastFps, message: 'تشغيل اللعبة…' });
  }
}

export type { PlayModule };
