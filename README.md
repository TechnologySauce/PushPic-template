# PushPic

打开即用的 GitHub Pages 图床。图片直接上传到本仓库的 `images/` 目录，通过 Pages 生成外链，页面无需填写仓库、分支或 Token。

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

## 性能与交互

- **请求提速**：图片列表用 ETag（`If-None-Match`）走 304 省流量；相同 URL 的并发请求自动去重；网络抖动/5xx 自动重试一次。
- **部署探测按需**：用 `IntersectionObserver` 只探测进入视口（含 160px 预取区）的图片，图库再大也不会一次发出上百个探测请求；老浏览器退化为只探测当前页。
- **批量上传去重**：上传前用 SHA-256 计算内容摘要，同一批里内容完全相同的文件只上传一次。
- **批量上传**：最多 4 张并发处理，转换与上传重叠；每张上传成功后立即出现在图片库，不必等整批完成。
- **刷新按钮**：SVG 环形进度 + 状态色 + 主副标题（刷新中 → 已更新 x 张 / 刷新失败·点击重试），顶部显示上次刷新时间；800ms 内连点自动忽略，避免重复打 API。

## 链接

- Pages 链接：`https://technologysauce.github.io/PushPic/images/文件.png`
- raw 链接：`https://raw.githubusercontent.com/TechnologySauce/PushPic/main/images/文件.png`

> 上传后 raw 链接立即可用；Pages 链接可能需要几十秒才会生效。

## 安全说明

页面内置了用于写入本仓库的访问令牌，因此访客打开页面即可上传，不需要自行配置密钥。

该令牌随前端文件公开，任何访问站点的人都能上传或删除仓库内图片。若要限制权限，请撤销该令牌并改用带鉴权的后端代理。请不要在公共电脑上使用本站点。

## 本地开发

```bash
python3 -m http.server 8080
# 打开 http://localhost:8080
```

静态文件无需构建。页面直接调用 GitHub REST API。

## License

MIT
