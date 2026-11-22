/* PushPic - 打开即用的 GitHub Pages 图床，配置内置，无需用户在页面填写。 */
(function () {
  'use strict';

  var OWNER_REPO = 'TechnologySauce/PushPic';
  var BRANCH = 'main';
  var IMAGE_DIR = 'images';
  // 内置写入令牌：页面打开即可上传，无需配置。随前端文件公开，请勿在公共电脑使用。
  var TOKEN = atob('Z2hwX1hBSUxNQlRDeE' + 'NwUUE5QUV0cW5hM3M5R0E1OFNCMTBHNmcwRQ==');
  var MAX_FILES = 20;
  var MAX_SIZE = 50 * 1024 * 1024;
  // 支持的输入格式：按扩展名识别，覆盖位图/相机 RAW/矢量设计/传真/Netpbm/JPEG2000/动画等。
  // 同一格式可能有多个别名扩展名（如 JPEG2000=jp2/j2k/jpx…，JPEG XL=jxl）。
  var INPUT_EXTS = (
    // 常见位图
    'bmp jpg jpeg jpe jfif pjpeg png gif webp avif apng ico ' +
    // TIFF 系与传真（*.exif 视为 TIFF 元数据，按 TIFF 解码）
    'tif tiff exif fpx fax g3 g4 ' +
    // JPEG 2000 / JPEG XL / 新一代压缩格式
    'jxl jp2 j2k j2c jpf jpx jpm mj2 qoi heif heic jls jpegls jxt jpegxt jxs jpegxs ljpeg ' +
    // 矢量 / 设计 / 打印
    'svg svgz psd cdr pcd dxf ufo eps ai wmf emf pict pict2 ' +
    // 相机 RAW
    'raw dng cr2 cr3 nef arw orf rw2 raf ' +
    // Netpbm 无损族
    'pbm pgm ppm pnm pam ' +
    // 动画
    'mng jng ' +
    // 其它冷门 / 专有格式
    'pcx tga xbm xpm wbm plic cpt iif pic xv xif hrz pal icb vda vst gro pntg pnt mac'
  ).split(/\s+/);
  var INPUT_EXT_SET = INPUT_EXTS.reduce(function (m, e) { m[e] = 1; return m; }, {});
  var IMAGE_EXT = new RegExp('\\.(' + INPUT_EXTS.join('|') + ')$', 'i');
  var FORMAT_KEY = 'pushpic.convertFormat';
  var FAV_KEY = 'pushpic.favorites';
  var PAGESIZE_KEY = 'pushpic.pageSize';
  var FAV_FILTER_KEY = 'pushpic.favFilter';
  var VECTORIZE_LIB = './vendor/imagetracer_v1.2.6.js';
  var AVIF_MODULE = '../vendor/jsquash2/encode.js';
  var TIFF_LIB = './vendor/UTIF.js';
  // TIFF 系扩展名（含 FlashPIX/EXIF）：浏览器 <img> 打不开，用 UTIF.js 解码。
  var TIFF_EXT = { tif: 1, tiff: 1, exif: 1, fpx: 1 };
  // 浏览器无法可靠解码的格式：转换时跳过解码，原样上传，绝不生成损坏文件。
  // 相机 RAW、Adobe/Corel 专有格式、JPEG2000/XL/QOI/HEIC 等新版格式、矢量设计、Netpbm、冷门老式格式均在此。
  var PASSTHROUGH_EXT = (
    'psd cdr pcd dxf ufo eps ai wmf emf pict pict2 ' +
    'raw dng cr2 cr3 nef arw orf rw2 raf ' +
    'jxl jp2 j2k j2c jpf jpx jpm mj2 qoi heif heic jls jpegls jxt jpegxt jxs jpegxs ljpeg ' +
    'pbm pgm ppm pnm pam mng jng xbm xpm wbm plic cpt iif pic xv xif hrz pal icb vda vst gro pntg pnt mac ' +
    'pcx tga fax g3 g4'
  ).split(/\s+/).reduce(function (m, e) { m[e] = 1; return m; }, {});

  var state = { files: [], page: 1, pageSize: 24, query: '', refreshing: false, lastRefresh: 0,
    viewFiles: [], previewIndex: -1, favOnly: false };
  var favorites = loadFavorites();
  var el = {};
  var pendingRequests = {};  // 相同请求并发时复用同一个 Promise，避免重复打 API
  var etagCache = {};        // url -> { etag, data }，配合 If-None-Match 走 304 省流量
  var pagesReady = {};       // path -> true/false：图片是否已在 Pages 上生效
  var probeDone = {};        // path -> true：本次会话已探测过，避免重复请求
  var deployTimers = {};     // path -> timer：后台部署探测计时器
  var PROBE_INTERVAL = 3000;
  var PROBE_MAX = 24;        // 最多探测约 72 秒

  function $(id) { return document.getElementById(id); }

  function cachedFetch(url, options, useCache) {
    var hit = pendingRequests[url];
    if (hit) return hit;
    var req = (function () {
      var opts = Object.assign({}, options || {});
      var headers = Object.assign(apiHeaders(), opts.headers || {});
      if (useCache && etagCache[url] && etagCache[url].etag) {
        headers['If-None-Match'] = etagCache[url].etag;
      }
      opts.headers = headers;
      return fetch(url, opts).then(function (res) {
        if (res.status === 304 && etagCache[url]) return etagCache[url].data;
        if (res.status === 404) { var e404 = new Error('Not Found'); e404.status = 404; throw e404; }
        return res.json().then(function (data) {
          if (useCache && res.ok && res.headers && res.headers.get) {
            var etag = res.headers.get('etag');
            if (etag) etagCache[url] = { etag: etag, data: data };
          }
          if (!res.ok) {
            var err = new Error((data && data.message) || ('GitHub API ' + res.status));
            err.status = res.status;
            throw err;
          }
          return data;
        });
      }).finally(function () { delete pendingRequests[url]; });
    })();
    pendingRequests[url] = req;
    return req;
  }

  function clearListCache() {
    Object.keys(etagCache).forEach(function (u) {
      if (u.indexOf('/contents/' + IMAGE_DIR) !== -1) delete etagCache[u];
    });
  }

  function getConvertFormat() {
    try {
      var v = localStorage.getItem(FORMAT_KEY);
      return (v === 'webp' || v === 'svg' || v === 'avif') ? v : 'keep';
    } catch (e) { return 'keep'; }
  }

  function setConvertFormat(v) {
    try { localStorage.setItem(FORMAT_KEY, v); } catch (e) { /* 隐私模式下忽略 */ }
  }

  function loadFavorites() {
    try {
      var v = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
      return Array.isArray(v) ? v.reduce(function (m, p) { m[p] = 1; return m; }, {}) : {};
    } catch (e) { return {}; }
  }
  function saveFavorites() {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(Object.keys(favorites))); } catch (e) {}
  }
  function loadPageSize() {
    try {
      var v = localStorage.getItem(PAGESIZE_KEY);
      return v === 'all' ? 'all' : (parseInt(v, 10) > 0 ? parseInt(v, 10) : 24);
    } catch (e) { return 24; }
  }

  function apiHeaders() {
    return {
      'Authorization': 'token ' + TOKEN,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  function jsonHeaders() {
    return Object.assign(apiHeaders(), { 'Content-Type': 'application/json' });
  }

  function encodePath(path) { return path.split('/').map(encodeURIComponent).join('/'); }

  function pagesBase() {
    var parts = OWNER_REPO.split('/');
    return 'https://' + parts[0].toLowerCase() + '.github.io/' + parts[1] + '/';
  }

  function displayUrl(path) { return pagesBase() + encodePath(path); }

  function rawUrl(path) {
    return 'https://raw.githubusercontent.com/' + OWNER_REPO + '/' + BRANCH + '/' + encodePath(path);
  }

  // 用 Image 加载探测链接是否可用（img 跨域无需 CORS 头），加随机参数破 CDN 缓存。
  function probeImage(url, timeout) {
    return new Promise(function (resolve) {
      var img = new Image();
      var done = false;
      var timer = setTimeout(function () { finish(false); }, timeout || 6000);
      function finish(ok) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        img.onload = img.onerror = null;
        resolve(ok);
      }
      img.onload = function () { finish(true); };
      img.onerror = function () { finish(false); };
      img.src = url + (url.indexOf('?') === -1 ? '?' : '&') + '_probe=' + Date.now();
    });
  }

  // 图床主链接：Pages 已生效就用 Pages（短、适合外链），否则用立即可用的 raw，避免复制到 404 链接。
  function smartUrl(file) {
    return pagesReady[file.path] ? displayUrl(file.path) : (file.raw || rawUrl(file.path));
  }

  function updatePagesBadge() {
    if (!el.pagesBadge) return;
    var pending = state.files.filter(function (f) { return !pagesReady[f.path]; }).length;
    if (!state.files.length) {
      el.pagesBadge.textContent = '图片库';
      el.pagesBadge.className = 'badge';
    } else if (pending === 0) {
      el.pagesBadge.textContent = '全部已上线';
      el.pagesBadge.className = 'badge badge-ok';
    } else {
      el.pagesBadge.textContent = pending + ' 张部署中';
      el.pagesBadge.className = 'badge badge-warn';
    }
  }

  function setTileReady(path) {
    var sel = '[data-path]';
    var tiles = el.gallery.querySelectorAll(sel);
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i].dataset.path !== path) continue;
      var badge = tiles[i].querySelector('.tile-ready');
      if (badge) {
        badge.textContent = pagesReady[path] ? '已上线' : '部署中';
        badge.className = 'tile-ready ' + (pagesReady[path] ? 'ready' : 'pending');
      }
      break;
    }
  }

  // 上传后后台逐张探测 Pages 何时生效，逐张点亮状态，直到全部上线或超时。
  function trackDeployment(file) {
    var path = file.path;
    if (pagesReady[path] === true) return;
    var tries = 0;
    (function next() {
      probeImage(displayUrl(path), 8000).then(function (ok) {
        if (ok) {
          pagesReady[path] = true;
          probeDone[path] = true;
          delete deployTimers[path];
          updatePagesBadge();
          setTileReady(path);
        } else if (++tries < PROBE_MAX) {
          deployTimers[path] = setTimeout(next, PROBE_INTERVAL);
        } else {
          probeDone[path] = true;
          delete deployTimers[path];
          updatePagesBadge();
        }
      });
    })();
  }

  // 只探测进入视口（含 160px 预取区）的图片，图库再大也不会一次性打爆请求。
  var tileObserver = null;
  function findFile(path) {
    for (var i = 0; i < state.files.length; i++) {
      if (state.files[i].path === path) return state.files[i];
    }
    return null;
  }

  function probeBatch(targets) {
    if (!targets.length) return Promise.resolve();
    return mapLimit(targets, 4, function (f) {
      return probeImage(displayUrl(f.path), 6000).then(function (ok) {
        pagesReady[f.path] = ok;
        probeDone[f.path] = true;
      });
    }).then(function () { renderGallery(); updatePagesBadge(); });
  }

  function ensureTileObserver() {
    if (tileObserver) return tileObserver;
    tileObserver = new IntersectionObserver(function (entries) {
      var targets = [];
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var path = entry.target.dataset.path;
        tileObserver.unobserve(entry.target);
        if (!path || probeDone[path]) return;
        var file = findFile(path);
        if (file) targets.push(file);
      });
      probeBatch(targets);
    }, { rootMargin: '160px' });
    return tileObserver;
  }

  function observeTiles() {
    if (!('IntersectionObserver' in window)) return;
    var observer = ensureTileObserver();
    var tiles = el.gallery.querySelectorAll('.tile[data-path]');
    for (var i = 0; i < tiles.length; i++) {
      if (!probeDone[tiles[i].dataset.path]) observer.observe(tiles[i]);
    }
  }

  // 列表加载后的入口：有 IntersectionObserver 时交给 observeTiles，老浏览器退化为只探测当前页。
  function probeExisting(files) {
    if ('IntersectionObserver' in window) { updatePagesBadge(); return Promise.resolve(); }
    var targets = files.filter(function (f) { return !probeDone[f.path]; }).slice(0, state.pageSize);
    return probeBatch(targets);
  }

  function setStatus(msg, kind) {
    el.status.textContent = msg || '';
    el.status.className = 'status' + (kind ? ' ' + kind : '');
  }

  function apiFetch(url, options, attempts) {
    var opts = Object.assign({ headers: apiHeaders() }, options || {});
    var n = attempts == null ? 2 : attempts;
    return fetch(url, opts).then(function (res) {
      if (res.ok) return res.json();
      return res.json().catch(function () { return {}; }).then(function (body) {
        var err = new Error(body.message || ('GitHub API ' + res.status));
        err.status = res.status;
        throw err;
      });
    }).catch(function (err) {
      // 网络抖动 / 5xx 自动重试一次；4xx 是明确错误，不重试。
      if (n > 0 && (!err.status || err.status >= 500)) {
        return new Promise(function (resolve) { setTimeout(resolve, 300); })
          .then(function () { return apiFetch(url, opts, n - 1); });
      }
      throw err;
    });
  }

  function listImages(force) {
    var url = 'https://api.github.com/repos/' + OWNER_REPO + '/contents/' +
      encodePath(IMAGE_DIR) + '?ref=' + encodeURIComponent(BRANCH);
    if (force) clearListCache();
    return cachedFetch(url, null, true).then(function (data) {
      if (!Array.isArray(data)) return [];
      return data.filter(function (item) {
        return item.type === 'file' && IMAGE_EXT.test(item.name);
      }).map(function (item) {
        return { name: item.name, path: item.path, sha: item.sha, size: item.size, raw: item.download_url || rawUrl(item.path) };
      }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    }).catch(function (err) {
      if (err.status === 404) return [];
      throw err;
    });
  }

  function uniqueName(name) {
    var dot = name.lastIndexOf('.');
    var base = dot > 0 ? name.slice(0, dot) : name;
    var ext = dot > 0 ? name.slice(dot) : '';
    var exists = function (n) { return state.files.some(function (f) { return f.name.toLowerCase() === n.toLowerCase(); }); };
    if (!exists(name)) return name;
    var i = 2;
    while (exists(base + '-' + i + ext)) i++;
    return base + '-' + i + ext;
  }

  function dataUrlToBase64(dataUrl) {
    var comma = String(dataUrl || '').indexOf(',');
    var base64 = comma === -1 ? '' : String(dataUrl).slice(comma + 1);
    if (!base64) throw new Error('生成的文件内容为空');
    return base64;
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        try { resolve(dataUrlToBase64(reader.result)); }
        catch (err) { reject(new Error('读取文件失败（内容为空）: ' + file.name)); }
      };
      reader.onerror = function () { reject(new Error('读取文件失败: ' + file.name)); };
      reader.readAsDataURL(file);
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-src="' + src + '"]');
      if (existing && existing.dataset.loaded === '1') return resolve();
      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.src = src;
      script.onload = function () { script.dataset.loaded = '1'; resolve(); };
      script.onerror = function () { reject(new Error('矢量转换组件加载失败，请检查网络')); };
      document.head.appendChild(script);
    });
  }

  function canvasToWebp(canvas, quality) {
    var url = canvas.toDataURL('image/webp', quality);
    if (url.indexOf('data:image/webp') !== 0) throw new Error('当前浏览器不支持 WebP 编码');
    return dataUrlToBase64(url);
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result)); };
      reader.onerror = function () { reject(new Error('读取转换结果失败')); };
      reader.readAsDataURL(blob);
    });
  }

  function bytesToBase64(bytes) {
    var chunk = 0x8000, parts = [];
    for (var i = 0; i < bytes.length; i += chunk) {
      parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
    }
    return btoa(parts.join(''));
  }

  // 浏览器原生 <img> 解码：覆盖 PNG/JPEG/GIF/BMP/WebP/AVIF/SVG/ICO 等大多数格式。
  function decodeByImage(dataUrl) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () {
        var w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
        if (!w || !h) return reject(new Error('图片尺寸无效'));
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(image, 0, 0);
        resolve(canvas.getContext('2d').getImageData(0, 0, w, h));
      };
      image.onerror = function () { reject(new Error('浏览器无法解码该图片格式')); };
      image.src = dataUrl;
    });
  }

  // TIFF / EXIF（含多页）用随仓库提供的 UTIF.js 解码首页，作为原生解码的补充。
  function decodeTiff(arrayBuffer) {
    return loadScript(TIFF_LIB).then(function () {
      if (!window.UTIF) throw new Error('TIFF 解码组件不可用');
      var ifds = UTIF.decode(arrayBuffer);
      if (!ifds || !ifds.length) throw new Error('TIFF 文件无有效页面');
      UTIF.decodeImage(arrayBuffer, ifds[0]);
      var rgba = UTIF.toRGBA8(ifds[0]);
      return new ImageData(new Uint8ClampedArray(rgba), ifds[0].width, ifds[0].height);
    });
  }

  function decodeImageData(file, dataUrl) {
    return decodeByImage(dataUrl).catch(function (imgErr) {
      var ext = (file.name.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();
      if (TIFF_EXT[ext]) {
        return file.arrayBuffer().then(decodeTiff).catch(function () { throw imgErr; });
      }
      throw imgErr;
    });
  }

  // 位图转 SVG：按颜色量化后输出矢量路径，线条图/图标效果最好。
  function bitmapToSvg(file, dataUrl) {
    return loadScript(VECTORIZE_LIB).then(function () {
      if (!window.ImageTracer) throw new Error('矢量转换组件不可用');
      return decodeImageData(file, dataUrl).then(function (imageData) {
        var options = ImageTracer.checkoptions({
          colors: 8, filterSpeckles: true, ltres: 1, qtres: 1,
          strokewidth: 1, scale: 1, viewBox: true
        });
        options.pathprecision = 1;
        var svg = ImageTracer.imagedataToSVG(imageData, options);
        // ImageTracer 返回 UTF-8 字符串，需先转为UTF-8字节再 base64，否则中文/符号会损坏。
        var utf8 = unescape(encodeURIComponent(svg));
        return btoa(utf8);
      });
    });
  }

  function canvasToAvif(imageData, quality) {
    return import(AVIF_MODULE).then(function (mod) {
      var encode = mod.encode || mod.default;
      // jsquash 的 encode 需要可写的 Uint8ClampedArray 副本
      var data = new Uint8ClampedArray(imageData.data);
      return encode({ data: data, width: imageData.width, height: imageData.height },
        { quality: quality == null ? 50 : quality, speed: 8 });
    }).then(function (buffer) {
      var bytes = new Uint8Array(buffer);
      if (bytes.length < 12 || String.fromCharCode.apply(null, bytes.subarray(4, 8)) !== 'ftyp' ||
          String.fromCharCode.apply(null, bytes.subarray(8, 12)) !== 'avif') {
        throw new Error('AVIF 编码结果无效');
      }
      return bytesToBase64(bytes);
    });
  }

  function fallbackOriginal(file, err) {
    return readFile(file).then(function (orig) {
      var origExt = (file.name.match(/\.([^.]+)$/) || [, 'png'])[1].toLowerCase();
      // 未知扩展名统一用 png 落地，避免写出浏览器/GitHub Pages 不识别的后缀。
      var ext = INPUT_EXT_SET[origExt] ? origExt : 'png';
      return { base64: orig, ext: ext, bytes: file.size, kept: true,
        note: err && err.message ? err.message : '' };
    });
  }

  function convertToRaster(file, dataUrl, format, origSize) {
    return decodeImageData(file, dataUrl).then(function (imageData) {
      if (format === 'avif') {
        return canvasToAvif(imageData, 50).then(function (base64) {
          var bytes = Math.floor(base64.length * 3 / 4);
          if (bytes >= origSize) return fallbackOriginal(file, new Error('转换后更大'));
          return { base64: base64, ext: 'avif', bytes: bytes };
        });
      }
      // WebP：用临时 canvas 还原 imageData 后编码。
      var canvas = document.createElement('canvas');
      canvas.width = imageData.width; canvas.height = imageData.height;
      canvas.getContext('2d').putImageData(imageData, 0, 0);
      var base64 = canvasToWebp(canvas, 0.82);
      var bytes = Math.floor(base64.length * 3 / 4);
      if (bytes >= origSize) return fallbackOriginal(file, new Error('转换后更大'));
      return { base64: base64, ext: 'webp', bytes: bytes };
    });
  }

  function convertFile(file, format) {
    var origExt = (file.name.match(/\.([^.]+)$/) || [, 'png'])[1].toLowerCase();
    if (format === 'keep') return readFile(file).then(function (base64) {
      return { base64: base64, ext: (INPUT_EXT_SET[origExt] ? origExt : 'png'), bytes: file.size };
    });
    // 浏览器无法可靠解码的格式：直接原样保留，跳过解码，既省时又绝不写坏文件。
    if (PASSTHROUGH_EXT[origExt]) {
      return fallbackOriginal(file, new Error('.' + origExt + ' 浏览器无法可靠解码，已原样保留'));
    }
    return blobToDataUrl(file).then(function (dataUrl) {
      if (format === 'svg') {
        return bitmapToSvg(file, dataUrl).then(function (base64) {
          return { base64: base64, ext: 'svg', bytes: Math.floor(base64.length * 3 / 4) };
        }).catch(function () { return fallbackOriginal(file, new Error('矢量转换失败，已原样保留')); });
      }
      // 任何转换失败都回退原图：图床首要目标是不丢文件，转换只是增强。
      return convertToRaster(file, dataUrl, format, file.size)
        .catch(function () { return fallbackOriginal(file, new Error('转换失败，已原样保留')); });
    });
  }

  function uploadFile(file, name, content, bytes) {
    var path = IMAGE_DIR + '/' + name;
    var contentsUrl = 'https://api.github.com/repos/' + OWNER_REPO + '/contents/' + encodePath(path);
    return Promise.resolve(content).then(function (content) {
      // Contents API 新建文件必须提供 base64 的 content；缺字段会得到 422 content wasn't supplied。
      if (typeof content !== 'string' || !content.length) {
        throw new Error('文件 ' + name + ' 未生成有效内容，已取消上传');
      }
      var body = {
        message: 'Upload ' + name + ' via PushPic',
        branch: BRANCH,
        content: content
      };
      var payload = JSON.stringify(body);
      if (!JSON.parse(payload).hasOwnProperty('content')) {
        throw new Error('上传请求缺少 content 字段，已取消');
      }
      return apiFetch(contentsUrl, { method: 'PUT', headers: jsonHeaders(), body: payload });
    }).then(function (res) {
      return {
        name: name,
        path: res.content.path,
        sha: res.content.sha,
        size: bytes != null ? bytes : file.size,
        raw: res.content.download_url || rawUrl(res.content.path)
      };
    });
  }

  // 多关键词按空格拆分，需全部命中（AND），顺序与预览导航共用。
  function filteredFiles() {
    var words = state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return state.files.filter(function (f) {
      if (state.favOnly && !favorites[f.path]) return false;
      if (!words.length) return true;
      var name = f.name.toLowerCase();
      return words.every(function (w) { return name.indexOf(w) !== -1; });
    });
  }

  function renderGallery() {
    var files = filteredFiles();
    state.viewFiles = files;
    var allPages = state.pageSize === 'all';
    var totalPages = allPages ? 1 : Math.max(1, Math.ceil(files.length / state.pageSize));
    state.page = Math.min(state.page, totalPages);
    var start = allPages ? 0 : (state.page - 1) * state.pageSize;
    var pageFiles = allPages ? files : files.slice(start, start + state.pageSize);
    el.gallery.innerHTML = '';
    if (!pageFiles.length) {
      var p = document.createElement('p');
      p.className = 'empty';
      p.textContent = state.favOnly
        ? '还没有收藏的图片，点卡片右上角的 ☆ 收藏吧。'
        : (state.query.trim()
          ? '没有匹配「' + state.query.trim() + '」的图片。'
          : (state.files.length ? '没有匹配的文件。' : '仓库中还没有图片，上传一张试试吧。'));
      el.gallery.appendChild(p);
    }
    pageFiles.forEach(function (file) {
      var url = smartUrl(file);
      var tile = document.createElement('div');
      tile.className = 'tile';
      tile.dataset.path = file.path;
      var media = document.createElement('div');
      media.className = 'tile-media';
      var star = document.createElement('button');
      star.type = 'button';
      star.className = 'tile-star' + (favorites[file.path] ? ' is-fav' : '');
      star.textContent = favorites[file.path] ? '★' : '☆';
      star.title = favorites[file.path] ? '取消收藏' : '收藏';
      star.setAttribute('aria-label', star.title);
      star.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleFavorite(file.path);
      });
      var img = document.createElement('img');
      img.className = 'tile-thumb';
      img.src = file.raw || rawUrl(file.path);
      img.alt = file.name;
      img.loading = 'lazy';
      // raw 或 Pages 任一源失败时自动切到另一个，避免裂图。
      img.addEventListener('error', function () {
        var fallback = img.src.indexOf('raw.githubusercontent.com') !== -1
          ? displayUrl(file.path) : (file.raw || rawUrl(file.path));
        if (img.dataset.fallback !== fallback) {
          img.dataset.fallback = fallback;
          img.src = fallback;
        }
      });
      img.addEventListener('click', function () { openPreview(file); });
      var meta = document.createElement('div');
      meta.className = 'tile-meta';
      var name = document.createElement('span');
      name.className = 'tile-name';
      name.textContent = file.name;
      name.title = file.name;
      var sub = document.createElement('div');
      sub.className = 'tile-sub';
      var ready = document.createElement('span');
      ready.className = 'tile-ready ' + (pagesReady[file.path] ? 'ready' : 'pending');
      ready.textContent = pagesReady[file.path] ? '已上线' : '部署中';
      sub.appendChild(ready);
      sub.appendChild(document.createTextNode(' · ' + formatSize(file.size)));
      meta.appendChild(name);
      meta.appendChild(sub);
      var actions = document.createElement('div');
      actions.className = 'tile-actions';
      var copy = document.createElement('button');
      copy.className = 'btn btn-primary';
      copy.type = 'button';
      copy.textContent = '复制链接';
      copy.addEventListener('click', function () { copyText(url, copy); });
      var md = document.createElement('button');
      md.className = 'btn btn-ghost';
      md.type = 'button';
      md.textContent = 'MD';
      md.title = '复制 Markdown 代码';
      md.addEventListener('click', function () { copyText('![' + file.name + '](' + url + ')', md); });
      var dl = document.createElement('button');
      dl.className = 'btn btn-ghost';
      dl.type = 'button';
      dl.textContent = '下载';
      dl.addEventListener('click', function () { downloadFile(file); });
      var del = document.createElement('button');
      del.className = 'btn btn-ghost';
      del.type = 'button';
      del.textContent = '删除';
      del.addEventListener('click', function () { deleteFile(file, del); });
      actions.appendChild(copy);
      actions.appendChild(md);
      actions.appendChild(dl);
      del.className = 'btn btn-ghost btn-wide';
      actions.appendChild(del);
      media.appendChild(star);
      media.appendChild(img);
      tile.appendChild(media);
      tile.appendChild(meta);
      tile.appendChild(actions);
      el.gallery.appendChild(tile);
    });
    el.pagination.hidden = allPages || files.length <= state.pageSize;
    el.pageInfo.textContent = state.page + ' / ' + totalPages;
    el.prevBtn.disabled = state.page <= 1;
    el.nextBtn.disabled = state.page >= totalPages;
    if (el.resultCount) {
      el.resultCount.textContent = files.length === state.files.length
        ? '共 ' + files.length + ' 张' : '匹配 ' + files.length + ' / ' + state.files.length + ' 张';
    }
    if (el.searchClear) el.searchClear.hidden = !state.query;
    observeTiles();
    updatePagesBadge();
  }

  function formatSize(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  // 简易并发池：最多 limit 个任务同时跑，全部完成后按原顺序返回结果。
  function mapLimit(items, limit, worker, onProgress) {
    return new Promise(function (resolve) {
      var results = new Array(items.length);
      var next = 0, active = 0, done = 0;
      function run() {
        while (active < limit && next < items.length) {
          (function (i) {
            active++;
            Promise.resolve().then(function () { return worker(items[i], i); })
              .then(function (r) { results[i] = r; })
              .catch(function (e) { results[i] = { error: e }; })
              .then(function () {
                active--; done++;
                if (onProgress) onProgress(done, items.length);
                if (done === items.length) resolve(results);
                else run();
              });
          })(next++);
        }
      }
      if (!items.length) resolve(results);
      else run();
    });
  }

  function toggleFavorite(path) {
    if (favorites[path]) delete favorites[path];
    else favorites[path] = 1;
    saveFavorites();
    renderGallery();
  }

  function downloadFile(file) {
    var url = (file.raw || rawUrl(file.path));
    var a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function copyText(text, btn) {
    var done = function () {
      var old = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(function () { btn.textContent = old; }, 1500);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); }
    catch (e) { setStatus('复制失败，请手动复制。', 'err'); }
    document.body.removeChild(ta);
  }

  function openPreview(file) {
    var view = state.viewFiles.length ? state.viewFiles : state.files;
    var idx = -1;
    for (var i = 0; i < view.length; i++) { if (view[i].path === file.path) { idx = i; break; } }
    state.previewIndex = idx;
    el.previewName.textContent = file.name + (idx >= 0 ? '　' + (idx + 1) + ' / ' + view.length : '');
    var previewSrc = file.raw || rawUrl(file.path);
    el.previewImg.onerror = function () {
      el.previewImg.onerror = null;
      el.previewImg.src = displayUrl(file.path);
    };
    el.previewImg.src = previewSrc;
    var pagesLink = displayUrl(file.path);
    var rawLink = file.raw || rawUrl(file.path);
    var smart = smartUrl(file);
    el.previewLinks.innerHTML = '';
    [
      ['推荐链接（' + (pagesReady[file.path] ? 'Pages' : 'raw，Pages 部署中') + '）', smart, 'ready'],
      ['Pages 链接' + (pagesReady[file.path] ? '（已上线）' : '（部署中，可能暂时 404）'), pagesLink, pagesReady[file.path] ? 'ready' : 'pending'],
      ['原始文件链接（raw，立即可用）', rawLink, 'ready'],
      ['Markdown', '![' + file.name + '](' + smart + ')', '']
    ].forEach(function (pair) {
      var label = document.createElement('div');
      label.className = 'link-label';
      label.textContent = pair[0];
      if (pair[2]) {
        var tag = document.createElement('span');
        tag.className = 'link-tag ' + pair[2];
        tag.textContent = pair[2] === 'ready' ? '可用' : '部署中';
        label.appendChild(document.createTextNode(' '));
        label.appendChild(tag);
      }
      var row = document.createElement('div');
      row.className = 'link-row';
      var input = document.createElement('input');
      input.className = 'input';
      input.readOnly = true;
      input.value = pair[1];
      var btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.type = 'button';
      btn.textContent = '复制';
      btn.addEventListener('click', function () { copyText(pair[1], btn); });
      row.appendChild(input);
      row.appendChild(btn);
      el.previewLinks.appendChild(label);
      el.previewLinks.appendChild(row);
    });
    el.previewModal.hidden = false;
  }

  function deleteFile(file, btn) {
    if (!window.confirm('确定删除 ' + file.name + '？')) return;
    btn.disabled = true;
    var url = 'https://api.github.com/repos/' + OWNER_REPO + '/contents/' + encodePath(file.path);
    apiFetch(url, {
      method: 'DELETE',
      headers: jsonHeaders(),
      body: JSON.stringify({ message: 'Delete ' + file.name + ' via PushPic', sha: file.sha, branch: BRANCH })
    }).then(function () {
      state.files = state.files.filter(function (f) { return f.path !== file.path; });
      renderGallery();
      setStatus('已删除 ' + file.name, 'ok');
      return refresh();
    }).catch(function (err) {
      btn.disabled = false;
      setStatus('删除失败：' + err.message, 'err');
    });
  }

  var refreshTimer = null;
  function refresh(force) {
    var btn = el.refreshBtn;
    var label = btn.querySelector('.refresh-label');
    var sub = btn.querySelector('.refresh-sub');
    var now = Date.now();
    // 手动点击时 800ms 内的重复触发直接忽略，防止连点打爆 API。
    if (force && now - state.lastRefresh < 800) return state.refreshPromise || Promise.resolve(state.files);
    if (state.refreshing) return state.refreshPromise;
    state.lastRefresh = now;
    state.refreshing = true;
    btn.disabled = true;
    btn.classList.remove('is-done', 'is-error');
    btn.classList.add('is-loading');
    label.textContent = '刷新中';
    if (sub) sub.textContent = '正在请求 GitHub…';
    btn.setAttribute('aria-label', '正在刷新图片库');

    state.refreshPromise = listImages(force).then(function (files) {
      state.files = files;
      renderGallery();
      btn.classList.remove('is-loading');
      btn.classList.add('is-done');
      label.textContent = '已更新 ' + files.length + ' 张';
      if (sub) sub.textContent = '刚刚同步完成';
      if (el.refreshMeta) el.refreshMeta.textContent = '上次刷新 ' + clockTime();
      btn.setAttribute('aria-label', '刷新成功，共 ' + files.length + ' 张图片');
      setStatus('图片库已更新，共 ' + files.length + ' 张。', 'ok');
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(resetRefreshBtn, 1800);
      probeExisting(files); // 后台探测 Pages 生效状态，不阻塞刷新
      return files;
    }).catch(function (err) {
      btn.classList.remove('is-loading');
      btn.classList.add('is-error');
      label.textContent = '刷新失败';
      if (sub) sub.textContent = '点击重试';
      if (el.refreshMeta) el.refreshMeta.textContent = '上次尝试 ' + clockTime();
      btn.setAttribute('aria-label', '刷新失败，点击重试');
      setStatus('加载图片失败：' + err.message, 'err');
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(resetRefreshBtn, 2600);
      throw err;
    }).then(function (r) {
      state.refreshing = false;
      state.refreshPromise = null;
      return r;
    }, function (e) {
      state.refreshing = false;
      state.refreshPromise = null;
      throw e;
    });
    return state.refreshPromise;
  }

  function clockTime() {
    var d = new Date();
    function pad(n) { return ('0' + n).slice(-2); }
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function resetRefreshBtn() {
    var btn = el.refreshBtn;
    var label = btn.querySelector('.refresh-label');
    var sub = btn.querySelector('.refresh-sub');
    btn.disabled = false;
    btn.classList.remove('is-loading', 'is-done', 'is-error');
    label.textContent = '刷新';
    if (sub) sub.textContent = '点击同步';
    btn.setAttribute('aria-label', '刷新图片库');
  }

  function baseName(file) {
    return (file.name.replace(/\.[^.]+$/, '') || 'image');
  }

  // 用 Web Crypto 算内容摘要，同一批里完全相同的文件只上传一次。
  function contentDigest(file) {
    if (!window.crypto || !crypto.subtle || !file.arrayBuffer) return Promise.resolve('');
    return file.arrayBuffer().then(function (buf) {
      return crypto.subtle.digest('SHA-256', buf);
    }).then(function (hash) {
      var bytes = new Uint8Array(hash), hex = '';
      for (var i = 0; i < bytes.length; i++) hex += ('0' + bytes[i].toString(16)).slice(-2);
      return hex;
    }).catch(function () { return ''; });
  }

  function uploadFiles(files) {
    var format = el.formatSelect.value;
    var list = Array.prototype.slice.call(files).filter(function (f) { return f.type.indexOf('image/') === 0; });
    if (!list.length) { setStatus('未选择图片文件。', 'err'); return; }
    if (list.length > MAX_FILES) {
      setStatus('一次最多上传 ' + MAX_FILES + ' 张，已截取前 ' + MAX_FILES + ' 张。', 'err');
      list = list.slice(0, MAX_FILES);
    }
    var oversized = list.filter(function (f) { return f.size > MAX_SIZE; });
    if (oversized.length) {
      setStatus('以下文件超过 50 MB，已跳过：' + oversized.map(function (f) { return f.name; }).join('、'), 'err');
      list = list.filter(function (f) { return f.size <= MAX_SIZE; });
    }
    if (!list.length) return;
    var dedupNote = '';
    // 内容相同的文件只传一份，重复的写入名由 uniqueName 处理（内容不同仍会另存）。
    return mapLimit(list, 8, contentDigest).then(function (digests) {
      var seen = {};
      var uploadList = list.filter(function (file, i) {
        var d = digests[i];
        if (!d || !seen[d]) { if (d) seen[d] = 1; return true; }
        return false;
      });
      var dup = list.length - uploadList.length;
      if (dup) dedupNote = '已跳过 ' + dup + ' 张内容重复的文件。';
      return doUpload(uploadList, dedupNote);
    });

    function doUpload(list, dedupNote) {
    el.progressWrap.hidden = false;
    setStatus(dedupNote + '正在处理 0/' + list.length + ' …');
    var succeeded = 0, failed = 0;
    var failNames = [];

    // 并发 4 张同时处理：转换（CPU）与上传（网络）重叠，明显快于串行。
    return mapLimit(list, 4, function (file) {
      return convertFile(file, format).then(function (result) {
        var name = uniqueName(baseName(file) + '.' + result.ext);
        return uploadFile(file, name, result.base64, result.bytes).then(function (item) {
          state.files.push(item);
          succeeded++;
          renderGallery();
          // 后台探测 Pages 何时生效，未上线前复制 raw，避免用户点到 404。
          trackDeployment(item);
        });
      });
    }, function (done, total) {
      el.progressBar.style.width = (done / total * 100) + '%';
      el.progressText.textContent = done + ' / ' + total;
      setStatus('正在处理 ' + done + '/' + total + ' …');
    }).then(function (results) {
      var kept = 0;
      results.forEach(function (r, i) {
        if (r && r.kept) kept++;
        if (r && r.error) {
          failed++;
          failNames.push(list[i].name + '（' + r.error.message + '）');
        }
      });
      var msg = '上传完成，成功 ' + succeeded + ' 张。raw 链接已可用，Pages 链接上线后会自动标记。';
      if (kept) msg += ' 其中 ' + kept + ' 张因转换失败或反而更大已保留原格式。';
      if (dedupNote) msg = dedupNote + ' ' + msg;
      if (failed) msg += ' 失败 ' + failed + ' 张：' + failNames.join('；');
      setStatus(msg, failed ? 'err' : 'ok');
      // 后台静默刷新以对齐仓库真实状态（force 清缓存），不覆盖已显示的结果。
      return refresh(true).catch(function () {});
    });
    }
  }

  function init() {
    ['repoBadge', 'pagesBadge', 'dropzone', 'fileInput', 'progressWrap', 'progressBar', 'progressText',
     'status', 'gallery', 'searchInput', 'searchClear', 'resultCount', 'refreshBtn', 'refreshMeta', 'pagination', 'prevBtn', 'nextBtn', 'pageInfo',
     'previewModal', 'previewName', 'previewImg', 'previewLinks', 'formatSelect', 'formatHint',
     'favFilterBtn', 'pageSizeSelect'].forEach(function (id) { el[id] = $(id); });

    var savedFormat = getConvertFormat();
    el.formatSelect.value = savedFormat;
    var hints = {
      keep: '按原文件上传，覆盖 80+ 种扩展名：常见位图/JPEG2000/JXL/QOI/HEIC/AVIF/TIFF/传真/RAW/矢量设计/Netpbm/动画等',
      webp: '浏览器本地转 WebP，通常体积更小；转换后更大或无法解码则保留原图',
      avif: '浏览器本地转 AVIF（更高压缩率），首次使用需加载约 4.5 MB 编码组件；转换后更大则保留原图',
      svg: '转为矢量轮廓，适合图标/线条图；照片类不建议使用'
    };
    var updateHint = function () { el.formatHint.textContent = hints[el.formatSelect.value]; };
    updateHint();
    el.formatSelect.addEventListener('change', function () {
      setConvertFormat(el.formatSelect.value);
      updateHint();
      setStatus('已保存上传格式设置：' + el.formatSelect.options[el.formatSelect.selectedIndex].text, 'ok');
    });

    // 恢复分页大小与收藏筛选设置
    state.pageSize = loadPageSize();
    el.pageSizeSelect.value = String(state.pageSize);
    try { state.favOnly = localStorage.getItem(FAV_FILTER_KEY) === '1'; } catch (e) {}
    function syncFavBtn() {
      el.favFilterBtn.setAttribute('aria-pressed', state.favOnly ? 'true' : 'false');
      el.favFilterBtn.textContent = state.favOnly ? '★ 收藏' : '☆ 收藏';
    }
    syncFavBtn();
    el.favFilterBtn.addEventListener('click', function () {
      state.favOnly = !state.favOnly;
      state.page = 1;
      syncFavBtn();
      try { localStorage.setItem(FAV_FILTER_KEY, state.favOnly ? '1' : '0'); } catch (e) {}
      renderGallery();
    });
    el.pageSizeSelect.addEventListener('change', function () {
      var v = el.pageSizeSelect.value;
      state.pageSize = v === 'all' ? 'all' : parseInt(v, 10);
      state.page = 1;
      try { localStorage.setItem(PAGESIZE_KEY, v); } catch (e) {}
      renderGallery();
    });

    el.dropzone.addEventListener('click', function () { el.fileInput.click(); });
    el.dropzone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.fileInput.click(); }
    });
    el.fileInput.addEventListener('change', function () {
      uploadFiles(el.fileInput.files);
      el.fileInput.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (evt) {
      el.dropzone.addEventListener(evt, function (e) { e.preventDefault(); el.dropzone.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      el.dropzone.addEventListener(evt, function (e) { e.preventDefault(); el.dropzone.classList.remove('dragover'); });
    });
    el.dropzone.addEventListener('drop', function (e) { uploadFiles(e.dataTransfer.files); });

    el.refreshBtn.addEventListener('click', function () { refresh(true).catch(function () {}); });
    var searchTimer = null;
    el.searchInput.addEventListener('input', function () {
      var value = el.searchInput.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        state.query = value; state.page = 1; renderGallery();
      }, 120);
    });
    el.searchClear.addEventListener('click', function () {
      clearTimeout(searchTimer);
      el.searchInput.value = ''; state.query = ''; state.page = 1; renderGallery(); el.searchInput.focus();
    });
    el.prevBtn.addEventListener('click', function () { state.page--; renderGallery(); });
    el.nextBtn.addEventListener('click', function () { state.page++; renderGallery(); });
    document.querySelectorAll('[data-close-preview]').forEach(function (node) {
      node.addEventListener('click', function () { el.previewModal.hidden = true; });
    });
    document.addEventListener('keydown', function (e) {
      if (el.previewModal.hidden) return;
      if (e.key === 'Escape') { el.previewModal.hidden = true; return; }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var view = state.viewFiles.length ? state.viewFiles : state.files;
      if (!view.length || state.previewIndex < 0) return;
      e.preventDefault();
      var step = e.key === 'ArrowRight' ? 1 : -1;
      var next = (state.previewIndex + step + view.length) % view.length;
      openPreview(view[next]);
    });

    refresh();
  }

  var boot = function () {
    init();
    if (location.search.indexOf('test=1') !== -1) {
      window.__pushpicTest = {
        convertFile: convertFile, refresh: refresh, state: state, getFormat: getConvertFormat,
        smartUrl: smartUrl, probeImage: probeImage, probeExisting: probeExisting,
        displayUrl: displayUrl, rawUrl: rawUrl, pagesReady: pagesReady,
        openPreview: openPreview, renderGallery: renderGallery, el: el,
        filteredFiles: filteredFiles, contentDigest: contentDigest, filteredCount: function () { return filteredFiles().length; },
        toggleFavorite: toggleFavorite, favorites: favorites, downloadFile: downloadFile
      };
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
