// discImageDevice.ts — memory-efficient disc image reader.
//
// Instead of loading a multi-GB ISO into RAM, we keep the File handle and
// read only the requested byte ranges on demand using File.slice().
// This is the key trick that lets the emulator run within tight memory.
//
// Mirrors the interface the Play! core expects from a disc device object.

export class DiscImageDevice {
  private module: any;
  private doneFlag = false;
  private file: File | null = null;

  constructor(module: any) {
    this.module = module;
  }

  setFile(file: File) {
    this.file = file;
    this.doneFlag = false;
  }

  getFileSize(): number {
    if (!this.file) throw new Error('No file set.');
    return this.file.size;
  }

  isDone(): boolean {
    return this.doneFlag;
  }

  // Called by the core (C++) to read `size` bytes at `offset` into HEAPU8[dstPtr].
  // We serve it asynchronously via slice(); the core polls isDone().
  read(dstPtr: number, offset: number, size: number) {
    if (!this.file) throw new Error('No file set.');
    this.doneFlag = false;
    const sub = this.file.slice(offset, offset + size);
    sub
      .arrayBuffer()
      .then((buf: ArrayBuffer) => {
        const HEAPU8 = this.module.HEAPU8 as Uint8Array;
        HEAPU8.set(new Uint8Array(buf), dstPtr);
        this.doneFlag = true;
      })
      .catch(() => {
        this.doneFlag = true; // unblock the core even on failure
      });
  }
}
