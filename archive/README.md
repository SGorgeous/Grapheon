归档
====

这里的东西**没有删**，只是从工作目录里挪开了 —— 都还能拿回来。

## `docs-images/`（18 张，1197 KB）

开发过程中提交的界面快照。**文档里没有引用它们**，
当前 README 只用 `docs-structure.png`，
新功能的说明图是 `docs-var-types.png`（这两张留在根目录）。

这些图本身没坏，只是没人引用了。要恢复：

```bash
mv archive/docs-images/*.png .        # 或者直接拖回去
```

## `assets/`（3 个）

| 文件 | 为什么挪走 |
|---|---|
| `logo.svg` | 整幅标识。**没有被任何页面引用** |
| `logo-mark.svg` | 方形标识。同上 |
| `logo-preview.svg` | 生成器的预览拼图。同上 |

这三个都是 `tools/make-logo.mjs` 的**输出**，不是输入 ——
随时能重出，所以留不留在仓库里都不影响构建：

```bash
node tools/make-logo.mjs              # 会把四个 SVG 全部写回 assets/
```

运行时真正要的只有 `assets/logo-mark-small.svg`（`index.html` 的 favicon）。
`tools/package.mjs` 现在也只往包里放这一个。

## 什么时候该把这些拿出来

- 要写更详细的文档、需要配图的时候
- 要重新设计标识、想看历史版本的时候
- 要做发布说明、想把界面变化列出来的时候
