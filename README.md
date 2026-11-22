# PushPic

打开即用的 GitHub Pages 图床。图片直接上传到本仓库的 `images/` 目录，通过 Pages 生成外链，页面无需填写仓库、分支或 Token。

## 使用

1. 打开站点：<https://technologysauce.github.io/PushPic/>
2. 在上传卡片选择格式：保持原格式 / WebP / SVG
3. 拖拽或点击上传图片（最多 20 张，单张 ≤ 50 MB）
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
- **SVG**：使用 ImageTracer 在浏览器本地做颜色量化描摹，适合图标/线条图；照片类不建议使用

转换全部在浏览器完成，不经过任何第三方服务端。矢量转换库 `vendor/imagetracer_v1.2.6.js` 已随仓库提供，无需联网加载第三方资源。

## Logo

`assets/img/logo.png`（512×512 透明背景）为项目图标：蓝紫渐变的圆角图片卡片 + 太阳/山峰图片符号 + 青绿色上传徽标。另有 `logo-180.png`（Apple Touch Icon）、`favicon-64.png` 和 `favicon.ico`。源文件由 `tools/gen_logo.py` 生成，重新生成只需 Pillow：

```bash
python3 tools/gen_logo.py
```

## 性能与交互

- **请求提速**：图片列表用 ETag（`If-None-Match`）走 304 省流量；相同 URL 的并发请求自动去重；网络抖动/5xx 自动重试一次。
- **批量上传**：最多 4 张并发处理，转换与上传重叠；每张上传成功后立即出现在图片库，不必等整批完成。
- **刷新按钮**：点击后按钮内实时显示「刷新中 → 已更新 / 重试」，带旋转进度与状态色，800ms 内连点自动忽略，避免重复打 API。

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
