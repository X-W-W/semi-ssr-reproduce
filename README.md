# Semi SSR Root Import Repro

Minimal standalone reproduction for the server-side crash triggered by importing `Button` from the `@douyinfe/semi-ui` package root in a client component.

This repo intentionally keeps only:

- one `/` page
- one client component
- one root import: `import { Button } from '@douyinfe/semi-ui'`
- webpack mode on Next 16
- `lottie-web` pinned to `5.12.2`

## Environment

- Next.js `16.2.1`
- React `19.2.4`
- `@douyinfe/semi-ui` `2.93.0`
- `lottie-web` `5.12.2` via `overrides`
- Node `21+` reproduces reliably because `navigator` exists globally
- webpack mode is required on Next 16 for this repro; the same code path did not reproduce under the default Turbopack dev path in local verification
- `semi-next` is not configured in this repo; the crash still reproduces without it
- `transpilePackages` is not configured in this repo; the crash still reproduces without it

## Minimal Repro Code

The repro point is only this import in `app/ReproClient.tsx`:

```tsx
'use client';

import { Button } from '@douyinfe/semi-ui';
```

## Install

```bash
npm install
```

## Reproduce

```bash
npm run dev
```

Then open `http://127.0.0.1:3000`.

Expected symptom:

- the request to `/` returns `500`
- the dev server logs `ReferenceError: document is not defined`
- the stack includes `app/ReproClient.tsx`

Typical stack shape in this repo:

```text
ReferenceError: document is not defined
    at .../lottie-web/build/player/lottie.js
    at .../semi-foundation/lib/es/lottie/foundation.js
    at .../semi-ui/lib/es/lottie/index.js
    at .../semi-ui/lib/es/index.js
    at eval (webpack-internal:///(ssr)/./app/ReproClient.tsx:7:75)
```

## Full Causal Chain

Even though the client component only uses `Button`, the SSR module graph still evaluates the Semi root entry.

The effective chain is:

```text
import { Button } from '@douyinfe/semi-ui'
-> Next SSR evaluates @douyinfe/semi-ui/lib/es/index.js
-> Semi root entry re-exports Lottie
-> Lottie imports @douyinfe/semi-foundation/lib/es/lottie/foundation.js
-> foundation imports lottie-web
-> lottie-web top-level initialization runs during SSR
-> lottie-web calls document.createElement(...)
-> ReferenceError: document is not defined
```

In this reproduction, the important part is that `@douyinfe/semi-ui` root import does not stay narrowed to `Button` on the SSR side. The root entry is evaluated as a whole, and that pulls the `Lottie` export path into the server module graph.

## Why Node 21+ Makes It Visible

This reproduction depends on `lottie-web@5.12.2`.

That version starts like this:

```js
(typeof navigator !== "undefined") && (function (...) { ... })
```

Inside that initialization path, it defines and uses:

```js
function createTag(type) {
  return document.createElement(type);
}
```

So the practical behavior is:

- On older Node versions, `navigator` is usually missing, so the top-level branch does not run.
- On Node `21+`, `navigator` exists globally, so the branch runs during SSR.
- Once that branch runs, `document.createElement(...)` is reached, and SSR crashes with `ReferenceError: document is not defined`.

## Version Sensitivity

This repo intentionally pins `lottie-web` to `5.12.2` because that matches the crashing behavior.

The crash is not reproduced by every `lottie-web` version. In local comparison, a newer `lottie-web` build changed its top-level guard to also check `document`, which prevents this exact failure path from firing under Node 22.

So the issue is not just:

- `@douyinfe/semi-ui` root import is broad

It is the combination of:

- `@douyinfe/semi-ui` root import evaluating the whole root entry on SSR
- root entry re-exporting `Lottie`
- `Lottie` pulling in `lottie-web`
- `lottie-web@5.12.2` using a `navigator`-only top-level gate
- Node `21+` exposing global `navigator`
- the Next 16 webpack SSR path evaluating that module graph

`semi-next` is not part of the minimal trigger in this standalone repo. Removing it still produces the same `500` and the same stack. `transpilePackages` is also not required here.

## What This Repo Is Intended To Show

This repo is meant to demonstrate that:

- a client component importing `Button` from `@douyinfe/semi-ui` root can still crash on the server
- the failure is caused by root-entry evaluation, not by actually rendering `Lottie`
- Node runtime version matters
- upgrading Next.js alone does not remove the issue
- `semi-next` is not required for the minimal reproduction
