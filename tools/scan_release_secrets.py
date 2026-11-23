#!/usr/bin/env python3
"""扫描 GitHub Release（标题/正文/附件）中是否出现明文或 base64 可还原的令牌。

用法（无需第三方依赖，匿名即可读取公开仓库）：
    python3 tools/scan_release_secrets.py                       # 默认扫主仓 + 模板仓
    python3 tools/scan_release_secrets.py owner/repo owner/repo2

退出码：0=干净，1=发现敏感信息。
"""
import base64
import json
import re
import sys
import urllib.request

TOKEN_RE = re.compile(r'gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255}')
B64_RE = re.compile(r'[A-Za-z0-9+/]{40,}={0,2}')
DEFAULT_REPOS = ['TechnologySauce/PushPic', 'TechnologySauce/PushPic-template']
UA = {'User-Agent': 'PushPic-Secret-Scan', 'Accept': 'application/vnd.github+json'}


def get(url, raw=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:
        data = r.read()
    return data if raw else json.loads(data)


def hits(text):
    out = []
    for m in TOKEN_RE.findall(text or ''):
        out.append('明文令牌 ' + m[:12] + '…')
    for m in B64_RE.findall(text or ''):
        try:
            decoded = base64.b64decode(m, validate=True).decode('utf-8', 'ignore')
        except Exception:
            continue
        for x in TOKEN_RE.findall(decoded):
            out.append('base64 可还原令牌 ' + x[:12] + '…')
    return out


def scan(repo):
    releases = get('https://api.github.com/repos/%s/releases' % repo)
    issues = 0
    for rel in releases:
        places = [('标题', rel.get('name') or ''), ('正文', rel.get('body') or '')]
        for asset in rel.get('assets', []):
            try:
                blob = get(asset['browser_download_url'], raw=True).decode('utf-8', 'ignore')
                places.append(('附件 ' + asset['name'], blob))
            except Exception as exc:
                print('  附件读取失败 %s: %s' % (asset['name'], exc))
                issues += 1
        for where, text in places:
            found = hits(text)
            if found:
                issues += 1
                print('  [命中] %s %s %s: %s' % (repo, rel['tag_name'], where, '; '.join(found)))
    print('%s: 扫描 %d 个 Release，%s' % (repo, len(releases), '发现 %d 处问题' % issues if issues else '未发现敏感信息'))
    return issues


if __name__ == '__main__':
    repos = sys.argv[1:] or DEFAULT_REPOS
    total = sum(scan(repo) for repo in repos)
    print('总计：%s' % ('发现 %d 处问题' % total if total else '全部干净'))
    sys.exit(1 if total else 0)
