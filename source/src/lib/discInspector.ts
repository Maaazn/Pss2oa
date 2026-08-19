// discInspector.ts — surgical PS2 disc image inspector.
//
// Real emulator knowledge: the PS2 boots by reading the ISO9660 Primary
// Volume Descriptor (sector 16), walking the root directory to find SYSTEM.CNF,
// parsing `BOOT2 = cdrom0:\SCES_123.45;1`, then loading that ELF.
//
// Supports:
//  - ISO / BIN: raw ISO9660, direct slice reads (zero RAM).
//  - CSO (CISO): zlib-compressed PS2 images — decompresses only the blocks
//    actually requested, on demand, via the native DecompressionStream.
// CHD is out of scope (LZMA+hunk format) — reported as unsupported.

const SECTOR = 2048;

export interface DiscFile { name: string; lba: number; size: number; isDir: boolean; }
export interface DiscInfo {
  format: string;
  volumeLabel: string;
  bootPath: string;      // from SYSTEM.CNF BOOT2
  serial: string;        // e.g. SCES_123.45
  region: string;        // PAL / NTSC-U / NTSC-J / ...
  systemCnf: string;     // raw SYSTEM.CNF text
  files: DiscFile[];     // top-level directory
  sizeBytes: number;
  warnings: string[];
}

interface SectorReader { size: number; read(off: number, len: number): Promise<Uint8Array>; }

class RawReader implements SectorReader {
  constructor(private file: File) {}
  get size() { return this.file.size; }
  async read(off: number, len: number) {
    const end = Math.min(off + len, this.size);
    const buf = await this.file.slice(off, end).arrayBuffer();
    return new Uint8Array(buf);
  }
}

class CsoReader implements SectorReader {
  private block: number;
  private align: number;
  private totalSize: number;
  private index: Uint32Array;
  private cache = new Map<number, Uint8Array>();
  private constructor(private file: File, block: number, align: number, totalSize: number, index: Uint32Array) {
    this.block = block;
    this.align = align;
    this.totalSize = totalSize;
    this.index = index;
  }
  get size() { return this.totalSize; }
  static async create(file: File): Promise<CsoReader> {
    const hbuf = await file.slice(0, 24).arrayBuffer();
    const dv = new DataView(hbuf);
    const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
    if (magic !== 'CISO') throw new Error('Not a CSO file');
    const block = dv.getUint32(16, true);
    const align = dv.getUint8(21);
    const totalSize = Number(dv.getBigUint64(8, true));
    const totalBlocks = Math.ceil(totalSize / block) + 1;
    const indexBuf = await file.slice(24, 24 + totalBlocks * 4).arrayBuffer();
    const index = new Uint32Array(indexBuf);
    return new CsoReader(file, block, align, totalSize, index);
  }
  private async blockAt(n: number): Promise<Uint8Array> {
    const cached = this.cache.get(n);
    if (cached) return cached;
    const frame = this.index[n] & 0x7fffffff;
    const next = this.index[n + 1] & 0x7fffffff;
    const plain = (this.index[n] & 0x80000000) !== 0;
    const off = frame << this.align;
    let data: Uint8Array;
    if (plain) {
      data = new Uint8Array(await this.file.slice(off, off + this.block).arrayBuffer());
    } else {
      const compLen = (next - frame) << this.align;
      const comp = new Uint8Array(await this.file.slice(off, off + compLen).arrayBuffer());
      data = await inflateRaw(comp);
    }
    if (data.length > this.block) data = data.slice(0, this.block);
    this.cache.set(n, data);
    // bound cache
    if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value!);
    return data;
  }
  async read(off: number, len: number) {
    const out = new Uint8Array(len);
    let pos = 0;
    let cur = off;
    while (pos < len && cur < this.size) {
      const blockNo = Math.floor(cur / this.block);
      const within = cur % this.block;
      const need = Math.min(this.block - within, len - pos, this.size - cur);
      const blk = await this.blockAt(blockNo);
      out.set(blk.subarray(within, within + need), pos);
      pos += need; cur += need;
    }
    return out.subarray(0, pos);
  }
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const D: any = (globalThis as any).DecompressionStream;
  if (!D) throw new Error('DecompressionStream unavailable');
  const ds = new D('deflate-raw');
  const ab = new ArrayBuffer(data.length);
  new Uint8Array(ab).set(data);
  const stream = new Blob([ab]).stream().pipeThrough(ds);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
    total += (value as Uint8Array).length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

async function createReader(file: File, ext: string): Promise<SectorReader> {
  if (ext === '.cso') return await CsoReader.create(file);
  return new RawReader(file);
}

function str(bytes: Uint8Array, start: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = bytes[start + i];
    // keep printable chars, newlines and tabs; skip other control bytes
    if ((c >= 32 && c < 127) || c === 10 || c === 9 || c === 13) s += String.fromCharCode(c);
  }
  return s.trim();
}

// Parse one ISO9660 directory record. Returns null at end of directory.
interface DirEnt { name: string; lba: number; size: number; isDir: boolean; }
function parseDirRec(buf: Uint8Array, off: number): { ent: DirEnt | null; next: number } {
  const recLen = buf[off];
  if (recLen === 0) return { ent: null, next: 0 }; // padding to sector boundary
  const lba = buf[off + 2] | (buf[off + 3] << 8) | (buf[off + 4] << 16) | (buf[off + 5] << 24);
  const sizeLo = buf[off + 10] | (buf[off + 11] << 8) | (buf[off + 12] << 16) | (buf[off + 13] << 24);
  const flags = buf[off + 25];
  const nameLen = buf[off + 32];
  let name = '';
  for (let i = 0; i < nameLen; i++) {
    const c = buf[off + 33 + i];
    if (c === 0) break;
    name += String.fromCharCode(c);
  }
  return { ent: { name, lba, size: sizeLo >>> 0, isDir: (flags & 2) !== 0 }, next: off + recLen };
}

function detectRegion(serial: string): string {
  const s = serial.toUpperCase();
  if (s.startsWith('SCES') || s.startsWith('SLES')) return 'PAL · أوروبا';
  if (s.startsWith('SCUS') || s.startsWith('SLUS')) return 'NTSC-U · أمريكا';
  if (s.startsWith('SCPS') || s.startsWith('SLPS') || s.startsWith('SLPM')) return 'NTSC-J · اليابان';
  if (s.startsWith('SCKA') || s.startsWith('SLKA')) return 'NTSC-K · كوريا';
  if (s.startsWith('SIPS')) return 'NTSC-J · آسيا';
  return 'غير معروف';
}

export async function inspectDisc(file: File): Promise<DiscInfo> {
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
  const warnings: string[] = [];
  if (ext === '.chd') warnings.push('صيغة CHD غير مدعومة في المحلّل (CSO/ISO فقط).');
  if (ext === '.isz') warnings.push('ISZ غير مدعوم في المحلّل (CSO/ISO فقط).');
  if (ext === '.elf') {
    return { format: 'ELF', volumeLabel: file.name, bootPath: file.name, serial: '', region: '', systemCnf: '', files: [], sizeBytes: file.size, warnings: ['ملف ELF قابل للتشغيل مباشرة.'] };
  }

  const reader = await createReader(file, ext);
  // Primary Volume Descriptor at sector 16 (0x8000).
  const pvd = await reader.read(0x8000, SECTOR);
  const cd001 = str(pvd, 1, 5);
  if (cd001 !== 'CD001') throw new Error('ليس قرص ISO9660 صالح');
  const volumeLabel = str(pvd, 40, 32);
  // Root Directory Record at PVD offset 156.
  const root = parseDirRec(pvd, 156).ent!;

  // Walk root directory.
  const rootBuf = await reader.read(root.lba * SECTOR, Math.max(SECTOR, Math.ceil(root.size / SECTOR) * SECTOR));
  const files: DiscFile[] = [];
  const entries: DirEnt[] = [];
  let off = 0;
  while (off < rootBuf.length) {
    const { ent, next } = parseDirRec(rootBuf, off);
    if (!ent) { off = (Math.floor(off / SECTOR) + 1) * SECTOR; if (off >= root.size) break; continue; }
    if (ent.name !== '\u0000' && ent.name !== '\u0001' && !ent.name.startsWith('\u0000')) {
      entries.push(ent);
      files.push({ name: ent.name, lba: ent.lba, size: ent.size, isDir: ent.isDir });
    }
    off = next;
    if (next <= 0 || next >= root.size) break;
  }

  // Find & read SYSTEM.CNF.
  const cnfEnt = entries.find((e) => e.name.toUpperCase().includes('SYSTEM.CNF'));
  let systemCnf = '', bootPath = '', serial = '', region = '';
  if (cnfEnt) {
    const cnfBuf = await reader.read(cnfEnt.lba * SECTOR, cnfEnt.size);
    systemCnf = str(cnfBuf, 0, cnfBuf.length);
    const m = systemCnf.match(/BOOT2\s*=\s*\\?([^;]+)/i);
    if (m) {
      bootPath = m[1].trim().replace(/^\\/, '');
      const sm = bootPath.match(/([A-Z]{4}_\d+\.\d+)/i);
      if (sm) { serial = sm[1].toUpperCase(); region = detectRegion(serial); }
    }
  } else {
    warnings.push('لم يُعثر على SYSTEM.CNF (قد يكون القرص بصيغة غير قياسية).');
  }

  return {
    format: ext === '.cso' ? 'CSO (مضغوط)' : 'ISO9660',
    volumeLabel: volumeLabel || '(بدون اسم)',
    bootPath, serial, region, systemCnf, files, sizeBytes: file.size, warnings,
  };
}
