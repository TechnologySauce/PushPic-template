/* PushPic 运行时配置（零令牌暴露）。
 *
 * 安全原则：本文件及整个站点不含任何长期写入凭证（PAT）。
 * 纯静态 GitHub Pages 上，任何放进前端的令牌都等于公开——base64/分片/混淆
 * 只是编码，浏览器里都能还原。因此本项目不再内置令牌：
 *   - 读取：走 GitHub 公开 API，无需令牌。
 *   - 写入：仅在本机由使用者配置令牌，AES-256-GCM 加密存 localStorage，
 *     设备密钥存 sessionStorage（关闭标签即失效），令牌永不进入仓库代码。
 *   - 内置令牌清单为空：从任何域名打开都不会有随站点分发的凭证。
 */
(function () {
  'use strict';
  var CONFIG = {
    // 内置写入令牌清单：永久为空。若部署者确需分发凭证，请改走带鉴权后端 + 短时凭证，
    // 不要把长期 PAT 写回这里（见 README 安全架构）。
    tokenParts: [],
    // 允许加载"可选内置令牌"的域名白名单。因为 tokenParts 为空，当前无任何内置令牌生效。
    allowedHosts: ['technologysauce.github.io', 'localhost', '127.0.0.1'],
    // 站点资源版本：作为图片链接的稳定破缓存参数，发布新版本时改这里即可。
    assetVersion: 'b6e92f70',
    // 同源代理后端 opt-in：默认 false，GitHub Pages 部署直连官方 API。
    sameOriginApi: false,
    // 滥用防护：同一浏览器每 60 秒最多 N 次写入（含页面刷新，见 app.js）。
    writeBudget: 20,
    writeWindowMs: 60 * 1000,
    // 部署探测策略：先用 HEAD 请求确认 Pages 是否生效，只有 HEAD 不可用才回退 <img>。
    headProbe: true,
    probeTimeoutMs: 6000,
    // 文件名去重策略：内容相同但文件名不同的图片是否合并（按内容 SHA-256）。
    dedupByContent: false,
    // 已上线状态会话缓存的 TTL（毫秒），10 分钟内翻页/刷新不重复探测。
    readyTtlMs: 10 * 60 * 1000,
    // 图片库列表的会话缓存 TTL（毫秒）：重开页面先渲染缓存再对齐 API，首屏更快。
    listCacheTtlMs: 3 * 60 * 1000,
    // 视口内部署状态探测的最大并发数（1-16），默认 6。
    probeConcurrency: 6,
    // 图库列表请求失败时，是否回退到会话快照以便离线查看（默认开启）。
    snapshotFallback: true,
    // 探测失败负缓存 TTL（毫秒）：刚上传未上线的图片短时间内不重复打 HEAD。
    probeMissTtlMs: 4000
  };

  // base64 规范性校验：解码后重新编码必须与原文一致，拒绝隐藏字符/非规范填充。
  function isCanonicalBase64(b64) {
    if (typeof b64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || b64.length % 4) return false;
    try { return btoa(atob(b64)) === b64; } catch (e) { return false; }
  }
  // 令牌格式校验：经典 PAT（ghp_/gho_/ghu_/ghs_/ghr_ + 36 位）或细粒度（github_pat_）。
  function validateToken(t) {
    return typeof t === 'string' &&
      (/^gh[pousr]_[A-Za-z0-9]{36,255}$/.test(t) || /^github_pat_[A-Za-z0-9_]{20,255}$/.test(t));
  }

  var host = (location.hostname || '').toLowerCase();
  var allowed = (CONFIG.allowedHosts || []).some(function (h) {
    return host === h || host === ('www.' + h);
  });

  // 仅当部署者显式填入 tokenParts 且域名被允许时才解码；默认清单为空 => 无内置令牌。
  var token = '';
  if (allowed && (CONFIG.tokenParts || []).length) {
    try {
      var b64 = CONFIG.tokenParts.join('');
      if (!isCanonicalBase64(b64)) throw new Error('non-canonical base64');
      var decoded = decodeURIComponent(Array.prototype.map.call(atob(b64), function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      if (validateToken(decoded)) token = decoded;
    } catch (e) { token = ''; }
  }

  // 冻结配置后再暴露，避免页面脚本意外篡改安全策略。
  Object.freeze(CONFIG.allowedHosts);
  Object.freeze(CONFIG);
  Object.defineProperty(window, 'PUSHPIC_DISPATCH_TOKEN', { value: token, writable: false, configurable: false });
  Object.defineProperty(window, 'PUSHPIC_TOKEN_BLOCKED', { value: true, writable: false, configurable: false });
  Object.defineProperty(window, 'PUSHPIC_CONFIG', { value: CONFIG, writable: false, configurable: false });
})();
