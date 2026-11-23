#!/usr/bin/env node
/* PushPic 敏感信息审计：扫描工作区、完整 git 历史与 GitHub Releases。
 * 检测明文 PAT、base64 可还原 PAT、历史已知令牌片段。只报告是否命中，绝不打印令牌内容。 */
'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var https = require('https');

var ROOT = path.resolve(__dirname, '..');
var PAT = /gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255}/g;
// 历史曾在 Issue / 前端出现过的片段，只做命中计数，不输出原文。
// 片段在运行时拼接，避免审计脚本自身含有令牌字面量被误报。
var KNOWN_FRAGMENTS = ['XAIL' + 'MBTC', 'G6g0' + 'E', 'BTCx' + 'CpQA'];
var REPOS = ['TechnologySauce/PushPic', 'TechnologySauce/PushPic-template'];
var SKIP_DIRS = { '.git': 1, node_modules: 1, '.DS_Store': 1 };
var TEXT_EXT = /\.(js|css|html|md|yml|yaml|json|py|txt|sh|toml|ini|cfg|xml|svg|gitignore)$/i;

var current = [], history = [];
function hit(where, kind, historic) { (historic ? history : current).push(where + ' :: ' + kind); }

function scanText(where, text, historic) {
  var s = String(text || '');
  var raw = s.match(PAT) || [];
  if (raw.length) hit(where, '明文 PAT x' + raw.length, historic);
  for (var i = 0; i < KNOWN_FRAGMENTS.length; i++) {
    if (s.indexOf(KNOWN_FRAGMENTS[i]) !== -1) hit(where, '历史已知令牌片段', historic);
  }
  var chunks = s.match(/[A-Za-z0-9+/]{36,}={0,2}/g) || [];
  for (var j = 0; j < chunks.length; j++) {
    var decoded;
    try { decoded = Buffer.from(chunks[j], 'base64').toString('utf8'); } catch (e) { continue; }
    if (PAT.test(decoded)) { hit(where, 'base64 可还原 PAT', historic); PAT.lastIndex = 0; }
  }
  PAT.lastIndex = 0;
}

function walk(dir, rel) {
  rel = rel || '';
  fs.readdirSync(dir).forEach(function (name) {
    if (SKIP_DIRS[name]) return;
    var full = path.join(dir, name);
    var r = rel ? rel + '/' + name : name;
    var st = fs.lstatSync(full);
    if (st.isDirectory()) { walk(full, r); return; }
    if (!st.isFile() || !TEXT_EXT.test(name)) return;
    try { scanText('工作区 ' + r, fs.readFileSync(full, 'utf8')); } catch (e) {}
  });
}

function scanHistory() {
  var out;
  try {
    out = cp.execSync('git -C ' + JSON.stringify(ROOT) + ' rev-list --objects --all', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) { return; }
  out.split('\n').forEach(function (line) {
    var parts = line.split(' ');
    var sha = parts[0], name = parts.slice(1).join(' ');
    if (!sha || !name) return;
    var type;
    try { type = cp.execSync('git -C ' + JSON.stringify(ROOT) + ' cat-file -t ' + sha, { encoding: 'utf8' }).trim(); } catch (e) { return; }
    if (type !== 'blob') return;
    var buf;
    try { buf = cp.execSync('git -C ' + JSON.stringify(ROOT) + ' cat-file blob ' + sha, { maxBuffer: 64 * 1024 * 1024 }); } catch (e) { return; }
    scanText('历史 ' + name, buf.toString('utf8'), true);
    // 二进制文件（如旧截图）也按 latin1 扫一遍明文片段。
    for (var i = 0; i < KNOWN_FRAGMENTS.length; i++) {
      if (buf.indexOf(KNOWN_FRAGMENTS[i]) !== -1) hit('历史 ' + name, '二进制内已知令牌片段', true);
    }
  });
}

function getJson(url) {
  return new Promise(function (resolve) {
    https.get(url, { headers: { 'User-Agent': 'pushpic-audit', Accept: 'application/vnd.github+json' } }, function (res) {
      var d = ''; res.on('data', function (c) { d += c; });
      res.on('end', function () { resolve({ code: res.statusCode, body: d }); });
    }).on('error', function () { resolve({ code: 0, body: '' }); });
  });
}

function scanReleases(repo) {
  return getJson('https://api.github.com/repos/' + repo + '/releases?per_page=100').then(function (r) {
    if (r.code !== 200) { console.log('  Releases ' + repo + ': HTTP ' + r.code + '（跳过）'); return; }
    var list;
    try { list = JSON.parse(r.body); } catch (e) { return; }
    console.log('  Releases ' + repo + ': ' + list.length + ' 个版本');
    list.forEach(function (rel) {
      scanText(repo + ' Release ' + rel.tag_name + ' 正文', rel.body);
      (rel.assets || []).forEach(function (a) {
        scanText(repo + ' Release ' + rel.tag_name + ' 附件 ' + a.name, a.name);
      });
    });
  });
}

function main() {
  console.log('PushPic 敏感信息审计\n');
  walk(ROOT, '');
  console.log('  工作区：完成');
  scanHistory();
  console.log('  git 全部历史 blob：完成');
  Promise.all(REPOS.map(scanReleases)).then(function () {
    console.log('\n[当前状态] ' + (current.length ? '发现 ' + current.length + ' 处' : '干净，无任何令牌/敏感片段'));
    current.slice(0, 50).forEach(function (f) { console.log('  - ' + f); });
    console.log('[git 历史] ' + (history.length ? '发现 ' + history.length + ' 处历史残留（早期内置令牌时代，需靠撤销令牌根治）' : '干净'));
    [...new Set(history)].slice(0, 50).forEach(function (f) { console.log('  - ' + f); });
    process.exitCode = current.length ? 1 : 0;
  });
}

main();
