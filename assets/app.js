/* PushPic - GitHub Pages 图床：前端零令牌暴露，读取免配置，写入用本机令牌。
 * 任何放进前端的令牌都等于公开，故不再内置 PAT；写入走浏览器直传 Contents API。 */
(function () {
  'use strict';

  var OWNER_REPO = 'TechnologySauce/PushPic';
  var BRANCH = 'main';
  var IMAGE_DIR = 'images';
  // 默认直连官方 API；只有部署者显式开启同源代理时才改走本机 /api/v1/github。
  // 这样模板副本即使不提供后端，也仍能读取公开图片库，不会莫名其妙 404。
  function apiBase() {
    var cfg = window.PUSHPIC_CONFIG || {};
    return cfg.sameOriginApi ? location.origin + '/api/v1/github' : 'https://api.github.com/repos/' + OWNER_REPO;
  }
  // 安全架构（v3.4 起，零令牌暴露）：
  //   读取：走 GitHub 公开 API，无需任何令牌，打开即可浏览图库。
  //   写入：浏览器直传 GitHub Contents API（PUT/DELETE），支持 50MB 大图。
  //   令牌：站点不含任何内置写入凭证（config.js tokenParts 为空）。要上传/删除，
  //         由使用者在本机填入自有令牌，WebCrypto AES-GCM 加密存 localStorage，
  //         设备密钥存 sessionStorage（关闭标签即失效），令牌永不进入仓库代码或网络日志。
  //   严格 CSP + 内容校验 + 加密存储 + 限流构成纵深防御。
  // 运行时策略：config.js 冻结后以只读属性暴露，这里只读一次。
  var POLICY = (function () {
    var c = window.PUSHPIC_CONFIG || {};
    return {
      headProbe: c.headProbe !== false,
      probeTimeout: Math.max(1500, Math.min(15000, Number(c.probeTimeoutMs) || 6000)),
      dedupByContent: !!c.dedupByContent,
      readyTtl: Math.max(0, Number(c.readyTtlMs) || 10 * 60 * 1000),
      listCacheTtl: Math.max(0, Number(c.listCacheTtlMs) || 3 * 60 * 1000)
    };
  })();
  var TOKEN_STORE = 'pushpic.dispatchToken.v2';
  var TOKEN_KEY = 'pushpic.deviceKey';
  var DISPATCH_TOKEN = '';
  var TOKEN_BLOCKED = !!window.PUSHPIC_TOKEN_BLOCKED;
  // 站点内置令牌恒为空（config.js tokenParts=[]）；仅保留变量以兼容旧引用。
  var BUILTIN_TOKEN = window.PUSHPIC_DISPATCH_TOKEN || '';
  var tokenReady = loadDispatchToken(); // 异步准备，写入前会等待
  function b64url(bytes) {
    return btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64url(s) {
    s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); });
  }
  function strToBytes(str) { return new TextEncoder().encode(str); }
  function bytesToStr(bytes) { return new TextDecoder().decode(bytes); }
  function getDeviceKey() {
    try {
      var existing = sessionStorage.getItem(TOKEN_KEY);
      if (existing) return crypto.subtle.importKey('raw', unb64url(existing), 'AES-GCM', false, ['encrypt', 'decrypt']);
      var promise = crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
        .then(function (key) {
          return crypto.subtle.exportKey('raw', key).then(function (raw) {
            sessionStorage.setItem(TOKEN_KEY, b64url(new Uint8Array(raw)));
            return key;
          });
        });
      return promise;
    } catch (e) { return Promise.reject(e); }
  }
  function loadDispatchToken() {
    try {
      var enc = localStorage.getItem(TOKEN_STORE);
      if (!enc) {
        // 无内置令牌：未在本机配置前保持只读，绝不注入随站点分发的凭证。
        var legacy = localStorage.getItem('pushpic.dispatchToken') || '';
        if (legacy) return saveDispatchToken(legacy);
        DISPATCH_TOKEN = BUILTIN_TOKEN; // 默认空字符串
        return Promise.resolve(DISPATCH_TOKEN);
      }
      return getDeviceKey().then(function (key) {
        var parts = enc.split('.');
        if (parts.length !== 2) throw new Error('bad token record');
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64url(parts[0]) }, key, unb64url(parts[1]));
      }).then(function (plain) { DISPATCH_TOKEN = bytesToStr(plain); if (typeof syncTokenBtn === 'function') syncTokenBtn(); return DISPATCH_TOKEN; })
        .catch(function () { DISPATCH_TOKEN = BUILTIN_TOKEN; return DISPATCH_TOKEN; }); // 回退也仅为空
    } catch (e) { return Promise.resolve(''); }
  }
  function saveDispatchToken(v) {
    v = String(v || '').trim();
    // 直传 Contents API 需要写权限。接受经典 PAT（ghp_）与细粒度令牌（github_pat_），
    // 但明确提示最小权限原则：只授予本仓库 Contents 读写，且设置过期时间。
    if (v && !/^(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255})$/.test(v)) {
      return Promise.reject(new Error('令牌格式不正确：应为 ghp_（经典）或 github_pat_（细粒度）开头的合法令牌。请授予本仓库 Contents 读写权限并设置过期时间。'));
    }
    if (!v) {
      try { localStorage.removeItem(TOKEN_STORE); localStorage.removeItem('pushpic.dispatchToken'); } catch (e) {}
      DISPATCH_TOKEN = BUILTIN_TOKEN; // 清空后回到只读（无内置令牌）
      if (typeof syncTokenBtn === 'function') syncTokenBtn();
      return Promise.resolve(DISPATCH_TOKEN);
    }
    return getDeviceKey().then(function (key) {
      var iv = crypto.getRandomValues(new Uint8Array(12));
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, strToBytes(v)).then(function (ct) {
        try { localStorage.setItem(TOKEN_STORE, b64url(iv) + '.' + b64url(new Uint8Array(ct))); } catch (e) {}
        try { localStorage.removeItem('pushpic.dispatchToken'); } catch (e) {}
        DISPATCH_TOKEN = v;
        if (typeof syncTokenBtn === 'function') syncTokenBtn();
        return v;
      });
    });
  }
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
  var CACHE_TTL = POLICY.listCacheTtl; // ETag 缓存有效期，见 config.listCacheTtlMs
  var pagesReady = {};       // path -> true：图片已在 Pages 上生效
  var probeDone = {};        // path -> true：本次会话已探测过，避免重复请求
  var deployTimers = {};     // path -> timer：后台部署探测计时器
  // 已在 Pages 上生效的图片在本次标签会话内缓存到 sessionStorage，
  // 翻页/刷新不必对每张图重复发探测请求；带 TTL 避免状态长期失真。
  var READY_STORE = 'pushpic.pagesReady.v2';
  var READY_TTL = POLICY.readyTtl;
  function loadReadyState() {
    try {
      var v = JSON.parse(sessionStorage.getItem(READY_STORE) || '{}');
      var now = Date.now();
      var fresh = {};
      Object.keys(v).forEach(function (p) {
        if (v[p] && now - v[p] < READY_TTL) { pagesReady[p] = true; fresh[p] = v[p]; }
      });
      // 顺手丢弃过期条目，避免 sessionStorage 无限增长。
      try { sessionStorage.setItem(READY_STORE, JSON.stringify(fresh)); } catch (e2) {}
    } catch (e) {}
  }
  function persistReady(path) {
    try {
      var v = JSON.parse(sessionStorage.getItem(READY_STORE) || '{}');
      v[path] = Date.now();
      sessionStorage.setItem(READY_STORE, JSON.stringify(v));
    } catch (e) {}
  }
  var PROBE_INTERVAL = 3000;
  var PROBE_MAX = 24;        // 最多探测约 72 秒

  function $(id) { return document.getElementById(id); }

  function cachedFetch(url, options, useCache, auth) {
    var hit = pendingRequests[url];
    if (hit) return hit;
    var req = (function () {
      var opts = Object.assign({}, options || {});
      var headers = Object.assign(auth ? apiHeaders(true) : baseHeaders(), opts.headers || {});
      var cached = useCache ? etagCache[url] : null;
      var fresh = cached && cached.etag && (Date.now() - (cached.at || 0) < CACHE_TTL);
      if (fresh) headers['If-None-Match'] = cached.etag;
      opts.headers = headers;
      return fetchWithTimeout(url, opts).then(function (res) {
        if (res.status === 304 && etagCache[url]) return etagCache[url].data;
        if (res.status === 404) {
          delete etagCache[url]; // 缓存失效及时清理，避免一直用旧数据
          var e404 = new Error('Not Found'); e404.status = 404; throw e404;
        }
        return res.json().then(function (data) {
          if (useCache && res.ok && res.headers && res.headers.get) {
            var etag = res.headers.get('etag');
            if (etag) etagCache[url] = { etag: etag, data: data, at: Date.now() };
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

  // 图片库快照会话缓存：重新打开页面时可先渲染一帧，再与 GitHub API 对齐。
  // 只存结构化图片元数据（名称/sha/大小/链接），不存任何令牌或敏感信息。
  var LIST_SNAPSHOT_KEY = 'pushpic.listSnapshot.v1';
  function saveListSnapshot(files) {
    try {
      var slim = files.map(function (f) {
        return { name: f.name, path: f.path, sha: f.sha, size: f.size };
      });
      sessionStorage.setItem(LIST_SNAPSHOT_KEY, JSON.stringify({ at: Date.now(), files: slim }));
    } catch (e) {}
  }
  function loadListSnapshot() {
    try {
      var v = JSON.parse(sessionStorage.getItem(LIST_SNAPSHOT_KEY) || '{}');
      if (!v || !Array.isArray(v.files) || Date.now() - (v.at || 0) > POLICY.listCacheTtl) return null;
      return v.files.map(function (f) {
        return { name: f.name, path: f.path, sha: f.sha, size: f.size, raw: rawUrl(f.path) };
      }).filter(function (f) { return f.path && IMAGE_EXT.test(f.name); });
    } catch (e) { return null; }
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

  function baseHeaders() {
    return {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  // 给每个网络请求加超时，避免弱网下请求悬挂拖住整个页面；超时按网络错误重试。
  function fetchWithTimeout(url, opts, ms) {
    var options = Object.assign({}, opts || {});
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (controller) options.signal = controller.signal;
    // 默认 10s 超时，最长 20s；慢网悬挂不至于长期占用连接与内存。
    var timeout = Math.max(1000, Math.min(20000, ms || 10000));
    var timer = setTimeout(function () { if (controller) controller.abort(); }, timeout);
    return fetch(url, options).then(function (res) { clearTimeout(timer); return res; },
      function (err) { clearTimeout(timer); throw err; });
  }

  // 读取公开数据不需要令牌；写入时附加已准备好的令牌（内置或本机覆盖）。
  function apiHeaders(authenticated) {
    var h = baseHeaders();
    if (authenticated && DISPATCH_TOKEN) h['Authorization'] = 'Bearer ' + DISPATCH_TOKEN;
    return h;
  }

  function jsonHeaders(authenticated) {
    return Object.assign(apiHeaders(authenticated), { 'Content-Type': 'application/json' });
  }

  function encodePath(path) { return path.split('/').map(encodeURIComponent).join('/'); }

  // GitHub 官方 API 与同源代理共用一套相对路径，避免多处硬编码。
  function apiPath(path) { return apiBase() + path; }

  // 同源 URL：站点与图片都在 Pages 域下，复用已建立的 DNS/TLS 连接，也不硬编码仓库地址。
  function displayUrl(path) {
    try { return new URL(encodePath(path), document.baseURI || './').href; }
    catch (e) { return (document.baseURI || './').replace(/\/?$/, '/') + encodePath(path); }
  }

  // 破缓存参数取「站点资产版本 + 列表 ETag」，稳定且会随发布变化，避免每次随机参数打碎 CDN 缓存。
  function cacheBust() {
    var cfg = window.PUSHPIC_CONFIG || {};
    var hit = etagCache[apiPath('/contents/' + encodePath(IMAGE_DIR) + '?ref=' + encodeURIComponent(BRANCH))];
    var etag = hit && hit.etag ? String(hit.etag).replace(/[^"\w-]/g, '') : '';
    var tag = [cfg.assetVersion || 'v1', etag].filter(Boolean).join('-');
    return tag ? encodeURIComponent(tag) : '';
  }

  function rawUrl(path) {
    return 'https://raw.githubusercontent.com/' + OWNER_REPO + '/' + BRANCH + '/' + encodePath(path);
  }

  // 用 Image 加载探测链接是否可用（img 跨域无需 CORS 头），加随机参数破 CDN 缓存。
  var probeCache = {};    // url -> true：本次会话内已确认可用的链接
  var probeFlights = {};  // url -> Promise：并发中的同链接探测复用，避免请求风暴
  function probeImage(url, timeout) {
    if (probeCache[url]) return Promise.resolve(true);
    if (probeFlights[url]) return probeFlights[url];
    var ms = Math.min(timeout || POLICY.probeTimeout, POLICY.probeTimeout);
    var flight = new Promise(function (resolve) {
      var done = false;
      var img = null, timer = null;
      var v = cacheBust() || String(Date.now());
      var probeUrl = url + (url.indexOf('?') === -1 ? '?' : '&') + '_probe=' + encodeURIComponent(v);
      function finish(ok) {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (img) { img.onload = img.onerror = null; img.src = ''; }
        if (ok) probeCache[url] = true;
        resolve(ok);
      }
      // 回退路径：<img> 加载（老浏览器 / HEAD 被 CORS 或服务端拒绝时）。
      // 只下载一张已缓存的小图，作为最后的确认手段。
      function viaImage() {
        img = new Image();
        img.referrerPolicy = 'no-referrer';
        timer = setTimeout(function () { finish(false); }, ms);
        img.onload = function () { finish(true); };
        img.onerror = function () { finish(false); };
        img.src = probeUrl;
      }
      // 主路径：HEAD 请求只取响应头，不下载图片字节。图库几十张时省下大量流量，
      // 且不受 <img> 的解码开销影响。github.io / raw 均返回 ACAO:*，HEAD 不触发预检。
      if (POLICY.headProbe && typeof fetch === 'function') {
        fetchWithTimeout(probeUrl, {
          method: 'HEAD', cache: 'no-store', referrerPolicy: 'no-referrer'
        }, ms).then(function (res) {
          if (res && res.ok) finish(true);
          else if (res && (res.status === 405 || res.status === 403 || res.status === 501)) viaImage();
          else finish(false);
        }).catch(viaImage);
      } else viaImage();
    });
    probeFlights[url] = flight;
    return flight.then(function (ok) {
      delete probeFlights[url];
      return ok;
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
          persistReady(path);
          delete deployTimers[path];
          updatePagesBadge();
          setTileReady(path);
        } else if (++tries < PROBE_MAX) {
          // 页面不可见时暂停探测，回到前台再继续，省电省流量。
          var scheduleNext = function () {
            deployTimers[path] = setTimeout(next, PROBE_INTERVAL);
          };
          if (document.hidden) {
            delete deployTimers[path];
            document.addEventListener('visibilitychange', function resume() {
              if (document.hidden) return;
              document.removeEventListener('visibilitychange', resume);
              if (!pagesReady[path]) scheduleNext();
            });
          } else scheduleNext();
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
    // 单次最多探测 24 个，避免超大图库进入视口时一次性打满并发。
    targets = targets.slice(0, 24);
    return mapLimit(targets, 6, function (f) {
      if (pagesReady[f.path]) return false;
      return probeImage(displayUrl(f.path), 6000).then(function (ok) {
        probeDone[f.path] = true;
        if (ok) { pagesReady[f.path] = true; persistReady(f.path); return true; }
        return false;
      });
    }).then(function (changed) {
      // 只有状态真的变了才重绘，避免每次探测都白白重排整个图库。
      if (changed.some(Boolean)) { renderGallery(); updatePagesBadge(); }
    });
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

  function usingBuiltin() {
    // 站点不再内置任何令牌，恒为 false；保留函数供旧调用点兼容。
    return false;
  }

  // 令牌按钮反映是否已配置：已配置=绿色实心，未配置=描边（只读）。
  function syncTokenBtn() {
    if (!el.tokenBtn) return;
    el.tokenBtn.classList.toggle('is-ready', !!DISPATCH_TOKEN);
    el.tokenBtn.textContent = DISPATCH_TOKEN ? '✓ 令牌' : '⚙ 令牌';
    el.tokenBtn.title = DISPATCH_TOKEN
      ? '已在本机配置上传令牌（点此更换或清除）。令牌仅存本机，不随站点公开。'
      : '只读模式：点此填入自己的令牌即可上传。令牌 AES-GCM 加密只存本机，不进仓库。';
  }

  function apiFetch(url, options, attempts, noRetry, retried) {
    var opts = Object.assign({ headers: baseHeaders() }, options || {});
    var n = noRetry ? 0 : (attempts == null ? 2 : attempts);
    var retryIndex = retried || 0;
    return fetchWithTimeout(url, opts).then(function (res) {
      // 204/205 无响应体，不能调用 json()。
      if (res.status === 204 || res.status === 205) return {};
      if (res.ok) return res.json();
      return res.json().catch(function () { return {}; }).then(function (body) {
        var headers = res.headers && res.headers.get ? res.headers : null;
        var remaining = headers ? headers.get('x-ratelimit-remaining') : null;
        var reset = headers ? headers.get('x-ratelimit-reset') : null;
        var retryAfter = headers ? headers.get('retry-after') : null;
        var friendly = {
          401: '令牌无效或已过期（401），请点右上角「令牌」重新填写',
          403: '写入被拒绝（403）：权限不足，请检查令牌范围',
          404: '仓库或文件不存在（404）',
          409: '文件冲突（409），请刷新后重试',
          422: '请求被拒绝（422）：' + (body.message || '内容不符合要求')
        };
        // 401 说明本机令牌失效/被撤销：清掉损坏记录回到只读，避免拿无效凭证反复重试。
        if (res.status === 401 && DISPATCH_TOKEN) {
          try { localStorage.removeItem(TOKEN_STORE); localStorage.removeItem('pushpic.dispatchToken'); } catch (e2) {}
          DISPATCH_TOKEN = BUILTIN_TOKEN; // 空
          if (typeof syncTokenBtn === 'function') syncTokenBtn();
        }
        var err = new Error(friendly[res.status] || body.message || ('GitHub API ' + res.status));
        err.status = res.status;
        err.remaining = remaining;
        err.reset = reset;
        err.retryAfter = retryAfter;
        if (res.status === 403 && (remaining === '0' || /rate limit/i.test(body.message || ''))) {
          err.message = rateLimitHint(err, err.message);
        }
        throw err;
      });
    }).catch(function (err) {
      // 网络抖动 / 5xx 自动重试一次；4xx 是明确错误，不重试。
      if (n > 0 && (!err.status || err.status >= 500)) {
        var waited = Math.min(1200, 300 * Math.pow(2, retryIndex));
        return new Promise(function (resolve) { setTimeout(resolve, waited); })
          .then(function () { return apiFetch(url, opts, n - 1, noRetry, retryIndex + 1); });
      }
      throw err;
    });
  }

  // ETag 缓存的轻量入口：只取结构化的图片数组，命中即可在 API 请求前先渲染一帧，
  // 弱网/慢 API 下首屏不再空白；随后 listImages 返回权威数据再对齐一次。
  function cachedImageList() {
    var url = apiPath('/contents/' + encodePath(IMAGE_DIR) + '?ref=' + encodeURIComponent(BRANCH));
    var hit = etagCache[url];
    if ((!hit || !Array.isArray(hit.data))) return loadListSnapshot();
    return hit.data.filter(function (item) {
      return item.type === 'file' && IMAGE_EXT.test(item.name);
    }).map(function (item) {
      return { name: item.name, path: item.path, sha: item.sha, size: item.size,
               raw: item.download_url || rawUrl(item.path) };
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  function listImages(force) {
    var url = apiPath('/contents/' + encodePath(IMAGE_DIR) + '?ref=' + encodeURIComponent(BRANCH));
    if (force) clearListCache();
    // 读取公开仓库始终匿名：首屏不等 WebCrypto 解密（提速），也避免把本机令牌
    // 附到列表请求上。公开 API 匿名配额足够图库浏览使用。
    return cachedFetch(url, null, true, false).then(function (data) {
      if (!Array.isArray(data)) return [];
      var files = data.filter(function (item) {
        return item.type === 'file' && IMAGE_EXT.test(item.name);
      }).map(function (item) {
        return { name: item.name, path: item.path, sha: item.sha, size: item.size, raw: item.download_url || rawUrl(item.path) };
      }).sort(function (a, b) { return a.name.localeCompare(b.name); });
      saveListSnapshot(files);
      return files;
    }).catch(function (err) {
      if (err.status === 404) return [];
      throw err;
    });
  }

  // 同步占用集合：批量并发上传时 uniqueName 在写入前就被调用，
  // 若只看 state.files，多个任务会算出同一名字互相覆盖。这里同步占位，杜绝竞态。
  var claimedNames = {};
  function claimName(name) {
    claimedNames[name.toLowerCase()] = 1;
  }
  function uniqueName(name) {
    var dot = name.lastIndexOf('.');
    var base = dot > 0 ? name.slice(0, dot) : name;
    var ext = dot > 0 ? name.slice(dot) : '';
    var exists = function (n) {
      var key = n.toLowerCase();
      return !!claimedNames[key] || state.files.some(function (f) { return f.name.toLowerCase() === key; });
    };
    var chosen = name;
    if (exists(chosen)) {
      var i = 2;
      while (exists(base + '-' + i + ext)) i++;
      chosen = base + '-' + i + ext;
    }
    claimName(chosen);
    return chosen;
  }

  function dataUrlToBase64(dataUrl) {
    // 必须是标准 data:image/...;base64 形式，拒绝 data:text/html 等伪装载荷。
    if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(String(dataUrl || ''))) {
      throw new Error('文件内容格式无效（非图片 data URL）');
    }
    var comma = String(dataUrl || '').indexOf(',');
    var base64 = comma === -1 ? '' : String(dataUrl).slice(comma + 1);
    if (!base64) throw new Error('生成的文件内容为空');
    // base64 规范性校验：解码后再编码必须与原文一致，畸形/夹带内容直接拒绝。
    try { if (btoa(atob(base64)) !== base64) throw new Error('bad'); }
    catch (e) { throw new Error('文件内容编码无效，已拒绝上传'); }
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

  // 选中转换格式时提前把编码组件准备好，真正点上传时不再等待下载/编译。
  function preloadFormat(v) {
    if (v === 'avif') { import(AVIF_MODULE).catch(function () {}); }
    else if (v === 'svg') { loadScript(VECTORIZE_LIB).catch(function () {}); }
  }

  // SRI：动态注入的第三方解码/描摹脚本必须匹配随站点发布的哈希，
  // 防止 CDN 或中间人替换脚本后在同源域内执行任意代码。哈希随文件一起发布。
  var SRI = {
    'UTIF.js': 'sha384-RyBmXHdfZ/Uon+ud+/AqSyWpUWnKYt2tkRG/P4gWoRUGDU+qIAV3tGBPNlYTBZEF',
    'imagetracer_v1.2.6.js': 'sha384-YcOTH4/N9eULF5JC2kvcrQ7ZDfV1VOCErlPHqmUk77bzeZN9vJbYsi2gM8bJHgWc'
  };
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-src="' + src + '"]');
      if (existing && existing.dataset.loaded === '1') return resolve();
      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.src = src;
      var integrity = SRI[src.split('/').pop()];
      if (integrity) script.integrity = integrity; // 同源脚本，浏览器按 SRI 校验字节
      script.onload = function () { script.dataset.loaded = '1'; resolve(); };
      script.onerror = function () {
        script.remove();
        reject(new Error('转换组件加载失败或完整性校验未通过：' + src));
      };
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
        var svg = sanitizeSvg(ImageTracer.imagedataToSVG(imageData, options));
        // ImageTracer 返回 UTF-8 字符串，需先转为UTF-8字节再 base64，否则中文/符号会损坏。
        var utf8 = unescape(encodeURIComponent(svg));
        return btoa(utf8);
      });
    });
  }

  // SVG 在 Pages 同源域内可直接渲染，必须在落地前清除脚本/事件/外部实体。
  // 解析式清洗：逐个 <...> 标签整体处理，只重建白名单标签 + 白名单属性。
  // 关键防御——任何无法解析/畸形/危险的标签都直接让整份 SVG 作废（fail-closed），
  // 绝不让 <g/onload=...> 这类"斜杠粘在标签名上"的畸形标记泄漏到 DOM 被二次解析。
  var SVG_SAFE_TAGS = /^(svg|g|path|circle|rect|line|polyline|polygon|ellipse|defs|title|desc|metadata|linearGradient|radialGradient|stop|clipPath|mask|symbol|view)$/i;
  var SVG_DROP_TAGS = /^(script|foreignObject|iframe|object|embed|style|handler|animate|animateMotion|animateTransform|set|discard|audio|video|image|use|a|textPath|cursor|font|font-face|hatch|pattern|filter|fe[a-z]+)$/i;
  var SVG_SAFE_ATTRS = /^(d|x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|width|height|points|transform|viewBox|version|xmlns|xmlns:xlink|preserveAspectRatio|id|fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|fill-opacity|stroke-opacity|opacity|fill-rule|clip-rule|gradientUnits|gradientTransform|spreadMethod|offset|stop-color|stop-opacity|clipPathUnits|maskUnits|maskContentUnits|font-family|font-size|font-style|font-weight|text-anchor|dominant-baseline|paint-order|vector-effect|stroke-dasharray|stroke-dashoffset|stroke-miterlimit|marker|class)$/i;
  function sanitizeSvg(svg) {
    var out = String(svg || '');
    // 先剔除控制字符（含 Unicode 行/段落分隔符），它们常被用来拆断属性名绕过检测。
    out = out.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u2028\u2029\uFFFD]/g, '');
    // 只保留第一个 <svg ...> 到最后一个 </svg> 之间的内容，丢弃 XML 声明/DOCTYPE/实体等前导载荷。
    var first = out.search(/<svg[\s>\/]/i);
    var last = out.search(/<\/svg\s*>/i);
    if (first < 0 || last < 0 || last < first) return '';
    out = out.slice(first, last + 6);
    var result = [];
    var openCount = 0, closeCount = 0;
    var re = /<\/?([A-Za-z][\w:.-]*)([\s\S]*?)(\/?)>/g;
    var m, cursor = 0, rootOpen = 0, rootClose = 0;
    while ((m = re.exec(out))) {
      if (m.index > cursor) {
        // 标签之间的文本：剥离注释/CDATA 外壳后转义，避免任何标记在二次解析时被激活。
        var text = out.slice(cursor, m.index)
          .replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[|\]\]>/g, '');
        if (/[<>]/i.test(text)) return '';
        result.push(escapeSvgText(text));
      }
      cursor = re.lastIndex;
      var isClose = m[0].charAt(1) === '/';
      var tag = m[1], rest = m[2], selfClose = m[3] === '/';
      // 危险元素一律作废（含其内部文本，由文本转义兜底）。
      if (SVG_DROP_TAGS.test(tag)) return '';
      if (!SVG_SAFE_TAGS.test(tag)) return '';
      // 关键：rest 必须只由「空白 + 合规属性」组成。
      // 任何紧粘的单斜杠（<g/onload=>）、双斜杠、孤立引号/尖括号都会让正则匹配失败 -> 整份作废。
      if (!isClose && !isSafeAttrChunk(rest)) return '';
      if (isClose) {
        closeCount++;
        if (/^svg$/i.test(tag)) rootClose++;
        result.push('</' + tag + '>');
      } else {
        openCount++;
        if (/^svg$/i.test(tag) && !selfClose) rootOpen++;
        result.push('<' + tag + (isClose ? '' : rebuildAttrs(rest)) + (selfClose ? '/>' : '>'));
      }
    }
    if (cursor < out.length) {
      var tail = out.slice(cursor).replace(/<!--[\s\S]*?-->/g, '');
      if (/[<>]/i.test(tail)) return '';
      result.push(escapeSvgText(tail));
    }
    // 必须恰好一个 <svg> 根，且开闭数量一致，杜绝嵌套/断裂结构。
    if (rootOpen !== 1 || rootClose !== 1 || !/^<svg[\s>]/.test(result[0] || '')) return '';
    if (/<\?|<!DOCTYPE|<!ENTITY/i.test(out)) return ''; // 处理指令/实体声明一律作废
    var clean = result.join('');
    // 二次兜底扫描：只要还有事件属性/伪协议/危险标签，一律作废。
    if (/\son[a-z]+\s*=/i.test(clean) || /(?:javascript|data|file)\s*:/i.test(clean) ||
        /<\/?(?:script|foreignObject|iframe|object|embed|handler|style|animate|set)\b/i.test(clean)) return '';
    return clean;
  }
  function escapeSvgText(t) {
    return String(t).replace(/&(?![A-Za-z#][A-Za-z0-9#]*;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // rest 合法性校验：只接受「属性名 = '值' 或 "值"」且名字/值都在白名单内。
  // 尖括号、伪协议、未知实体、控字符一律拒绝，配合解析式清洗杜绝畸形标签复活。
  function isSafeAttrChunk(rest) {
    var r = String(rest || '').replace(/\/>$/, '');
    var re = /\s+([A-Za-z][\w:.-]*)\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)')/g;
    var m, consumed = 0;
    while ((m = re.exec(r))) {
      if (m.index !== consumed) return false; // 有任何不可解析的残渣 => 作废
      var name = m[1], val = m[2] !== undefined ? m[2] : m[3];
      if (!SVG_SAFE_ATTRS.test(name)) return false;
      // 斜杠在 xmlns URL 中合法；这里只拒绝尖括号、伪协议、坏实体与事件属性。
      if (/[<>]/i.test(val) || /\b(?:javascript|data|file)\s*:/i.test(val) ||
          /&(?![A-Za-z#][A-Za-z0-9#]*;)/.test(val) || /\son[a-z]+\s*=/i.test(val)) return false;
      consumed = re.lastIndex;
    }
    return consumed === r.length;
  }

  function rebuildAttrs(rest) {
    var r = String(rest || '').replace(/\/>$/, '');
    var re = /\s+([A-Za-z][\w:.-]*)\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)')/g;
    var m, out = '';
    while ((m = re.exec(r))) {
      var name = m[1], val = m[2] !== undefined ? m[2] : m[3];
      out += ' ' + name + '="' + val + '"';
    }
    return out;
  }

  // 上传的 SVG/SVGZ 无论走哪种格式选项，落地前都做一次 XSS 清洗。
  // 输入是标准 base64（可能带 data: 前缀由调用方去掉）；输出为清洗后的 base64。
  function sanitizeSvgUpload(base64, ext) {
    try {
      if (ext === 'svg') {
        var text = bytesToStr(unb64url(base64.replace(/\+/g, '-').replace(/\//g, '_')));
        var clean = sanitizeSvg(text);
        // 清洗后为空说明载荷危险/畸形，直接拒绝写入而不是上传空图。
        if (!clean) throw new Error('SVG 含不安全内容，已拒绝上传');
        return btoa(unescape(encodeURIComponent(clean)));
      }
    } catch (e) { /* 清洗失败则继续走原魔数校验，交由服务端再校验一次 */ }
    return base64;
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
      var ext = INPUT_EXT_SET[origExt] ? origExt : 'png';
      // SVG 是唯一会在 Pages 同源域内以标记语言执行的格式，落地前强制清洗。
      if (ext === 'svg') base64 = sanitizeSvgUpload(base64, ext);
      return { base64: base64, ext: ext, bytes: file.size };
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

  // 内容真实性校验：按扩展名检查文件头，拒绝伪装成图片的 HTML/JS/可执行文件。
  // 已知格式必须匹配魔数；未知/专有格式至少不能有 HTML/脚本/PE 头。
  function verifyMagic(content, ext) {
    var bytes;
    try { bytes = unb64url(content.replace(/\+/g, '-').replace(/\//g, '_')); }
    catch (e) { return true; } // 解码异常交给服务端校验，这里不误杀
    var ascii = function (a, b) { return String.fromCharCode.apply(null, bytes.subarray(a, b)); };
    var magic = {
      png:  function () { return bytes[0] === 0x89 && ascii(1, 4) === 'PNG'; },
      gif:  function () { return ascii(0, 3) === 'GIF'; },
      webp: function () { return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'; },
      avif: function () { return ascii(4, 8) === 'ftyp' && /^(avif|avis|mif1|msf1)$/.test(ascii(8, 12)); },
      jpg:  function () { return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff; },
      jpeg: function () { return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff; },
      bmp:  function () { return ascii(0, 2) === 'BM'; },
      ico:  function () { return bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0; },
      tif:  function () { return (ascii(0, 2) === 'II' && bytes[2] === 42) || (ascii(0, 2) === 'MM' && bytes[3] === 42); },
      tiff: function () { return (ascii(0, 2) === 'II' && bytes[2] === 42) || (ascii(0, 2) === 'MM' && bytes[3] === 42); }
    };
    // SVG 是唯一会在 Pages 同源域内当作标记语言解析的格式：除清洗外，再做一次结构复核，
    // 确保清洗后是单一 <svg> 根、且不含任何可执行的动态元素/事件/伪协议。
    if (ext === 'svgz') {
      // SVGZ 必须是 gzip 流（1f 8b），否则拒绝，避免伪装。
      if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return false;
    }
    if (ext === 'svg' || ext === 'svgz') {
      try {
        var text = bytesToStr(bytes);
        var clean = sanitizeSvg(text);
        if (!clean || !/<svg\b/i.test(clean)) return false;
        if (/<\s*\/?\s*(script|foreignObject|iframe|object|embed|handler|animate|animateMotion|set)\b/i.test(clean)) return false;
        if (/\son[a-z]+\s*=/i.test(clean) || /(?:javascript|data|file)\s*:/i.test(clean)) return false;
      } catch (e) { return false; }
      return true;
    }
    if (magic[ext]) return magic[ext]();
    // 未知格式：拒绝明显的脚本/HTML/PE/ELF 头
    var head = ascii(0, Math.min(64, bytes.length)).toLowerCase();
    return !(/<script|<!doctype|<html|<\?php|^mz|^\x7felf/.test(head));
  }

  // 滥用防护：写入次数写入 localStorage，刷新页面也无法绕过滑动窗口限流。
  var WRITE_LOG_KEY = 'pushpic.writeLog';
  function readWriteLog() {
    try {
      var v = JSON.parse(localStorage.getItem(WRITE_LOG_KEY) || '[]');
      if (!Array.isArray(v)) return [];
      // 迁移旧格式：纯数字时间戳 -> { t, id }。
      return v.map(function (e) {
        return (e && typeof e === 'object' && typeof e.t === 'number')
          ? e : { t: Number(e) || 0, id: '' };
      }).filter(function (e) { return e.t > 0; });
    } catch (e) { return []; }
  }
  // 配额耗尽时给出带重置时间的友好提示，避免把 403 误判为权限问题。
  function rateLimitHint(err, fallback) {
    var reset = Number(err && err.reset);
    if (reset && isFinite(reset)) {
      var wait = Math.max(0, Math.ceil((reset * 1000 - Date.now()) / 1000));
      return 'GitHub API 配额已用尽，请在 ' + wait + ' 秒后重试。';
    }
    return fallback;
  }

  function takeWriteSlot() {
    var cfg = window.PUSHPIC_CONFIG || {};
    var max = Math.max(1, Math.min(100, Number(cfg.writeBudget) || 20));
    var win = Math.max(1000, Math.min(24 * 3600 * 1000, Number(cfg.writeWindowMs) || 60000));
    var now = Date.now();
    var log = readWriteLog().filter(function (e) { return now - e.t < win; });
    if (log.length >= max) return null;
    // 时间戳即票据 id：写入失败时按 id 退还，避免失败请求也消耗配额。
    var ticket = now + '-' + Math.random().toString(36).slice(2, 8);
    log.push({ t: now, id: ticket });
    try { localStorage.setItem(WRITE_LOG_KEY, JSON.stringify(log)); } catch (e) {}
    return ticket;
  }
  function releaseWriteSlot(ticket) {
    if (!ticket) return;
    try {
      var log = readWriteLog().filter(function (e) { return !(e && e.id === ticket); });
      localStorage.setItem(WRITE_LOG_KEY, JSON.stringify(log));
    } catch (e) {}
  }

  // 写入走浏览器直传 GitHub Contents API：支持大文件（<= 50MB），绕开 dispatch 的 48KB 上限。
  // 令牌默认来自内置配置（访客零配置）；本机覆盖令牌用 AES-GCM 加密保存。
  function writeContents(path, content, sha) {
    return tokenReady.then(function () {
      if (!DISPATCH_TOKEN) {
        throw new Error('上传需要令牌：请点右上角「令牌」填入自己的 GitHub 令牌（仅存本机，不随站点公开）。');
      }
      var slot = takeWriteSlot();
      if (!slot) {
        throw new Error('操作过于频繁，请在 ' + Math.ceil((window.PUSHPIC_CONFIG.writeWindowMs || 60000) / 1000) + ' 秒后再试（本地限流）。');
      }
      var url = apiPath('/contents/' + encodePath(path));
      var body = { message: 'Upload ' + path.split('/').pop() + ' via PushPic',
                   content: content, branch: BRANCH };
      if (sha) body.sha = sha;
      return apiFetch(url, {
        method: 'PUT',
        headers: jsonHeaders(true),
        body: JSON.stringify(body)
      }, 2, true) // 写入请求不盲目重试，避免重复提交
        .catch(function (err) {
          // 同名文件已被他人更新导致 sha 过期：按最新 sha 重试一次，避免上传莫名失败。
          if (err.status !== 409 && err.status !== 422) throw err;
          return cachedFetch(apiPath('/contents/' + encodePath(path) + '?ref=' + encodeURIComponent(BRANCH)), null, false).then(function (fresh) {
            var latest = fresh && fresh.sha;
            if (!latest || latest === sha) throw err;
            body.sha = latest;
            return apiFetch(url, {
              method: 'PUT',
              headers: jsonHeaders(true),
              body: JSON.stringify(body)
            }, 2, true);
          }).catch(function (e) { if (e === err) throw err; throw e; });
        })
        .catch(function (err) {
          // 写入未成功（鉴权失败 / sha 重试也失败 / 网络错误）就退还配额，
          // 只有真正写进仓库的操作才计入限流。
          releaseWriteSlot(slot);
          throw err;
        });
    });
  }

  function uploadFile(file, name, content, bytes) {
    if (typeof content !== 'string' || !content.length) {
      return Promise.reject(new Error('文件 ' + name + ' 未生成有效内容，已取消上传'));
    }
    // 同名覆盖需要 sha（更新文件必须带）；公开 API 读取，无需令牌。
    var path = IMAGE_DIR + '/' + name;
    var known = findFile(path);
    var shaPromise = known && known.sha ? Promise.resolve(known.sha) : (function () {
      return cachedFetch(apiPath('/contents/' + encodePath(path) + '?ref=' + encodeURIComponent(BRANCH)), null, false).then(function (existing) {
        return (existing && existing.sha ? existing.sha : '');
      }).catch(function () { return ''; });
    })();
    return shaPromise.then(function (sha) {
      var ext = (name.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();
      if (!verifyMagic(content, ext)) {
        throw new Error('文件 ' + name + ' 的内容与扩展名不符，已拒绝上传（疑似伪装文件）');
      }
      return writeContents(path, content, sha).then(function () {
        return {
          name: name,
          path: path,
          sha: '',
          size: bytes != null ? bytes : file.size,
          raw: rawUrl(path)
        };
      });
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

  // 图库节点缓存：搜索/分页/收藏切换时复用已渲染卡片，不重建 DOM、不重新解码图片。
  var tileCache = {};
  function pruneTileCache(keep) {
    Object.keys(tileCache).forEach(function (p) { if (!keep || !keep[p]) delete tileCache[p]; });
  }
  function syncTile(tile, file) {
    var f = findFile(file.path) || file;
    var star = tile.querySelector('.tile-star');
    if (star) {
      var fav = !!favorites[f.path];
      star.classList.toggle('is-fav', fav);
      star.textContent = fav ? '★' : '☆';
      star.title = fav ? '取消收藏' : '收藏';
      star.setAttribute('aria-label', star.title);
    }
    var ready = tile.querySelector('.tile-ready');
    if (ready) {
      ready.classList.toggle('ready', !!pagesReady[f.path]);
      ready.classList.toggle('pending', !pagesReady[f.path]);
      ready.textContent = pagesReady[f.path] ? '已上线' : '部署中';
    }
    tile._url = smartUrl(f);
  }
  function createTile(file) {
    var path = file.path;
    var tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.path = path;
    var media = document.createElement('div');
    media.className = 'tile-media';
    var star = document.createElement('button');
    star.type = 'button';
    star.className = 'tile-star';
    star.addEventListener('click', function (e) { e.stopPropagation(); toggleFavorite(path); });
    var img = document.createElement('img');
    img.className = 'tile-thumb';
    img.referrerPolicy = 'no-referrer';
    // 固定宽高比占位，图片到位前不塌陷，消除布局抖动（CLS）。
    img.width = 320; img.height = 200;
    img.src = file.raw || rawUrl(path);
    img.alt = file.name;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', function () {
      // 最多在两个源之间切换一次，避免坏图反复重试造成请求风暴。
      var tries = parseInt(img.dataset.tries || '0', 10);
      if (tries >= 2) return;
      img.dataset.tries = String(tries + 1);
      var f = findFile(path) || file;
      var fallback = img.src.indexOf('raw.githubusercontent.com') !== -1
        ? displayUrl(path) : (f.raw || rawUrl(path));
      if (img.dataset.fallback !== fallback) { img.dataset.fallback = fallback; img.src = fallback; }
    });
    img.addEventListener('click', function () { openPreview(findFile(path) || file); });
    var meta = document.createElement('div');
    meta.className = 'tile-meta';
    var name = document.createElement('span');
    name.className = 'tile-name';
    name.textContent = file.name;
    name.title = file.name;
    var sub = document.createElement('div');
    sub.className = 'tile-sub';
    var ready = document.createElement('span');
    ready.className = 'tile-ready pending';
    ready.textContent = '部署中';
    sub.appendChild(ready);
    sub.appendChild(document.createTextNode(' · ' + formatSize(file.size)));
    meta.appendChild(name);
    meta.appendChild(sub);
    var actions = document.createElement('div');
    actions.className = 'tile-actions';
    var copy = document.createElement('button');
    copy.className = 'btn btn-primary'; copy.type = 'button'; copy.textContent = '复制链接';
    copy.addEventListener('click', function () { copyText(smartUrl(findFile(path) || file), copy); });
    var md = document.createElement('button');
    md.className = 'btn btn-ghost'; md.type = 'button'; md.textContent = 'MD';
    md.title = '复制 Markdown 代码';
    md.addEventListener('click', function () {
      var f = findFile(path) || file;
      copyText(markdownImage(f.name, smartUrl(f)), md);
    });
    var dl = document.createElement('button');
    dl.className = 'btn btn-ghost'; dl.type = 'button'; dl.textContent = '下载';
    dl.addEventListener('click', function () { downloadFile(findFile(path) || file); });
    var del = document.createElement('button');
    del.className = 'btn btn-ghost btn-wide'; del.type = 'button'; del.textContent = '删除';
    del.addEventListener('click', function () { deleteFile(findFile(path) || file, del); });
    actions.appendChild(copy); actions.appendChild(md); actions.appendChild(dl); actions.appendChild(del);
    media.appendChild(star); media.appendChild(img);
    tile.appendChild(media); tile.appendChild(meta); tile.appendChild(actions);
    return tile;
  }

  var renderFrame = 0;
  function scheduleRender() {
    if (renderFrame) return;
    var raf = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); };
    renderFrame = raf(function () { renderFrame = 0; renderGallery(); });
  }

  function renderGallery() {
    var files = filteredFiles();
    state.viewFiles = files;
    var allPages = state.pageSize === 'all';
    var totalPages = allPages ? 1 : Math.max(1, Math.ceil(files.length / state.pageSize));
    state.page = Math.min(state.page, totalPages);
    var start = allPages ? 0 : (state.page - 1) * state.pageSize;
    var pageFiles = allPages ? files : files.slice(start, start + state.pageSize);
    var frag = document.createDocumentFragment();
    if (!pageFiles.length) {
      var p = document.createElement('p');
      p.className = 'empty';
      p.textContent = state.favOnly
        ? '还没有收藏的图片，点卡片右上角的 ☆ 收藏吧。'
        : (state.query.trim()
          ? '没有匹配「' + state.query.trim() + '」的图片。'
          : (state.files.length ? '没有匹配的文件。' : '仓库中还没有图片，上传一张试试吧。'));
      frag.appendChild(p);
    }
    pageFiles.forEach(function (file) {
      var tile = tileCache[file.path];
      if (!tile) { tile = createTile(file); tileCache[file.path] = tile; }
      syncTile(tile, file);
      frag.appendChild(tile);
    });
    if (el.gallery.replaceChildren) el.gallery.replaceChildren(frag);
    else { el.gallery.innerHTML = ''; el.gallery.appendChild(frag); }
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

  function escapeMarkdownLabel(s) {
    return String(s || '').replace(/([\\\[\]])/g, '\\$1').replace(/\r?\n/g, ' ');
  }

  function markdownUrl(u) {
    return String(u || '').replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
  }

  function markdownImage(name, url) {
    return '![' + escapeMarkdownLabel(name) + '](' + markdownUrl(url) + ')';
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
    el.previewImg.referrerPolicy = 'no-referrer';
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
      ['Markdown', markdownImage(file.name, smart), '']
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
    // 删除走 Contents API；sha 从 state 或公开 API 获取。
    var shaReady = file.sha ? Promise.resolve(file.sha)
      : cachedFetch(apiPath('/contents/' + encodePath(file.path) + '?ref=' + encodeURIComponent(BRANCH)), null, false).then(function (d) { return d.sha; });
    shaReady.then(function (sha) {
      if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('无法获取文件 sha');
      return tokenReady.then(function () {
        if (!DISPATCH_TOKEN) throw new Error('删除需要令牌：请点右上角「令牌」填入自己的 GitHub 令牌（仅存本机）。');
        var slot = takeWriteSlot();
        if (!slot) throw new Error('操作过于频繁，请稍后再试（本地限流）。');
        var url = apiPath('/contents/' + encodePath(file.path));
        return apiFetch(url, {
          method: 'DELETE',
          headers: jsonHeaders(true),
          body: JSON.stringify({ message: 'Delete ' + file.name + ' via PushPic',
                                 sha: sha, branch: BRANCH })
        }, 2, true).catch(function (err) { releaseWriteSlot(slot); throw err; });
      });
    }).then(function () {
      state.files = state.files.filter(function (f) { return f.path !== file.path; });
      delete tileCache[file.path];
      renderGallery();
      setStatus('已删除 ' + file.name, 'ok');
      clearListCache();
      return refresh(true);
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
    // 缓存优先：有 ETag 缓存时先用它渲染一帧，API 返回后再用权威数据覆盖。
    if (!state.files.length && !force) {
      var cached = cachedImageList();
      if (cached && cached.length) { state.files = cached; scheduleRender(); }
    }
    // 手动点击时 800ms 内的重复触发直接忽略，防止连点打爆 API。
    // 但"上次失败"必须允许立即重试——否则用户点重试没反应，只能干等。
    var lastFailed = btn.classList.contains('is-error');
    if (force && !lastFailed && now - state.lastRefresh < 800) return state.refreshPromise || Promise.resolve(state.files);
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
      var keep = files.reduce(function (m, f) { m[f.path] = 1; return m; }, {});
      pruneTileCache(keep);
      scheduleRender();
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
    var base = (file.name.replace(/\.[^.]+$/, '') || 'image');
    // 写入仓库的文件名只允许安全字符，防路径穿越 / 脚本名 / 控制字符。
    base = base.replace(/[^A-Za-z0-9._()\- ]/g, '_').replace(/^\.+/, '').trim();
    // Windows 保留设备名（含扩展名）在部分系统/工具上会被特殊解释，统一加前缀规避。
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(base)) base = 'img-' + base;
    // 尾部的句点和空格在 Windows 与部分 CDN 路由上会被剥掉，导致外链 404，先去掉。
    base = base.replace(/[. ]+$/, '');
    // 限制长度，避免超长文件名在 Pages / 文件系统上截断产生不一致链接。
    return base.slice(0, 120) || 'image';
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

  var uploading = false;
  function uploadFiles(files) {
    if (uploading) { setStatus('还有上传任务在进行中，请稍候。', 'err'); return; }
    var format = el.formatSelect.value;
    var list = Array.prototype.slice.call(files).filter(function (f) { return f.type.indexOf('image/') === 0; });
    if (!list.length) { setStatus('未选择图片文件。', 'err'); return; }
    uploading = true;
    if (list.length > MAX_FILES) {
      setStatus('一次最多上传 ' + MAX_FILES + ' 张，已截取前 ' + MAX_FILES + ' 张。', 'err');
      list = list.slice(0, MAX_FILES);
    }
    var oversized = list.filter(function (f) { return f.size > MAX_SIZE; });
    if (oversized.length) {
      setStatus('以下文件超过 50 MB，已跳过：' + oversized.map(function (f) { return f.name; }).join('、'), 'err');
      list = list.filter(function (f) { return f.size <= MAX_SIZE; });
    }
    if (!list.length) { uploading = false; return; }
    var dedupNote = '';
    // 内容相同的文件只传一份，重复的写入名由 uniqueName 处理（内容不同仍会另存）。
    return mapLimit(list, 8, contentDigest).then(function (digests) {
      // 可选：内容相同但文件名不同也合并（按 SHA-256）。默认按「文件名+内容」判定重复，
      // 保持"上传两张同内容不同名得到两个文件"的直觉；开启后省空间也省写入配额。
      var mergeByName = !POLICY.dedupByContent;
      var uploadList = (function () {
        var seen2 = {}, out = [];
        for (var i = 0; i < list.length; i++) {
          var d = digests[i], file = list[i];
          if (!d) { out.push(file); continue; }
          var key = mergeByName ? (file.name.toLowerCase() + '|' + d) : d;
          if (seen2[key]) continue;
          seen2[key] = 1; out.push(file);
        }
        return out;
      })();
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
          scheduleRender();
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
      // 失败的文件释放名字占位，下次重试可用原名；成功的已在 state.files 中。
      results.forEach(function (r, i) {
        if (r && r.error) {
          var n = list[i].name;
          var dot = n.lastIndexOf('.');
          var base = dot > 0 ? n.slice(0, dot) : n;
          var ext = dot > 0 ? n.slice(dot) : '';
          // uniqueName 可能加了后缀，这里清理所有以该 base 开头的占位。
          Object.keys(claimedNames).forEach(function (k) {
            if (k === n.toLowerCase() || k.indexOf(base.toLowerCase() + '-') === 0) delete claimedNames[k];
          });
        }
      });
      var msg = '上传完成，成功 ' + succeeded + ' 张。raw 链接已可用，Pages 链接上线后会自动标记。';
      if (kept) msg += ' 其中 ' + kept + ' 张因转换失败或反而更大已保留原格式。';
      if (dedupNote) msg = dedupNote + ' ' + msg;
      if (failed) msg += ' 失败 ' + failed + ' 张：' + failNames.join('；');
      setStatus(msg, failed ? 'err' : 'ok');
      // 每张上传成功时已写入 state.files，不必再打一次完整列表 API。
      // 只清缓存，下次用户主动刷新时自然对齐仓库真实状态。
      clearListCache();
      pruneTileCache();
      uploading = false;
    }, function (err) {
      uploading = false;
      setStatus('上传过程出错：' + (err && err.message ? err.message : String(err)), 'err');
    });
    }
  }

  function init() {
    ['repoBadge', 'pagesBadge', 'dropzone', 'fileInput', 'progressWrap', 'progressBar', 'progressText',
     'status', 'gallery', 'searchInput', 'searchClear', 'resultCount', 'refreshBtn', 'refreshMeta', 'pagination', 'prevBtn', 'nextBtn', 'pageInfo',
     'previewModal', 'previewName', 'previewImg', 'previewLinks', 'formatSelect', 'formatHint',
     'favFilterBtn', 'pageSizeSelect', 'tokenBtn'].forEach(function (id) { el[id] = $(id); });

    var savedFormat = getConvertFormat();
    el.formatSelect.value = savedFormat;
    if (savedFormat !== 'keep') preloadFormat(savedFormat);
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
      preloadFormat(el.formatSelect.value);
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

    // 页面从后台切回且离开超过 60 秒时静默刷新图库，避免展示过期列表；
    // 短时切换不触发，避免频繁打 API。
    var hiddenAt = 0;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 60000) {
        hiddenAt = 0;
        refresh(true).catch(function () {});
      }
    });
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

    // 令牌设置：拥有者一次性填入「仅触发 Actions」的低权限令牌，保存在本机，不写入仓库。
    function openTokenDialog() {
      var hint = DISPATCH_TOKEN ? '当前已在本机配置上传令牌。' : '当前未配置上传令牌（只读模式，可浏览和下载图片）。';
      var val = window.prompt(
        hint + '\n\n设置上传令牌（仅用于对 images/ 目录读写）：\n' +
        '• 推荐细粒度令牌：只授权 TechnologySauce/PushPic 一个仓库，权限仅 Contents: read & write\n' +
        '• 并设置一个较短的过期时间（如 7 天）\n\n' +
        '安全：本站不含也不公开任何令牌。你填入的令牌用 AES-256-GCM 加密，\n' +
        '只保存在你自己的浏览器（设备密钥随标签关闭失效），不上传服务器、不进仓库代码。\n' +
        '请勿使用 public_repo 等大范围权限的经典 PAT——那会授予你全部公开仓库的写权限。\n' +
        '留空可清除本机令牌。', '');
      if (val === null) return;
      saveDispatchToken(val).then(function () {
        syncTokenBtn();
        setStatus(val.trim() ? '已加密保存上传令牌（仅本机，不随站点公开）。' : '已清除上传令牌，回到只读模式。', val.trim() ? 'ok' : '');
      }).catch(function (err) {
        setStatus('保存失败：' + err.message, 'err');
      });
    }
    if (el.tokenBtn) el.tokenBtn.addEventListener('click', openTokenDialog);

    tokenReady.then(syncTokenBtn);
    refresh(); // 与令牌准备并行，首屏不等 WebCrypto 解密
  }

  var boot = function () {
    loadReadyState();
    init();
    if (location.search.indexOf('test=1') !== -1) {
      window.__pushpicTest = {
        convertFile: convertFile, refresh: refresh, state: state, getFormat: getConvertFormat,
        smartUrl: smartUrl, probeImage: probeImage, probeExisting: probeExisting,
        displayUrl: displayUrl, rawUrl: rawUrl, pagesReady: pagesReady,
        openPreview: openPreview, renderGallery: renderGallery, el: el,
        filteredFiles: filteredFiles, contentDigest: contentDigest, filteredCount: function () { return filteredFiles().length; },
        toggleFavorite: toggleFavorite, favorites: favorites, downloadFile: downloadFile,
        sanitizeSvg: sanitizeSvg, tokenReady: tokenReady, saveDispatchToken: saveDispatchToken
      };
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
