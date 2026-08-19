# Cloudflare Pages Deployment

Pss2oa needs cross-origin isolation to make `SharedArrayBuffer` available to the threaded Play! WebAssembly core. The required headers are supplied in [`public/_headers`](./public/_headers) and are copied to the build output as `dist/_headers`.

Create a Cloudflare Pages project connected to this repository with the following values:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| Root directory | repository root |

After the first deployment, open the page in a desktop browser and verify that `crossOriginIsolated` is true before loading a locally owned disc image. The site must remain HTTPS and the `_headers` file must remain in the deployed output.

Pss2oa does not upload or host the selected game image. Users remain responsible for using only games and executables they own or are authorized to use.
