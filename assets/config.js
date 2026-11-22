/* PushPic 运行时配置（部署时生成）。
 *
 * PUSHPIC_DISPATCH_TOKEN 只用于触发仓库的 repository_dispatch 工作流，
 * 不是写入令牌。它无法直接读写仓库文件、无法读取私有数据，泄露后的最坏
 * 情况是有人触发上传请求——而工作流会对文件名/扩展名/大小做严格校验，
 * 并用串行执行 + 并发限制做天然限流。真正的写入由服务端 GITHUB_TOKEN 完成。
 *
 * 强烈建议部署者创建一枚「仅能触发本仓库 Actions」的细粒度令牌替换下方值，
 * 并设置过期时间。详见 README「安全架构」。
 */
window.PUSHPIC_DISPATCH_TOKEN = window.PUSHPIC_DISPATCH_TOKEN || '';
