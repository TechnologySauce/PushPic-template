# PushPic

打开即用的 GitHub Pages 图床。图片直接上传到本仓库的 `images/` 目录，通过 Pages 生成外链，页面无需填写仓库、分支或 Token。

Powered by [科技酱](https://docs.asoe.cn) & [PushPic](https://github.com/TechnologySauce/PushPic)。

## 使用

1. 打开站点：<https://technologysauce.github.io/PushPic/>
2. 在上传卡片选择格式：保持原格式 / WebP / AVIF / SVG
3. 拖拽或点击上传图片（80+ 种格式，最多 20 张，单张 ≤ 50 MB）
4. 在图片库中搜索、预览、复制链接或删除图片

## 链接与部署状态

新上传的图片 raw 链接立即可用，但 GitHub Pages 需要几十秒重建后 `images/文件` 才能访问。为此页面会：

- 在图片卡片和顶部徽标显示「部署中 / 已上线」，后台自动探测 Pages 何时生效，无需手动刷新
- 未上线前「复制链接」优先复制 raw 链接，避免复制到暂时 404 的 Pages 链接；上线后自动改用更短的 Pages 链接
- 缩略图和预览在某个图片源加载失败时自动切到另一个源
- 预览弹窗中分别标注每个链接的可用状态，Markdown 代码使用当前可用链接

Pages 链接生效后，复制到的短链即可用于外链。


## 图片格式转换

上传时可在页面顶部选择自动转换格式，设置会保存在当前浏览器：

- **保持原格式**：不做处理，直接上传原文件
- **WebP**：浏览器本地转换为 WebP（质量 0.82），转换后反而更大时自动保留原图
- **AVIF**：浏览器本地转换为 AVIF（更高压缩率，首次使用需加载约 4.5 MB 编码组件），转换后更大则保留原图
- **SVG**：使用 ImageTracer 在浏览器本地做颜色量化描摹，适合图标/线条图；照片类不建议使用

### 支持的输入格式

覆盖 80+ 种扩展名，按类别归纳如下（含同一格式的多个别名扩展名）：

- **常见位图**：bmp、jpg/jpeg/jpe/jfif/pjpeg、png、gif、webp（含 animated）、avif、apng、ico
- **TIFF 系与传真**：tif/tiff、exif、fpx、fax、g3、g4（TIFF 系用 `vendor/UTIF.js` 解码）
- **JPEG 2000 / JPEG XL / 新一代压缩**：jp2、j2k、j2c、jpf、jpx、jpm、mj2、jxl、qoi、heif/heic、ljpeg、jls/jpegls、jxt/jpegxt、jxs/jpegxs
- **矢量 / 设计 / 打印**：svg/svgz、psd、cdr、pcd、dxf、ufo、eps、ai、wmf/emf、pict/pict2
- **相机 RAW**：raw、dng、cr2、cr3、nef、arw、orf、rw2、raf
- **Netpbm 无损族**：pbm、pgm、ppm、pnm、pam
- **动画**：mng、jng
- **其它冷门 / 专有**：pcx、tga、xbm、xpm、wbm、plic、cpt、iif、pic、xv、xif、hrz、pal、icb、vda、vst、gro、pntg/pnt、mac

转换全部在浏览器完成，不经过任何第三方服务端。TIFF 解码库 `vendor/UTIF.js`、矢量转换库 `vendor/imagetracer_v1.2.6.js`、AVIF 编码器 `vendor/jsquash2/` 均已随仓库提供，无需联网加载第三方资源。

> 说明：图床的目标是"传上去不丢文件"。浏览器能解码的位图（PNG/JPEG/GIF/BMP/WebP/AVIF/SVG/ICO）可直接转 WebP/AVIF/SVG；TIFF/EXIF/FPX 由内置 UTIF.js 补充解码。JPEG2000/JXL/QOI/HEIC、相机 RAW、Adobe/Corel 专有格式、矢量设计、Netpbm 及老式格式，浏览器无法可靠解码，**选了转换也会原样保留上传**（不会生成损坏文件）。任何格式转换失败或"转后更大"时，一律自动回退原图。想要强制转成 WebP/AVIF，请先用专业软件另存为 PNG/JPEG。

## Logo

`assets/img/logo.png`（512×512 透明背景）为项目图标：蓝紫渐变的圆角图片卡片 + 太阳/山峰图片符号 + 青绿色上传徽标。另有 `logo-180.png`（Apple Touch Icon）、`favicon-64.png` 和 `favicon.ico`。源文件由 `tools/gen_logo.py` 生成，重新生成只需 Pillow：

```bash
python3 tools/gen_logo.py
```

## 搜索与预览

- 搜索框支持空格分隔的多个关键词（需全部命中），输入防抖 120ms，带一键清空按钮与「匹配 x / 共 y 张」结果计数。
- 预览弹窗支持键盘 `←` / `→` 在当前筛选结果内循环切换、`Esc` 关闭，标题显示「第 x / 共 y 张」。

## 收藏与图库管理

- **收藏**：每张图片卡片右上角点 ☆ 即可收藏（★），收藏列表保存在浏览器 localStorage，刷新不丢。
- **只看收藏**：图库工具栏的「收藏」筛选按钮可切换只看收藏的图片，可与搜索组合使用。
- **卡片操作**：每张图片提供复制链接、复制 Markdown（`MD`）、下载、删除四个按钮。
- **每页数量**：可切换每页 12 / 24 / 48 / 全部，设置自动记忆。

## 性能与交互

- **请求提速**：图片列表用 ETag（`If-None-Match`）走 304 省流量；相同 URL 的并发请求自动去重；网络抖动/5xx 自动重试一次。
- **部署探测按需**：用 `IntersectionObserver` 只探测进入视口（含 160px 预取区）的图片，图库再大也不会一次发出上百个探测请求；老浏览器退化为只探测当前页。
- **批量上传去重**：上传前用 SHA-256 计算内容摘要，同一批里内容完全相同的文件只上传一次。
- **批量上传**：最多 4 张并发处理，转换与上传重叠；每张上传成功后立即出现在图片库，不必等整批完成。
- **刷新按钮**：SVG 环形进度 + 状态色 + 主副标题（刷新中 → 已更新 x 张 / 刷新失败·点击重试），顶部显示上次刷新时间；800ms 内连点自动忽略，避免重复打 API。
- **首屏提速**：`preconnect` 预连 GitHub API 与 raw 图片源，减少首次请求握手延迟；令牌解密与图片库加载并行，读取不被 WebCrypto 阻塞。
- **渲染提速**：图库卡片启用 `content-visibility: auto`，屏外卡片跳过布局/绘制，长列表滚动更流畅；缩略图异步解码（`decoding="async"`）。
- **网络超时保护**：所有 GitHub API / raw 请求加超时与 AbortController，弱网下不再悬挂拖住页面。
- **图库 DOM 复用**：搜索、筛选、分页时复用已渲染卡片节点并一次性插入文档片段，避免反复重建 DOM 和重新解码图片。
- **上传免重复刷新**：每张上传成功后直接写入本地图片库，不再额外打一次完整列表 API。
- **转换组件预加载**：选中 WebP/AVIF/SVG 格式时提前加载编码组件，点上传时不再等待下载/编译。

## 链接

- Pages 链接：`https://technologysauce.github.io/PushPic/images/文件.png`
- raw 链接：`https://raw.githubusercontent.com/TechnologySauce/PushPic/main/images/文件.png`

> 上传后 raw 链接立即可用；Pages 链接可能需要几十秒才会生效。

## 安全架构（v3.1 起）

先说实话：**纯静态 GitHub Pages 图床没有后端，「免配置」与「浏览器零令牌」无法同时成立。** 要写入仓库，浏览器必须持有令牌。v3.1 的设计是在这个前提下，把令牌暴露面和攻击面压到最小。

- **读取**：图片库列表走 GitHub 公开 API，任何人都能看，无需令牌。
- **写入**：浏览器直传 GitHub **Contents API**（PUT/DELETE）。这修复了 v2.x/v3.0 用 `repository_dispatch` 携带图片 base64 的致命缺陷——dispatch 的 `client_payload` 有约 48KB 上限，稍大的图片一律 `client_payload is too large` 上传失败。直传支持到 50MB。
- **令牌不内置、不进仓库**：公开前端不含任何令牌。部署者/使用者在页面右上角「令牌」按钮里填入一枚仅含本仓库 Contents 读写权限的令牌即可，且应设置过期时间。
- **令牌加密存储**：令牌用 WebCrypto **AES-256-GCM** 加密后存 localStorage，设备密钥存 sessionStorage（关闭标签即失效），页面内存与存储中均无明文。
- **最小权限**：文档明确要求令牌只授予本仓库 Contents: read & write；经典 PAT 勾选 `public_repo`（或 `repo`），细粒度令牌仅授权单仓库。
- **SVG 输出清洗**：前端矢量转换结果在落地前清除脚本、事件属性、`javascript:`、外部实体、`<style>`/`<use>` 外链与控制字符，避免同源 SVG 执行脚本。
- **严格 CSP**：`script-src 'self' 'wasm-unsafe-eval'`（禁内联脚本/eval，放行 AVIF 的 WASM）、`object-src 'none'`、`base-uri 'none'`、`frame-ancestors 'none'`，API 与图片源显式白名单。
- **内容校验**：上传前用 magic bytes 校验图片头，拒绝伪装成图片的 HTML/JS；扩展名白名单 + 大小上限双保险。
- **防重复与限流**：同批内容用 SHA-256 去重，并发上传限 4，避免打爆 API。
- **规范化签名工具**：前后端共用「对象键递归排序、数组保序」的规范化与 SHA-256 签名，供扩展的服务端校验使用。

### 部署者必读：令牌配置

1. 创建一枚令牌：
   - 细粒度令牌（推荐）：仅授权 `TechnologySauce/PushPic`，权限 `Contents: read and write`，设过期时间；
   - 或经典 PAT：勾选 `public_repo`（私有仓库勾 `repo`），设过期时间。
2. 打开站点，点右上角「⚙ 令牌」，粘贴令牌。它会被 AES-GCM 加密存在你的浏览器本机，不上传任何服务器。
3. 之后即可上传/删除。换浏览器或清除数据后需重新填一次。

> 重要：任何写进静态文件的令牌都是公开的。本设计不在前端内置令牌，令牌只留在各使用者本机。若要让访客免配置上传，必须引入带登录鉴权的后端代理（云函数/Serverless），把令牌留在服务端——这是纯静态架构做不到取舍。

## 本地开发

```bash
python3 -m http.server 8080
# 打开 http://localhost:8080
```

静态文件无需构建。页面直接调用 GitHub REST API。

## 版本与发布

本项目采用语义化版本（`vMAJOR.MINOR.PATCH`）。**每一次更新都会发布对应的 Release**，记录本轮改动与部署情况：

- 版本号随功能/修复递增；发布时以 `vX.Y.Z` 为 tag 创建 GitHub Release
- PushPic 主仓库与公开模板仓库 `TechnologySauce/PushPic-template` 保持同步发布
- Release 说明包含当轮改动点、验证结论、站点与模板仓库地址

历史 Release 见本仓库 [Releases](https://github.com/TechnologySauce/PushPic/releases)。

## License

MIT
