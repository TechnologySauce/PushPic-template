/* PushPic 运行时配置（部署时生成）。
 *
 * PUSHPIC_UPLOAD_TOKEN 是可选的「预置上传令牌」。大多数情况下留空即可——
 * 部署者在页面右上角「令牌」按钮里一次性填入并加密保存在本机浏览器即可上传。
 * 若确实要预置（例如私有部署），填入一枚仅含本仓库 Contents 读写权限、
 * 且设置了过期时间的令牌；任何写进静态文件的令牌都是公开的，请注意风险。
 */
window.PUSHPIC_DISPATCH_TOKEN = window.PUSHPIC_DISPATCH_TOKEN || '';
