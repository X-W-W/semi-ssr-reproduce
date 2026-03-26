# Bug：从 `@douyinfe/semi-ui` 根入口导入时，可能触发 SSR 崩溃 `ReferenceError: document is not defined`

## 问题概述

即使在 client component 中只从包根入口导入 `Button`，也仍然可能触发 SSR 崩溃：

```tsx
'use client';

import { Button } from '@douyinfe/semi-ui';
```

报错为：

```text
ReferenceError: document is not defined
```

这个问题并不是因为页面直接渲染了 `Lottie`，而是因为 SSR 模块图在求值 `@douyinfe/semi-ui` 根入口时，会继续带出 `Lottie` 的导出链，最终拉入 `lottie-web@5.12.2`。

## 最小复现

仓库：

- `semi-ssr-reproduction`

最小复现代码只包含：

- 一个 `/` 页面
- 一个 client component
- 一条导入：`import { Button } from '@douyinfe/semi-ui'`

当前最小复现状态：

- Next.js `16.2.1`
- React `19.2.4`
- `@douyinfe/semi-ui` `2.93.0`
- 通过 `overrides` 固定 `lottie-web@5.12.2`
- Node `22.22.0`
- 使用 webpack dev 路径：`next dev --webpack`
- 不使用 `@douyinfe/semi-next`
- 不配置 `transpilePackages`

## 已验证现象

访问 `/` 会返回 `500`，服务端日志为：

```text
ReferenceError: document is not defined
    at .../lottie-web/build/player/lottie.js
    at .../semi-foundation/lib/es/lottie/foundation.js
    at .../semi-ui/lib/es/lottie/index.js
    at .../semi-ui/lib/es/index.js
    at eval (webpack-internal:///(ssr)/./app/ReproClient.tsx:7:75)
```

另外已经验证过：

- 移除 `@douyinfe/semi-next` 后，问题仍然存在
- 移除 `transpilePackages` 后，问题仍然存在
- 在 Next `14.2.35` 和 Next `16.2.1` 下，只要走 webpack SSR 路径，都可以复现
- 本地验证中，同样代码在 Next `16.2.1` 默认 Turbopack dev 路径下没有复现

## 完整因果链

```text
import { Button } from '@douyinfe/semi-ui'
-> Next SSR 求值 @douyinfe/semi-ui/lib/es/index.js
-> 根入口 re-export Lottie
-> Lottie 导入 @douyinfe/semi-foundation/lib/es/lottie/foundation.js
-> foundation 导入 lottie-web
-> lottie-web 在 SSR 阶段执行顶层初始化
-> lottie-web 调用 document.createElement(...)
-> ReferenceError: document is not defined
```

## 为什么在 Node 21+ 更容易暴露

当前固定的崩溃版本是 `lottie-web@5.12.2`。

它的顶层入口本质上是：

```js
(typeof navigator !== "undefined") && (function (...) { ... })
```

而在这条初始化路径内部，会继续执行：

```js
function createTag(type) {
  return document.createElement(type);
}
```

Node `21+` 开始提供全局 `navigator`，因此这条分支会在 SSR 阶段被激活。一旦进入该分支，就会命中 `document.createElement(...)`，而服务端运行时没有 `document`，最终抛出 `ReferenceError: document is not defined`。

## 预期行为

从 `@douyinfe/semi-ui` 根入口导入 `Button` 时，不应该在 SSR 阶段求值依赖 `document` 的浏览器专用代码路径。

## 实际行为

SSR 会求值整个根入口模块，继续拉入 `Lottie` 的导出路径，并在 `lottie-web@5.12.2` 中崩溃。即使页面实际上只导入并渲染了 `Button`，问题仍然会发生。

## 补充说明

从当前验证结果看，这个问题并不依赖于：

- `@douyinfe/semi-next`
- `transpilePackages`
- Next `16` 这个特定版本

目前观察到的最小触发条件更接近于：

- 从 `@douyinfe/semi-ui` 根入口导入
- `lottie-web@5.12.2`
- Node `21+`
- 走 webpack SSR 模块求值路径
