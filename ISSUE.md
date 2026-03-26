# Bug: root import from `@douyinfe/semi-ui` can crash SSR with `ReferenceError: document is not defined`

## Summary

Importing only `Button` from the package root in a client component can still crash SSR:

```tsx
'use client';

import { Button } from '@douyinfe/semi-ui';
```

The failure is:

```text
ReferenceError: document is not defined
```

This is not caused by rendering `Lottie` directly. The crash happens because the SSR module graph evaluates the root entry of `@douyinfe/semi-ui`, which re-exports `Lottie`, and that eventually pulls in `lottie-web@5.12.2`.

## Minimal Reproduction

Repo:

- `semi-ssr-reproduction`

Minimal repro code:

- one `/` page
- one client component
- one import: `import { Button } from '@douyinfe/semi-ui'`

Current minimal repro state:

- Next.js `16.2.1`
- React `19.2.4`
- `@douyinfe/semi-ui` `2.93.0`
- `lottie-web` pinned to `5.12.2`
- Node `22.22.0`
- webpack dev path: `next dev --webpack`
- no `@douyinfe/semi-next`
- no `transpilePackages`

## Verified Behavior

Requesting `/` returns `500` and the server logs:

```text
ReferenceError: document is not defined
    at .../lottie-web/build/player/lottie.js
    at .../semi-foundation/lib/es/lottie/foundation.js
    at .../semi-ui/lib/es/lottie/index.js
    at .../semi-ui/lib/es/index.js
    at eval (webpack-internal:///(ssr)/./app/ReproClient.tsx:7:75)
```

I also verified:

- removing `@douyinfe/semi-next` does not remove the crash
- removing `transpilePackages` does not remove the crash
- the same issue reproduces on Next `14.2.35` and Next `16.2.1` when going through the webpack SSR path
- in local verification, the same code path did not reproduce under Next `16.2.1` default Turbopack dev mode

## Full Causal Chain

```text
import { Button } from '@douyinfe/semi-ui'
-> Next SSR evaluates @douyinfe/semi-ui/lib/es/index.js
-> root entry re-exports Lottie
-> Lottie imports @douyinfe/semi-foundation/lib/es/lottie/foundation.js
-> foundation imports lottie-web
-> lottie-web top-level initialization runs during SSR
-> lottie-web calls document.createElement(...)
-> ReferenceError: document is not defined
```

## Why This Becomes Visible On Node 21+

The pinned crashing version is `lottie-web@5.12.2`.

Its top-level entry effectively starts with:

```js
(typeof navigator !== "undefined") && (function (...) { ... })
```

Inside that path it reaches:

```js
function createTag(type) {
  return document.createElement(type);
}
```

On Node `21+`, `navigator` exists globally, so the branch runs during SSR. Once that happens, `document.createElement(...)` is reached and SSR crashes because `document` does not exist in the server runtime.

## Expected Behavior

Importing `Button` from `@douyinfe/semi-ui` should not cause SSR to evaluate browser-only code paths that depend on `document`.

## Actual Behavior

SSR evaluates the root package entry, pulls in the `Lottie` export path, and crashes in `lottie-web@5.12.2` even though the page only imports and renders `Button`.

## Notes

This does not appear to require:

- `@douyinfe/semi-next`
- `transpilePackages`
- Next `16` specifically

The currently observed minimal trigger is closer to:

- root import from `@douyinfe/semi-ui`
- `lottie-web@5.12.2`
- Node `21+`
- webpack SSR module evaluation path
