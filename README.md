# PushPic

打开即看的 GitHub Pages 图床。图片上传到本仓库的 `images/` 目录，通过 Pages 生成外链。浏览图库零配置；上传/删除需在本机填一次自己的令牌（仅加密存于本机浏览器，站点与仓库不含任何写入凭证）。

Powered by [科技酱](https://docs.asoe.cn) & [PushPic](https://github.com/TechnologySauce/PushPic)。

## 使用

1. 打开站点：<https://technologysauce.github.io/PushPic/>
2. 在上传卡片选择格式：保持原格式 / WebP / AVIF / SVG
3. 首次上传点右上角「⚙ 令牌」填入自己的细粒度令牌（仅授权本仓库 Contents 读写、设短过期时间）；令牌 AES-GCM 加密只存本机
4. 拖拽或点击上传图片（80+ 种格式，最多 20 张，单张 ≤ 50 MB）
5. 在图片库中搜索、预览、复制链接或删除图片

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
- **稳定破缓存**：图片探测用「站点资产版本 + 列表 ETag」作为破缓存参数，替代每次的随机时间戳，CDN 命中率更高。
- **API 配额提示**：403 且命中速率限制时展示重置倒计时；写入遇到同名 sha 冲突自动按最新 sha 重试一次。
- **同源零往返链接**：Pages 外链改为同源相对 URL 解析，复用已建立的 DNS/TLS 连接，也更短。
- **图库 DOM 复用**：搜索、筛选、分页时复用已渲染卡片节点并一次性插入文档片段，避免反复重建 DOM 和重新解码图片。
- **上传免重复刷新**：每张上传成功后直接写入本地图片库，不再额外打一次完整列表 API。
- **转换组件预加载**：选中 WebP/AVIF/SVG 格式时提前加载编码组件，点上传时不再等待下载/编译。
- **缓存优先首屏**：命中 ETag 缓存时先用缓存数据渲染一帧，API 返回权威数据再对齐，慢网/慢 API 下首屏不再空白。
- **部署状态持久化**：已上线的图片状态按标签会话缓存（带 TTL），翻页/刷新不再对每张图重复探测；同链接的并发探测自动去重，只有状态变化时才重绘图库。
- **HEAD 轻量探测**：部署状态探测改用 HEAD 请求只取响应头，不再下载整张图片字节；老浏览器或 HEAD 被拒时自动回退 `<img>`。图库大时省流量明显。

## 链接

- Pages 链接：`https://technologysauce.github.io/PushPic/images/文件.png`
- raw 链接：`https://raw.githubusercontent.com/TechnologySauce/PushPic/main/images/文件.png`

> 上传后 raw 链接立即可用；Pages 链接可能需要几十秒才会生效。

## 安全架构（v3.4 起：零令牌暴露）

先说实话：**纯静态 GitHub Pages 没有后端，任何塞进前端的令牌都等于公开**——base64、分片、混淆只是编码，浏览器里都能还原。所以从 v3.4 起，站点彻底不再内置任何写入凭证：读取免配置，写入由使用者在本机填一次令牌。这是「令牌绝不公开暴露」与「访客零配置上传」之间，唯一能真正保护令牌的取舍。要两者兼得，只能上带登录鉴权的后端 + 短时凭证。

- **读取**：图片库列表走 GitHub 公开 API，匿名即可浏览下载，首屏不等令牌解密（更快）。
- **写入**：浏览器直传 GitHub **Contents API**（PUT/DELETE），支持 50MB。旧的 `repository_dispatch` + Actions 工作流方案已**彻底删除**——它的 `client_payload` 有约 48KB 上限，稍大的图片必然失败，且签名校验会因键序变化而失败，持续产生失败通知邮件。
- **零令牌暴露**：`config.js` 的 `tokenParts` 永久为空，站点任何文件都不含 PAT。写入只针对固定仓库 + `images/` 目录 + 文件名清洗。
- **滥用防护**：写入次数持久化在 localStorage 的滑动窗口限流（默认 60 秒 20 次），刷新页面也无法绕过；同批内容 SHA-256 去重。
- **SVG XSS 清洗**：所有 SVG（转换生成 + 原样上传）在落地前清除脚本、事件属性、`javascript:`、外部实体、`<style>`/`<use>` 外链与控制字符，避免在 Pages 同源域内执行脚本。
- **内容校验**：上传前用 magic bytes 校验图片头，拒绝伪装成图片的 HTML/JS；扩展名白名单 + 大小上限双保险。
- **严格 CSP**：`script-src 'self' 'wasm-unsafe-eval'`（禁用内联脚本/eval，放行 AVIF 的 WASM）、`object-src 'none'`、`base-uri 'none'`、`form-action 'none'`、`frame-ancestors 'none'`，API 与图片源显式白名单。
- **运行时配置只读**：`config.js` 冻结配置后以不可写属性暴露到 window，页面脚本无法替换令牌/白名单/限流策略。
- **Referrer 最小泄露**：缩略图、预览图与探测请求设置 `no-referrer`，外链图片不会带当前页面地址。
- **Markdown 安全拼接**：文件名里的 `[]` 会转义，链接里的空格与括号会编码，复制的 Markdown 不易被破坏。
- **缓存失效清理**：图片列表 404 时同步清除 ETag 缓存，目录重建后能及时恢复。
- **令牌加密存储**：使用者在右上角「令牌」填入自己的令牌，AES-256-GCM 加密存 localStorage，设备密钥存 sessionStorage（关标签即失效），令牌永不进入仓库代码。
- **脚本完整性校验（SRI）**：动态注入的 UTIF/ImageTracer 解码组件带 SHA-384 完整性哈希，字节被篡改即拒绝加载，防止同源域内被替换执行任意代码。
- **base64 规范性校验**：上传内容解码后回编码必须一致，拒绝畸形填充/隐藏字符夹带；本机令牌做前缀 + 长度的完整格式校验。
- **权限头收紧**：新增 Permissions-Policy 关闭定位/摄像头/麦克风/支付/USB 等能力；配置对象与白名单数组深度冻结，运行时不可篡改。
- **SVG 清洗兜底**：在原有基础上增加控制字符（含 Unicode 行分隔符）剔除与残余危险标签/事件/伪协议兜底扫描。
- **SVG 幂等清洗 + 结构复核**：SVG 清洗重复执行至稳定（杜绝畸形嵌套二次解析复活脚本），并要求清洗后恰好是单一 `<svg>` 根；上传前再复核不含 `animate`/事件/伪协议等动态载荷。
- **并发文件名防覆盖**：批量上传时用同步占用集合分配文件名，修掉多任务同时算出重名、互相覆盖的竞态；失败的文件释放名字可原样重试。
- **限流票据化**：写入配额按票据计数，鉴权失败/网络错误时退还；删除操作也纳入限流（此前可无限删图）；旧格式日志自动迁移。
- **坏令牌自愈**：本机覆盖令牌失效（401）时自动清除损坏记录并回退内置凭证，无需手动进对话框清理。
- **文件名清洗加固**：拒绝 Windows 保留设备名（CON/PRN/COM1…）、去掉尾部句点/空格（防止外链 404）、限制长度并阻断路径穿越。

> **安全提醒**：最初贴在 Issue 里的旧 PAT 已经在公开页面出现多次，**请立刻在 GitHub 撤销它**，不要复用。现在站点不再内置令牌；本机填入的令牌只加密存于你自己的浏览器，不会出现在仓库代码或任何公开页面。

## 为什么不再有 Actions 失败邮件

早期版本用 `repository_dispatch` 触发 `PushPic Secure Write` 工作流来写图片。该链路有两处致命缺陷：签名校验用非规范化 JSON（GitHub 转发时键序变化 → `Invalid request signature`），以及 `client_payload` 约 48KB 上限（稍大图片 → `client_payload is too large`）。改用直传 Contents API 后该工作流已无人调用，但文件仍留在仓库里，残留的 dispatch 请求会让它持续失败并给你发邮件。v3.2 已从主仓与模板仓**删除该工作流文件及配套脚本**，失败邮件随之停止。

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
