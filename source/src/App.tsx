import { useEffect, useRef, useState, useCallback } from 'react';
import {
  initCore, onCoreState, bootFile, isCrossOriginIsolated, getModule,
} from './lib/playCore';
import { GamepadLayer, DEFAULT_BINDING, type PS2Button, type GamepadInfo } from './lib/gamepad';
import { inspectDisc, type DiscInfo } from './lib/discInspector';

type CoreState = { status: string; fps: number; message?: string };
type GameEntry = { name: string; size: number; file: File };

const PS2_CONTROLS: { ps2: string; key: string }[] = [
  { ps2: 'D-Pad', key: 'الأسهم' }, { ps2: 'أنالوج يسار', key: 'F H T G' },
  { ps2: 'أنالوج يمين', key: 'J L I K' }, { ps2: 'مربع', key: 'A' },
  { ps2: 'إكس', key: 'Z' }, { ps2: 'مثلث', key: 'S' }, { ps2: 'دائرة', key: 'X' },
  { ps2: 'Start', key: 'Enter' }, { ps2: 'Select', key: 'Backspace' },
  { ps2: 'L1 / L2 / L3', key: '1 / 2 / 3' }, { ps2: 'R1 / R2 / R3', key: '8 / 9 / 0' },
];

const FACE_BUTTONS: PS2Button[] = ['cross', 'circle', 'square', 'triangle', 'l1', 'r1', 'l2', 'r2', 'select', 'start'];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const gpLayer = useRef<GamepadLayer | null>(null);

  const [isolated] = useState<boolean>(isCrossOriginIsolated());
  const [core, setCore] = useState<CoreState>({ status: 'idle', fps: 0 });
  const [pads, setPads] = useState<GamepadInfo[]>([]);
  const [library, setLibrary] = useState<GameEntry[]>([]);
  const [discInfo, setDiscInfo] = useState<DiscInfo | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [current, setCurrent] = useState<string>('');
  const [cinema, setCinema] = useState(false);
  const [tab, setTab] = useState<'library' | 'disc' | 'controller' | 'controls' | 'about'>('library');
  const [rebinding, setRebinding] = useState<PS2Button | null>(null);
  const [binding, setBinding] = useState<Record<PS2Button, string>>(DEFAULT_BINDING);

  // Init core + gamepad layer once the canvas exists and the page is isolated.
  useEffect(() => {
    if (!isolated || !canvasRef.current) return;
    let alive = true;
    const off = onCoreState((s) => alive && setCore(s));
    initCore(canvasRef.current).catch(() => {});
    // Gamepad layer targets the canvas (where the core listens for keys).
    const layer = new GamepadLayer(canvasRef.current, binding);
    layer.onConnect(setPads);
    layer.start();
    gpLayer.current = layer;
    return () => { alive = false; off(); layer.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isolated]);

  // Rebind handler: capture next physical keypress for the selected PS2 button.
  useEffect(() => {
    if (!rebinding) return;
    const h = (e: KeyboardEvent) => {
      e.preventDefault();
      setBinding((b) => ({ ...b, [rebinding]: e.code }));
      gpLayer.current?.setBinding({ ...binding, [rebinding]: e.code });
      setRebinding(null);
    };
    window.addEventListener('keydown', h, { once: true });
    return () => window.removeEventListener('keydown', h);
  }, [rebinding, binding]);

  const onPickFile = useCallback(async (file: File) => {
    setLibrary((l) => l.some((g) => g.name === file.name) ? l : [{ name: file.name, size: file.size, file }, ...l].slice(0, 12));
    setCurrent(file.name);
    setDiscInfo(null);
    setInspecting(true);
    inspectDisc(file).then(setDiscInfo).catch((e) => setDiscInfo({ format: 'خطأ', volumeLabel: '', bootPath: '', serial: '', region: '', systemCnf: '', files: [], sizeBytes: file.size, warnings: [e.message] })).finally(() => setInspecting(false));
    const tryBoot = () => {
      const m = getModule();
      if (m) { bootFile(file); }
      else { setTimeout(tryBoot, 300); }
    };
    tryBoot();
  }, []);

  const loadSample = useCallback(async (name = 'sample.iso') => {
    try {
      const res = await fetch(new URL(name, location.href));
      const blob = await res.blob();
      onPickFile(new File([blob], name, { type: 'application/octet-stream' }));
    } catch {}
  }, [onPickFile]);

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onPickFile(f);
    e.target.value = '';
  };

  const statusText = !isolated ? 'معاينة فقط' : core.message || core.status;

  return (
    <div className="flex h-full flex-col" dir="rtl">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-ps2-border bg-ps2-panel/60 px-4 py-3 backdrop-blur">
        <Logo />
        <div className="mr-1">
          <div className="text-sm font-bold tracking-tight">Pss2oa <span className="text-ps2-muted font-normal">· Play! Web Core</span></div>
          <div className="text-[11px] text-ps2-muted">واجهة محاكي PlayStation 2 مستقلة داخل المتصفح</div>
        </div>
        <div className="mr-auto flex items-center gap-2">
          <span className={`chip ${core.status === 'running' ? 'text-ps2-green border-ps2-green/30' : ''}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${core.status === 'running' ? 'bg-ps2-green' : 'bg-ps2-muted'} ${core.status === 'running' ? 'pulse-soft' : ''}`} />
            {isolated ? `${core.fps} FPS` : '—'}
          </span>
          <span className={`chip ${pads.length ? 'text-ps2-accent2 border-ps2-accent2/30' : ''}`}>
            🎮 {pads.length ? pads.length : isolated ? 'لا يوجد' : 'N/A'}
          </span>
          <button className="btn" onClick={() => setCinema((c) => !c)} title="وضع السينما">
            {cinema ? 'إغلاق' : '🎬 سينما'}
          </button>
        </div>
      </header>

      {/* Isolation banner */}
      {!isolated && (
        <div className="border-b border-ps2-red/30 bg-ps2-red/10 px-4 py-2.5 text-xs text-ps2-red/90">
          <strong>المعاينة لا تستطيع تشغيل الألعاب.</strong> النواة تحتاج عزل منشأ متقاطع (COOP/COEP) غير متوفر هنا.
          شغّل المشروع محلياً: <code className="rounded bg-black/40 px-1 py-0.5">npm install && npm start</code> ثم افتح <code className="rounded bg-black/40 px-1 py-0.5">http://localhost:5000</code>.
        </div>
      )}

      {/* Main */}
      <main className="grid flex-1 min-h-0 grid-cols-1 gap-3 overflow-hidden p-3 lg:grid-cols-[1fr_360px]">
        {/* Display column */}
        <section className="flex min-h-0 flex-col gap-3">
          <div className="relative scanline overflow-hidden rounded-xl border border-ps2-border bg-black">
            <canvas id="canvas" ref={canvasRef} width={640} height={480} className="emu-canvas" tabIndex={0} />
            {!isolated && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-center p-6">
                <div className="text-4xl opacity-30">🎮</div>
                <div className="text-sm text-ps2-muted">شاشة المحاكي تظهر هنا عند التشغيل المحلي</div>
                <div className="text-[11px] text-ps2-muted/70">النواة (Play.wasm) تحتاج SharedArrayBuffer</div>
              </div>
            )}
            {isolated && core.status !== 'running' && (
              <div className="absolute bottom-2 right-2 chip bg-black/60">{statusText}</div>
            )}
          </div>

          {/* Transport */}
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileInput} type="file" accept=".iso,.cso,.chd,.isz,.bin,.elf" onChange={onInput} className="hidden" />
            <button className="btn btn-primary" onClick={() => fileInput.current?.click()}>📥 تحميل لعبة (ISO/CSO/CHD/BIN/ELF)</button>
            <button className="btn" disabled={!isolated} onClick={() => { const m = getModule(); m?.pause?.(); }}>⏸ إيقاف</button>
            <button className="btn" disabled={!isolated} onClick={() => { const m = getModule(); m?.resume?.(); }}>▶ استئناف</button>
            {current && <span className="chip text-ps2-gold border-ps2-gold/30">الآن: {current}</span>}
          </div>
        </section>

        {/* Side panel */}
        <aside className="panel flex min-h-0 flex-col overflow-hidden">
          <div className="flex border-b border-ps2-border text-xs">
            {([['library', 'المكتبة'], ['disc', 'القرص'], ['controller', 'التحكّم'], ['controls', 'الأزرار'], ['about', 'حول']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`flex-1 px-2 py-2.5 font-medium transition ${tab === k ? 'bg-ps2-panel2 text-ps2-accent2 border-b-2 border-ps2-accent2' : 'text-ps2-muted hover:text-white'}`}>
                {l}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {tab === 'library' && <LibraryTab library={library} onPick={(g) => onPickFile(g.file)} onBrowse={() => fileInput.current?.click()} onLoadSample={loadSample} />}
            {tab === 'disc' && <DiscTab info={discInfo} inspecting={inspecting} />}
            {tab === 'controller' && <ControllerTab pads={pads} binding={binding} rebinding={rebinding} setRebinding={setRebinding} faceButtons={FACE_BUTTONS} isolated={isolated} />}
            {tab === 'controls' && <ControlsTab />}
            {tab === 'about' && <AboutTab />}
          </div>
        </aside>
      </main>

      {cinema && isolated && (
        <div className="cinema" onClick={(e) => { if (e.target === e.currentTarget) setCinema(false); }}>
          <canvas id="canvas-cinema" width={640} height={480} className="emu-canvas" style={{ aspectRatio: '4/3' }} />
          <button className="btn absolute top-3 left-3" onClick={() => setCinema(false)}>إغلاق ✕</button>
        </div>
      )}
    </div>
  );
}

function Logo() {
  return (
    <svg width="34" height="34" viewBox="0 0 32 32" className="shrink-0">
      <rect width="32" height="32" rx="8" fill="#0070d1" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="#1ed7ff" strokeWidth="2" />
      <circle cx="16" cy="16" r="2.4" fill="#1ed7ff" />
      <path d="M9.5 7.8c2 1.5 2.8 3.2 2.8 5" stroke="#e6e8ef" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M22.5 7.8c-2 1.5-2.8 3.2-2.8 5" stroke="#e6e8ef" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function LibraryTab({ library, onPick, onBrowse, onLoadSample }: { library: GameEntry[]; onPick: (g: GameEntry) => void; onBrowse: () => void; onLoadSample: (name?: string) => void }) {
  if (!library.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-ps2-muted">
        <div className="text-4xl opacity-30">💿</div>
        <div className="text-sm">لا توجد ألعاب بعد</div>
        <button className="btn btn-primary" onClick={onBrowse}>اختر ملف ISO / CSO / CHD</button>
        <button className="btn" onClick={() => onLoadSample('sample.iso')}>جرّب قرص ISO نموذجي</button>
        <button className="btn" onClick={() => onLoadSample('sample.cso')}>جرّب قرص CSO مضغوط</button>
        <div className="text-[11px] text-ps2-muted/70">يدعم: ISO, CSO, CHD, ISZ, BIN, ELF — بدون BIOS</div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {library.map((g) => (
        <button key={g.name} onClick={() => onPick(g)} className="panel-2 group flex w-full items-center gap-3 p-2.5 text-right transition hover:border-ps2-accent2/50">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ps2-bg text-ps2-gold">💿</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{g.name}</div>
            <div className="text-[11px] text-ps2-muted">{(g.size / 1024 / 1024).toFixed(0)} MB</div>
          </div>
          <span className="text-[11px] text-ps2-accent2 opacity-0 group-hover:opacity-100">تشغيل ▸</span>
        </button>
      ))}
    </div>
  );
}

function ControllerTab({ pads, binding, rebinding, setRebinding, faceButtons, isolated }: {
  pads: GamepadInfo[]; binding: Record<PS2Button, string>; rebinding: PS2Button | null; setRebinding: (b: PS2Button | null) => void; faceButtons: PS2Button[]; isolated: boolean;
}) {
  const labels: Record<string, string> = { cross: 'إكس ✕', circle: 'دائرة ○', square: 'مربع □', triangle: 'مثلث △', l1: 'L1', r1: 'R1', l2: 'L2', r2: 'R2', select: 'Select', start: 'Start' };
  return (
    <div className="space-y-3">
      <div className="panel-2 p-3">
        <div className="label mb-2">اليد المتصلة</div>
        {!isolated ? (
          <div className="text-xs text-ps2-muted">غير متاح في المعاينة — يعمل محلياً وأثناء التشغيل.</div>
        ) : pads.length ? pads.map((p) => (
          <div key={p.index} className="chip text-ps2-green border-ps2-green/30">🎮 {p.id.slice(0, 28)}</div>
        )) : (
          <div className="text-xs text-ps2-muted">لا يوجد. وصّل يد (USB أو بلوثوث) ثم اضغط زراً.</div>
        )}
        <div className="mt-2 text-[11px] text-ps2-muted/70">يدعم DualShock، DualSense، Xbox، 8BitDo وأي يد متوافقة مع Web Gamepad.</div>
      </div>

      <div className="panel-2 p-3">
        <div className="label mb-2">تعديل الأزرار (إعادة الربط)</div>
        <div className="space-y-1.5">
          {faceButtons.map((b) => (
            <div key={b} className="flex items-center justify-between rounded-lg bg-ps2-bg/60 px-2.5 py-1.5">
              <span className="text-xs text-ps2-muted">{labels[b]}</span>
              <button onClick={() => setRebinding(rebinding === b ? null : b)}
                className={`rounded-md border px-2 py-0.5 text-[11px] ${rebinding === b ? 'border-ps2-accent2 text-ps2-accent2 pulse-soft' : 'border-ps2-border text-white'}`}>
                {rebinding === b ? 'اضغط زراً…' : binding[b]}
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 text-[11px] text-ps2-muted/60">اضغط زراً وسيتم تسجيله. التغيير فوري على اليد.</div>
      </div>
    </div>
  );
}

function ControlsTab() {
  return (
    <div className="space-y-2">
      <div className="label">مرجع أزرار لوحة المفاتيح</div>
      <div className="panel-2 divide-y divide-ps2-border">
        {PS2_CONTROLS.map((c) => (
          <div key={c.ps2} className="flex items-center justify-between px-3 py-2 text-xs">
            <span className="text-ps2-muted">{c.ps2}</span>
            <span className="font-mono text-ps2-accent2">{c.key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AboutTab() {
  return (
    <div className="space-y-3 text-xs text-ps2-muted leading-relaxed">
      <p><strong className="text-white">Pss2oa</strong> واجهة وتكامل ويب مستقلان لمحاكاة <strong className="text-white">PlayStation 2</strong>، ويستخدمان نواة <strong className="text-ps2-accent2">Play!</strong> المفتوحة المصدر (C++ → WebAssembly عبر Emscripten).</p>
      <p className="text-ps2-gold">✦ ما يضيفه Pss2oa إلى تجربة الويب:</p>
      <ul className="space-y-1 pr-4">
        <li>• طبقة تحكّم كاملة: يد بلوثوث/USB عبر Web Gamepad.</li>
        <li>• إعادة ربط الأزرار لكل زر.</li>
        <li>• بث ISO ذكي: قراءة بالنطاقات فقط عبر <code>File.slice()</code> — لا تحميل كامل للـ RAM.</li>
        <li>• واجهة عربية RTL بطابع PS2، مكتبة ألعاب، وضع سينما.</li>
      </ul>
      <p className="text-ps2-muted/70">يعمل بلا BIOS خارجي، لكن التوافق والأداء يختلفان حسب العنوان والمتصفح والجهاز. Chrome/Firefox على الحاسوب موصى بهما. هذا مشروع تجريبي وتعليمي.</p>
      <p className="text-ps2-muted/70">Pss2oa غير تابع لـPlay! أو Jean-Philip Desjardins ولا يحظى بتأييدهما. يُرجى استخدام صور ألعاب أو ELF تملك حق استعمالها فقط.</p>
      <div className="pt-2 text-[11px] text-ps2-muted/50">
        النواة التقنية: <a className="text-ps2-accent2 underline" href="https://github.com/jpd002/Play-" target="_blank" rel="noreferrer">github.com/jpd002/Play-</a> ·
        النسخة الرسمية: <a className="text-ps2-accent2 underline" href="https://playjs.purei.org" target="_blank" rel="noreferrer">playjs.purei.org</a>
      </div>
    </div>
  );
}

function DiscTab({ info, inspecting }: { info: DiscInfo | null; inspecting: boolean }) {
  if (inspecting) {
    return <div className="flex h-full items-center justify-center text-xs text-ps2-muted pulse-soft">تحليل بنية القرص…</div>;
  }
  if (!info) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-ps2-muted">
        <div className="text-3xl opacity-30">🔍</div>
        <div className="text-xs">حمّل قرصاً لتحليل بنيته الفعلية</div>
        <div className="text-[11px] text-ps2-muted/60">يفك بنية ISO9660 / CSO ويستخرج مسار الإقلاع</div>
      </div>
    );
  }
  const err = info.format === 'خطأ';
  return (
    <div className="space-y-3 text-xs">
      {err && info.warnings.map((w, i) => <div key={i} className="rounded-lg bg-ps2-red/10 px-3 py-2 text-ps2-red">{w}</div>)}
      {!err && (
        <>
          <div className="panel-2 p-3 space-y-2">
            <Row k="الصيغة" v={info.format} />
            <Row k="اسم المجلد" v={info.volumeLabel} mono />
            <Row k="رقم القرص" v={info.serial || '—'} mono accent />
            <Row k="المنطقة" v={info.region || '—'} />
            <Row k="مسار الإقلاع" v={info.bootPath || '—'} mono />
            <Row k="الحجم" v={info.sizeBytes >= 1048576 ? `${(info.sizeBytes / 1024 / 1024).toFixed(0)} MB` : `${(info.sizeBytes / 1024).toFixed(0)} KB`} />
          </div>
          {info.serial && (
            <div className="rounded-lg border border-ps2-gold/30 bg-ps2-gold/10 px-3 py-2 text-ps2-gold">
              ✦ كيف يقلع PS2 فعلاً: يقرأ <code>SYSTEM.CNF</code> ← <code>BOOT2 = {info.bootPath || '...'}</code> ← يشغّل الـ ELF.
            </div>
          )}
          {info.files.length > 0 && (
            <div className="panel-2 p-2">
              <div className="label px-1 pb-2">ملفات القرص ({info.files.length})</div>
              <div className="max-h-56 overflow-y-auto space-y-0.5">
                {info.files.slice(0, 60).map((f) => (
                  <div key={f.name + f.lba} className="flex items-center justify-between px-2 py-1 rounded hover:bg-ps2-bg/50">
                    <span className="truncate font-mono text-[11px] text-ps2-muted">{f.isDir ? '📁 ' : '📄 '}{f.name.replace(';1', '')}</span>
                    <span className="text-[10px] text-ps2-muted/60">{f.size > 0 ? `${(f.size / 1024).toFixed(0)} KB` : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {info.systemCnf && (
            <div className="panel-2 p-2">
              <div className="label px-1 pb-1">SYSTEM.CNF</div>
              <pre className="whitespace-pre-wrap break-words px-2 py-1 font-mono text-[10px] text-ps2-accent2/80">{info.systemCnf.slice(0, 400)}</pre>
            </div>
          )}
          {info.warnings.map((w, i) => <div key={i} className="text-[11px] text-ps2-muted/60">⚠ {w}</div>)}
        </>
      )}
    </div>
  );
}

function Row({ k, v, mono, accent }: { k: string; v: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ps2-muted">{k}</span>
      <span className={`${mono ? 'font-mono' : ''} text-left ${accent ? 'text-ps2-gold' : 'text-white'}`}>{v}</span>
    </div>
  );
}
