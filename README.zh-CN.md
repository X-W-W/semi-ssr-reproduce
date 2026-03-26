# Semi SSR Root Import Repro

这是一个最小独立复现仓库，用来复现这样一个服务端崩溃：

客户端组件里仅仅从 `@douyinfe/semi-ui` 根入口导入 `Button`，但 SSR 期间会触发 `ReferenceError: document is not defined`。

这个仓库刻意只保留了最小必要条件：

- 一个 `/` 页面
- 一个 client component
- 一条根入口导入：`import { Button } from '@douyinfe/semi-ui'`
- Next 16 下显式使用 webpack 模式
- 通过 `overrides` 将 `lottie-web` 固定为 `5.12.2`

## 环境

- Next.js `16.2.1`
- React `19.2.4`
- `@douyinfe/semi-ui` `2.93.0`
- `lottie-web` `5.12.2`
- Node `21+`
- 在 Next 16 下，这个复现需要显式使用 webpack 模式；本地验证里，同样代码在默认 Turbopack dev 路径下没有复现
- 这个仓库里没有配置 `@douyinfe/semi-next`，但崩溃仍然可以稳定复现
- 这个仓库里故意没有配置 `transpilePackages`，但崩溃仍然可以稳定复现

## 最小复现代码

真正的复现点只有 `app/ReproClient.tsx` 里的这条导入：

```tsx
'use client';

import { Button } from '@douyinfe/semi-ui';
```

## 安装

```bash
npm install
```

## 复现步骤

```bash
npm run dev
```

然后访问：

```text
http://127.0.0.1:3000
```

## 预期现象

- 请求 `/` 返回 `500`
- dev server 日志出现 `ReferenceError: document is not defined`
- 调用栈中包含 `app/ReproClient.tsx`

本仓库里实际看到的典型栈形态如下：

```text
ReferenceError: document is not defined
    at .../lottie-web/build/player/lottie.js
    at .../semi-foundation/lib/es/lottie/foundation.js
    at .../semi-ui/lib/es/lottie/index.js
    at .../semi-ui/lib/es/index.js
    at eval (webpack-internal:///(ssr)/./app/ReproClient.tsx:7:75)
```

## 完整因果链

虽然 client component 实际只用了 `Button`，但 SSR 模块图并不会只停留在 `Button`，而是会继续求值 Semi 的根入口。

实际链路如下：

```text
import { Button } from '@douyinfe/semi-ui'
-> Next SSR 求值 @douyinfe/semi-ui/lib/es/index.js
-> Semi 根入口 re-export Lottie
-> Lottie 导入 @douyinfe/semi-foundation/lib/es/lottie/foundation.js
-> foundation 导入 lottie-web
-> lottie-web 顶层初始化在 SSR 阶段执行
-> lottie-web 调用 document.createElement(...)
-> ReferenceError: document is not defined
```

在这个复现里，关键点不是“真的渲染了 Lottie”，而是：

- `@douyinfe/semi-ui` 根入口在 SSR 侧被整体求值
- 根入口里的 `Lottie` 导出路径被一起带进了服务端模块图

## 为什么 Node 21+ 更容易暴露

这个复现依赖 `lottie-web@5.12.2`。

该版本文件开头的判断逻辑本质上是：

```js
(typeof navigator !== "undefined") && (function (...) { ... })
```

而在其初始化路径内部，会定义并调用：

```js
function createTag(type) {
  return document.createElement(type);
}
```

所以运行时行为是：

- 在较老的 Node 版本里，通常没有全局 `navigator`，这条顶层分支不会进入
- 到了 Node `21+`，`navigator` 成为全局对象，这条分支会在 SSR 期间被激活
- 分支一旦激活，就会命中 `document.createElement(...)`
- 由于 SSR 环境没有 `document`，最终抛出 `ReferenceError: document is not defined`

## 为什么要固定 `lottie-web@5.12.2`

这个问题并不是所有 `lottie-web` 版本都会表现一致。

本地对比发现，较新的 `lottie-web` 构建产物在顶层增加了对 `document` 的额外判断，因此在 Node 22 下不会再通过同一条路径直接崩溃。

所以这个问题的完整触发条件不是单一的“根入口导入太宽”，而是以下条件叠加：

- `@douyinfe/semi-ui` 根入口会在 SSR 侧整体求值
- 根入口 re-export `Lottie`
- `Lottie` 继续拉入 `lottie-web`
- `lottie-web@5.12.2` 顶层只检查 `navigator`
- Node `21+` 提供了全局 `navigator`
- Next 16 的 webpack SSR 路径会继续求值这条模块链

在这个独立最小仓库里，`semi-next` 并不是必需触发条件，`transpilePackages` 也不是。移除这两项后，`/` 仍然返回 `500`，而且调用栈保持不变。

## 这个仓库想说明什么

这个仓库要证明的是：

- client component 即使只从 `@douyinfe/semi-ui` 根入口导入 `Button`，也可能在服务端崩溃
- 崩溃原因不是页面真的使用了 `Lottie`，而是根入口求值把整条导出链拉进了 SSR
- Node 运行时版本会影响这个问题是否显性暴露
- 升级到 Next 16 并不会自动消除这条问题链
- `semi-next` 不是这个最小复现的必要条件
