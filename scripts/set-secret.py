#!/usr/bin/env python3
"""用 GitHub Actions Secrets 的公钥把令牌密封加密后写入仓库 Secrets。

加密算法：libsodium sealed box
  - 密钥交换：X25519 (Curve25519 ECDH)
  - 对称加密/认证：XSalsa20-Poly1305 (AEAD)
  - 随机数源：CSPRNG，每次加密都不同

令牌只在运行本脚本的机器内出现，明文不写入仓库、不进 Git 历史。
浏览器端不再持有任何令牌，上传改为调用带鉴权的 Actions 工作流。
"""
import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request

try:
    from nacl.public import PublicKey, SealedBox
except ImportError:
    sys.exit("缺少依赖：pip install pynacl")

API = "https://api.github.com"
UA = "PushPic-secret-setup/1.0"


def api(path, token, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        API + path, data=data, method=method,
        headers={
            "Authorization": "token " + token,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": UA,
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            detail = json.loads(raw) if raw else {}
        except ValueError:
            detail = {"message": raw.decode("utf-8", "replace")}
        return e.code, detail


def main():
    ap = argparse.ArgumentParser(description="用 libsodium 密封盒加密令牌并写入 GitHub Actions Secrets")
    ap.add_argument("--repo", default="TechnologySauce/PushPic", help="owner/repo")
    ap.add_argument("--secret", default="PUSHPIC_TOKEN", help="要写入的 Secret 名称")
    ap.add_argument("--token", default=os.environ.get("GH_TOKEN", ""),
                    help="管理员 PAT（需 repo 权限）；默认读 GH_TOKEN 环境变量")
    ap.add_argument("--value", default=os.environ.get("PUSHPIC_TOKEN_VALUE", ""),
                    help="要加密的写入令牌明文；默认读 PUSHPIC_TOKEN_VALUE 环境变量")
    args = ap.parse_args()

    if not args.token:
        sys.exit("请通过 --token 或 GH_TOKEN 环境变量提供管理员 PAT")
    if not args.value:
        sys.exit("请通过 --value 或 PUSHPIC_TOKEN_VALUE 环境变量提供令牌明文")

    status, key = api("/repos/%s/actions/secrets/public-key" % args.repo, args.token)
    if status != 200 or not key.get("key"):
        sys.exit("获取 Secrets 公钥失败：HTTP %s %s" % (status, key.get("message", "")))

    public_key = PublicKey(base64.b64decode(key["key"]))
    sealed = SealedBox(public_key).encrypt(args.value.encode("utf-8"))
    encrypted_value = base64.b64encode(sealed).decode("ascii")

    status, res = api("/repos/%s/actions/secrets/%s" % (args.repo, args.secret),
                      args.token, method="PUT",
                      body={"encrypted_value": encrypted_value, "key_id": key["key_id"]})
    if status not in (200, 201, 204):
        sys.exit("写入 Secret 失败：HTTP %s %s" % (status, res.get("message", "")))

    print("OK: 已用 libsodium sealed box (X25519 + XSalsa20-Poly1305) 写入 %s 的 Secret %s（HTTP %s）"
          % (args.repo, args.secret, status))
    print("明文令牌未写入仓库，未进入 Git 历史，未出现在任何前端文件。")


if __name__ == "__main__":
    main()
