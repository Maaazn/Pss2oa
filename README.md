# Pss2oa

**Pss2oa** is an independent, desktop-oriented web interface and integration layer for the Play! PlayStation 2 WebAssembly core. It focuses on local disc-image selection, streamed disc access, Arabic RTL interface design, and browser gamepad support.

> Pss2oa is **not affiliated with, endorsed by, maintained by, or an official release of Play! or Jean-Philip Desjardins**. The project thanks Play! for its foundational technical work on high-level PlayStation 2 emulation.

## Live version

The verified production build is available at **[pss2oa.pages.dev](https://pss2oa.pages.dev/?v=68fd3b7)**.

## What is included

The project includes a compiled Play! WebAssembly core under `public/core/`, a browser interface, ISO/CSO inspection utilities, and a controller mapping layer. Pss2oa does not contain PlayStation 2 BIOS files, commercial games, game keys, or download links.

Users select a disc image or executable they are legally allowed to use. ISO reading is performed through browser file APIs, and the application does not need to upload the selected disc image to a server.

## Runtime requirement

The Play! WebAssembly build uses threads and `SharedArrayBuffer`. A production host must therefore send cross-origin isolation headers. The supplied [`public/_headers`](./public/_headers) file sets the needed `COOP` and `COEP` values for hosts that support static header rules, such as Cloudflare Pages.

GitHub Pages can store this project but cannot supply the required response headers for the running emulator core. The provided `server.js` is suitable for a local isolated test server.

## Running locally

```bash
npm install
npm start
```

Then open `http://localhost:5000` in a modern desktop browser. Chrome or Firefox is recommended for the experimental web runtime.

## Legal and third-party information

Read [LEGAL.md](./LEGAL.md) for responsible-use terms and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for the Play! attribution. The complete Play! redistribution license is preserved in [`LICENSES/Play-LICENSE.txt`](./LICENSES/Play-LICENSE.txt).
