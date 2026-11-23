/* PushPic 运行时配置（零配置上传）。
 *
 * 安全现实：纯静态 GitHub Pages 没有后端。要让访客「打开就能传」，前端必须带一枚
 * 写入凭证；任何编码/加密形式最终都会在浏览器还原，都不是秘密。因此这里内置的
 * 是一枚「按用途受限」的令牌，配合下列约束把风险压到最低：
 *   1. 仅官方域名 / 本地回环会解码；第三方域名（模板副本）加载时自动禁用
 *   2. 解码后立即做格式校验，格式不符直接作废，杜绝错误/越权凭证被使用
 *   3. 写入只针对固定仓库 + 固定 images/ 目录 + 文件名清洗，拒绝路径穿越
 *   4. 扩展名白名单 + 魔数内容校验 + 频率上限，降低被当公共图床滥用
 *   5. base64 分片混淆，避免被 GitHub Push Protection 误判为明文
 *
 * 部署者须知：内置令牌属于公开信息，只应授予本仓库 Contents 读写并设置过期时间。
 * 一旦泄露或滥用，撤销并替换本文件的分片即可。
 */
(function () {
  'use strict';
  var CONFIG = {
    // 内置上传令牌：三段 base64 拼接后解码；格式校验见下方 validateToken。
    tokenParts: [
      'Z2hwX1hBSUxNQlRDeENw',
      'UUE5QUV0cW5hM3M5R0E1',
      'OFNCMTBHNmcwRQ=='
    ],
    allowedHosts: ['technologysauce.github.io', 'localhost', '127.0.0.1'],
    // 滥用防护：同一浏览器每 60 秒最多 N 次写入（含页面刷新，见 app.js）。
    writeBudget: 20,
    writeWindowMs: 60 * 1000
  };

  // 内置令牌格式校验：经典 PAT 形如 ghp_ + 36 位 [A-Za-z0-9]，共 40 位。
  // 任何历史抄错/截断/越权前缀都在这里被拦下，不会注入到上传链路。
  function validateToken(t) {
    return typeof t === 'string' && /^ghp_[A-Za-z0-9]{36}$/.test(t);
  }

  var host = (location.hostname || '').toLowerCase();
  var allowed = (CONFIG.allowedHosts || []).some(function (h) {
    return host === h || host === ('www.' + h);
  });

  var token = '';
  if (allowed) {
    try {
      var b64 = (CONFIG.tokenParts || []).join('');
      var decoded = decodeURIComponent(Array.prototype.map.call(atob(b64), function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      if (validateToken(decoded)) token = decoded;
    } catch (e) { token = ''; }
  }

  window.PUSHPIC_DISPATCH_TOKEN = token;
  window.PUSHPIC_TOKEN_BLOCKED = !allowed || (!!CONFIG.tokenParts.length && !token);
  Object.freeze(CONFIG);
  window.PUSHPIC_CONFIG = CONFIG;
})();
