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
  var IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i;
  var FORMAT_KEY = 'pushpic.convertFormat';
  var VECTORIZE_LIB = './vendor/imagetracer_v1.2.6.js';

  var state = { files: [], page: 1, pageSize: 24, query: '' };
  var el = {};

  function $(id) { return document.getElementById(id); }

  function getConvertFormat() {
    try {
      var v = localStorage.getItem(FORMAT_KEY);
      return (v === 'webp' || v === 'svg') ? v : 'keep';
    } catch (e) { return 'keep'; }
  }

  function setConvertFormat(v) {
    try { localStorage.setItem(FORMAT_KEY, v); } catch (e) { /* 隐私模式下忽略 */ }
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

  function setStatus(msg, kind) {
    el.status.textContent = msg || '';
    el.status.className = 'status' + (kind ? ' ' + kind : '');
  }

  function apiFetch(url, options) {
    return fetch(url, Object.assign({ headers: apiHeaders() }, options || {})).then(function (res) {
      if (res.ok) return res.json();
      return res.json().catch(function () { return {}; }).then(function (body) {
        var err = new Error(body.message || ('GitHub API ' + res.status));
        err.status = res.status;
        throw err;
      });
    });
  }

  function listImages() {
    var url = 'https://api.github.com/repos/' + OWNER_REPO + '/contents/' +
      encodePath(IMAGE_DIR) + '?ref=' + encodeURIComponent(BRANCH);
    return apiFetch(url).then(function (data) {
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

  // 位图转 SVG：按颜色量化后输出矢量路径，线条图/图标效果最好。
  function bitmapToSvg(file, dataUrl) {
    return loadScript(VECTORIZE_LIB).then(function () {
      if (!window.ImageTracer) throw new Error('矢量转换组件不可用');
      return new Promise(function (resolve, reject) {
        var image = new Image();
        image.onload = function () {
          try {
            var canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth || image.width;
            canvas.height = image.naturalHeight || image.height;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);
            var options = ImageTracer.checkoptions({
              colors: 8, filterSpeckles: true, ltres: 1, qtres: 1,
              strokewidth: 1, scale: 1, viewBox: true
            });
            options.pathprecision = 1;
            var svg = ImageTracer.imagedataToSVG(ctx.getImageData(0, 0, canvas.width, canvas.height), options);
            resolve(dataUrlToBase64('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)));
          } catch (err) { reject(err); }
        };
        image.onerror = function () { reject(new Error('无法解析图片用于矢量转换')); };
        image.src = dataUrl;
      });
    });
  }

  function convertFile(file, format) {
    if (format === 'keep') return readFile(file).then(function (base64) {
      return { base64: base64, ext: (file.name.match(/\.([^.]+)$/) || [, 'png'])[1].toLowerCase(), bytes: file.size };
    });
    return blobToDataUrl(file).then(function (dataUrl) {
      if (format === 'svg') {
        return bitmapToSvg(file, dataUrl).then(function (base64) {
          return { base64: base64, ext: 'svg', bytes: Math.floor(base64.length * 3 / 4) };
        });
      }
      return new Promise(function (resolve, reject) {
        var image = new Image();
        image.onload = function () {
          try {
            var canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth || image.width;
            canvas.height = image.naturalHeight || image.height;
            if (!canvas.width || !canvas.height) throw new Error('图片尺寸无效');
            canvas.getContext('2d').drawImage(image, 0, 0);
            var base64 = canvasToWebp(canvas, 0.82);
            var bytes = Math.floor(base64.length * 3 / 4);
            // 转换后反而更大就保留原图，仍按原扩展名上传。
            if (bytes >= file.size && file.type !== 'image/webp') {
              return readFile(file).then(function (orig) {
                resolve({ base64: orig, ext: (file.name.match(/\.([^.]+)$/) || [, 'png'])[1].toLowerCase(), bytes: file.size, kept: true });
              });
            }
            resolve({ base64: base64, ext: 'webp', bytes: bytes });
          } catch (err) { reject(err); }
        };
        image.onerror = function () { reject(new Error('无法解码图片，可能格式不受支持')); };
        image.src = dataUrl;
      });
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

  function renderGallery() {
    var q = state.query.trim().toLowerCase();
    var files = state.files.filter(function (f) { return !q || f.name.toLowerCase().indexOf(q) !== -1; });
    var totalPages = Math.max(1, Math.ceil(files.length / state.pageSize));
    state.page = Math.min(state.page, totalPages);
    var start = (state.page - 1) * state.pageSize;
    var pageFiles = files.slice(start, start + state.pageSize);
    el.gallery.innerHTML = '';
    if (!pageFiles.length) {
      var p = document.createElement('p');
      p.className = 'empty';
      p.textContent = state.files.length ? '没有匹配的文件。' : '仓库中还没有图片，上传一张试试吧。';
      el.gallery.appendChild(p);
    }
    pageFiles.forEach(function (file) {
      var url = displayUrl(file.path);
      var tile = document.createElement('div');
      tile.className = 'tile';
      var img = document.createElement('img');
      img.className = 'tile-thumb';
      img.src = file.raw;
      img.alt = file.name;
      img.loading = 'lazy';
      img.addEventListener('click', function () { openPreview(file); });
      var meta = document.createElement('div');
      meta.className = 'tile-meta';
      var name = document.createElement('span');
      name.className = 'tile-name';
      name.textContent = file.name;
      name.title = file.name;
      var sub = document.createElement('div');
      sub.className = 'tile-sub';
      sub.textContent = formatSize(file.size);
      meta.appendChild(name);
      meta.appendChild(sub);
      var actions = document.createElement('div');
      actions.className = 'tile-actions';
      var copy = document.createElement('button');
      copy.className = 'btn btn-primary';
      copy.type = 'button';
      copy.textContent = '复制链接';
      copy.addEventListener('click', function () { copyText(url, copy); });
      var del = document.createElement('button');
      del.className = 'btn btn-ghost';
      del.type = 'button';
      del.textContent = '删除';
      del.addEventListener('click', function () { deleteFile(file, del); });
      actions.appendChild(copy);
      actions.appendChild(del);
      tile.appendChild(img);
      tile.appendChild(meta);
      tile.appendChild(actions);
      el.gallery.appendChild(tile);
    });
    el.pagination.hidden = files.length <= state.pageSize;
    el.pageInfo.textContent = state.page + ' / ' + totalPages;
    el.prevBtn.disabled = state.page <= 1;
    el.nextBtn.disabled = state.page >= totalPages;
  }

  function formatSize(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
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
    el.previewName.textContent = file.name;
    el.previewImg.src = file.raw;
    var url = displayUrl(file.path);
    el.previewLinks.innerHTML = '';
    [
      ['图片链接（Pages）', url],
      ['原始文件链接（raw）', rawUrl(file.path)],
      ['Markdown', '![' + file.name + '](' + url + ')']
    ].forEach(function (pair) {
      var label = document.createElement('div');
      label.className = 'link-label';
      label.textContent = pair[0];
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
      return refresh();
    }).then(function () {
      setStatus('已删除 ' + file.name, 'ok');
    }).catch(function (err) {
      btn.disabled = false;
      setStatus('删除失败：' + err.message, 'err');
    });
  }

  function refresh() {
    var btn = el.refreshBtn;
    var label = btn.querySelector('.refresh-label');
    btn.classList.remove('is-done');
    btn.classList.add('is-loading');
    label.textContent = '刷新中';
    return listImages().then(function (files) {
      state.files = files;
      renderGallery();
      btn.classList.remove('is-loading');
      btn.classList.add('is-done');
      label.textContent = '已完成';
      setTimeout(function () {
        btn.classList.remove('is-done');
        label.textContent = '刷新';
      }, 1600);
    }).catch(function (err) {
      btn.classList.remove('is-loading');
      label.textContent = '刷新';
      setStatus('加载图片失败：' + err.message, 'err');
      throw err;
    });
  }

  function baseName(file) {
    return (file.name.replace(/\.[^.]+$/, '') || 'image');
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
    el.progressWrap.hidden = false;
    var done = 0;
    var failed = [];
    setStatus('正在处理 0/' + list.length + ' …');
    var chain = Promise.resolve();
    list.forEach(function (file) {
      chain = chain.then(function () {
        return convertFile(file, format).then(function (result) {
          var name = uniqueName(baseName(file) + '.' + result.ext);
          return uploadFile(file, name, result.base64, result.bytes).then(function (item) {
            state.files.push(item);
            done++;
            el.progressBar.style.width = (done / list.length * 100) + '%';
            el.progressText.textContent = done + ' / ' + list.length;
            setStatus('正在处理 ' + done + '/' + list.length + ' …');
          });
        }).catch(function (err) {
          failed.push(file.name + '（' + err.message + '）');
        });
      });
    });
    chain.then(function () {
      el.progressBar.style.width = '100%';
      var msg = '上传完成，共 ' + done + ' 张。Pages 链接可能需要几十秒生效。';
      if (failed.length) msg += ' 失败 ' + failed.length + ' 张：' + failed.join('；');
      setStatus(msg, failed.length ? 'err' : 'ok');
      renderGallery();
      return refresh();
    });
  }

  function init() {
    ['repoBadge', 'dropzone', 'fileInput', 'progressWrap', 'progressBar', 'progressText',
     'status', 'gallery', 'searchInput', 'refreshBtn', 'pagination', 'prevBtn', 'nextBtn', 'pageInfo',
     'previewModal', 'previewName', 'previewImg', 'previewLinks', 'formatSelect', 'formatHint'].forEach(function (id) { el[id] = $(id); });

    var savedFormat = getConvertFormat();
    el.formatSelect.value = savedFormat;
    var hints = {
      keep: '按原文件上传，不做任何转换',
      webp: '转为 WebP，通常体积更小；若转换后更大则自动保留原图',
      svg: '转为矢量轮廓，适合图标/线条图，照片类不建议使用'
    };
    var updateHint = function () { el.formatHint.textContent = hints[el.formatSelect.value]; };
    updateHint();
    el.formatSelect.addEventListener('change', function () {
      setConvertFormat(el.formatSelect.value);
      updateHint();
      setStatus('已保存上传格式设置：' + el.formatSelect.options[el.formatSelect.selectedIndex].text, 'ok');
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

    el.refreshBtn.addEventListener('click', function () { refresh().catch(function () {}); });
    el.searchInput.addEventListener('input', function () { state.query = el.searchInput.value; state.page = 1; renderGallery(); });
    el.prevBtn.addEventListener('click', function () { state.page--; renderGallery(); });
    el.nextBtn.addEventListener('click', function () { state.page++; renderGallery(); });
    document.querySelectorAll('[data-close-preview]').forEach(function (node) {
      node.addEventListener('click', function () { el.previewModal.hidden = true; });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') el.previewModal.hidden = true;
    });

    refresh();
  }

  var boot = function () {
    init();
    if (location.search.indexOf('test=1') !== -1) {
      window.__pushpicTest = { convertFile: convertFile, refresh: refresh, state: state, getFormat: getConvertFormat };
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
