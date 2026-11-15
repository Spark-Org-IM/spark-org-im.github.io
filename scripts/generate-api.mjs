#!/usr/bin/env node
/**
 * scripts/generate-api.mjs
 * SparkOrg · 服务接口文件生成器 / Service API file generator
 *
 * 读取 services.toml（唯一的配置源），生成 /api/ 下各格式的静态接口文件、
 * /api/home.txt 与 /go.html 跳转页。零依赖，Node >= 16。
 *
 *     node scripts/generate-api.mjs
 *
 * GitHub Action (.github/workflows/api-sync.yml) 会在 services.toml
 * 或本脚本变更时自动运行并提交结果。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CONFIG_FILE = 'services.toml';

/** services.toml 缺失或为空时的兜底 */
const DEFAULT_SERVICES = {
  HOME: 'sparkorg.dpdns.org',
};

/* ---------------- TOML 解析（仅覆盖本项目需要的子集） ---------------- */

/** 去掉 TOML 行尾注释，引号内的 # 不处理 */
function stripTomlComment(line) {
  let quote = '';
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (quote === '"' && ch === '\\') {
        i += 1;
      } else if (ch === quote) {
        quote = '';
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '#') {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseTomlString(raw) {
  const value = raw.trim();
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.replace(/^"|"$/g, '');
    }
  }
  if (value.startsWith("'")) {
    return value.replace(/^'|'$/g, '');
  }
  return value;
}

/**
 * 返回 { order, services, labels }
 * 支持：
 *   HOME = "sparkorg.dpdns.org"          （顶层变量）
 *   [services]
 *   HOME = "sparkorg.dpdns.org"          （推荐）
 *   [labels.HOME]
 *   zh = "主页"
 *   en = "Home"
 */
function parseToml(text) {
  const services = {};
  const labels = {};
  const order = [];
  let section = [];

  const addService = (key, value) => {
    if (!key) return;
    if (!Object.prototype.hasOwnProperty.call(services, key)) order.push(key);
    services[key] = String(value).trim();
  };

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;

    if (line.charAt(0) === '[') {
      const end = line.indexOf(']');
      if (end < 0) continue;
      section = line
        .slice(1, end)
        .trim()
        .split('.')
        .map((part) => part.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      continue;
    }

    const eq = line.indexOf('=');
    if (eq < 0) continue;

    const key = line.slice(0, eq).trim().replace(/^["']|["']$/g, '');
    const value = parseTomlString(line.slice(eq + 1));

    if (section.length === 0 || (section.length === 1 && section[0] === 'services')) {
      addService(key, value);
    } else if (section[0] === 'labels' && section.length >= 2) {
      const serviceKey = section[1];
      if (!labels[serviceKey]) labels[serviceKey] = {};
      labels[serviceKey][key] = String(value);
    }
  }

  return { order, services, labels };
}

function loadConfig() {
  try {
    const parsed = parseToml(readFileSync(join(ROOT, CONFIG_FILE), 'utf8'));
    if (parsed.order.length) return parsed;
  } catch {
    /* use defaults */
  }
  return {
    order: Object.keys(DEFAULT_SERVICES),
    services: { ...DEFAULT_SERVICES },
    labels: {},
  };
}

/* ---------------- 服务元数据 ---------------- */

const SERVICE_META = {
  HOME: {
    zh: '主页',
    en: 'Home',
    desc_zh: 'SparkOrg 主站入口',
    desc_en: 'SparkOrg main site',
  },
  FORUM: {
    zh: '论坛',
    en: 'Forum',
    desc_zh: '社区交流与讨论',
    desc_en: 'Community discussion forum',
  },
  GIT: {
    zh: 'Git 服务',
    en: 'Git',
    desc_zh: '代码托管与仓库服务',
    desc_en: 'Source code hosting service',
  },
  STATUS: {
    zh: '状态页',
    en: 'Status',
    desc_zh: '各服务的运行状态与公告',
    desc_en: 'Service status and announcements',
  },
  CLOUD_ST: {
    zh: '云服务状态',
    en: 'Cloud Status',
    desc_zh: '云平台运行状态',
    desc_en: 'Cloud platform status',
  },
};

function metaFor(key, configuredLabels = {}) {
  const base = SERVICE_META[key] || {
    zh: key,
    en: key,
    desc_zh: `服务 ${key}`,
    desc_en: `Service ${key}`,
  };
  return {
    zh: configuredLabels.zh || base.zh,
    en: configuredLabels.en || base.en,
    desc_zh: configuredLabels.desc_zh || base.desc_zh,
    desc_en: configuredLabels.desc_en || base.desc_en,
  };
}

function normalizeDomain(value) {
  let domain = String(value || '').trim();
  if (!domain) return '';
  domain = domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return domain;
}

function buildModel(config) {
  const order = config.order.slice();
  const values = {};
  for (const key of order) values[key] = normalizeDomain(config.services[key]);

  const active = order.filter((key) => values[key]);
  if (!active.length) {
    return buildModel({
      order: Object.keys(DEFAULT_SERVICES),
      services: { ...DEFAULT_SERVICES },
      labels: {},
    });
  }

  const disabled = order.filter((key) => !values[key]);
  const homeKey = active.includes('HOME') ? 'HOME' : active[0];
  const homeDomain = values[homeKey];

  const services = {};
  const labels = {};
  for (const key of active) services[key] = values[key];
  for (const key of order) labels[key] = metaFor(key, config.labels[key] || {});

  return { order, active, disabled, homeKey, homeDomain, services, labels };
}

/* ---------------- 转义工具 ---------------- */

const escXml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const csvCell = (value) =>
  /[",\n]/.test(String(value)) ? '"' + String(value).replace(/"/g, '""') + '"' : String(value);

const yamlStr = (value) => JSON.stringify(String(value));
const tomlStr = (value) => JSON.stringify(String(value));

/* ---------------- 写文件（内容不变则跳过） ---------------- */

let written = 0;
let skipped = 0;

function writeIfChanged(rel, content) {
  const abs = join(ROOT, rel);
  if (existsSync(abs) && readFileSync(abs, 'utf8') === content) {
    skipped += 1;
    console.log('  = ' + rel + ' (unchanged)');
    return;
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
  written += 1;
  console.log('  + ' + rel);
}

/* ---------------- 各格式内容 ---------------- */

function buildServicesTxt(model) {
  return model.active.map((key) => key + '=' + model.services[key]).join('\n') + '\n';
}

function buildServicesJson(model) {
  return (
    JSON.stringify(
      {
        home: model.homeKey,
        home_domain: model.homeDomain,
        services: model.services,
        labels: model.labels,
        disabled: model.disabled,
      },
      null,
      2,
    ) + '\n'
  );
}

function buildServicesYaml(model) {
  let out = '# SparkOrg · Services API（由 scripts/generate-api.mjs 从 services.toml 生成，请勿手工编辑）\n';
  out += 'home: ' + yamlStr(model.homeKey) + '\n';
  out += 'home_domain: ' + yamlStr(model.homeDomain) + '\n';
  out += 'services:\n';
  for (const key of model.active) {
    out += '  ' + key + ': ' + yamlStr(model.services[key]) + '\n';
  }
  out += 'labels:\n';
  for (const key of model.order) {
    const meta = model.labels[key];
    out += '  ' + key + ':\n';
    out += '    zh: ' + yamlStr(meta.zh) + '\n';
    out += '    en: ' + yamlStr(meta.en) + '\n';
    out += '    desc_zh: ' + yamlStr(meta.desc_zh) + '\n';
    out += '    desc_en: ' + yamlStr(meta.desc_en) + '\n';
  }
  if (model.disabled.length) {
    out += 'disabled:\n' + model.disabled.map((key) => '  - ' + yamlStr(key)).join('\n') + '\n';
  } else {
    out += 'disabled: []\n';
  }
  return out;
}

function buildServicesToml(model) {
  let out = '# SparkOrg · Services API（由 scripts/generate-api.mjs 从 services.toml 生成，请勿手工编辑）\n';
  out += 'home = ' + tomlStr(model.homeKey) + '\n';
  out += 'home_domain = ' + tomlStr(model.homeDomain) + '\n';
  out += 'disabled = [' + model.disabled.map(tomlStr).join(', ') + ']\n\n';
  out += '[services]\n';
  for (const key of model.active) {
    out += key + ' = ' + tomlStr(model.services[key]) + '\n';
  }
  if (model.disabled.length) {
    out += '\n# 未配置 / disabled: ' + model.disabled.join(', ') + '\n';
  }
  for (const key of model.order) {
    const meta = model.labels[key];
    out += '\n[labels.' + key + ']\n';
    out += 'zh = ' + tomlStr(meta.zh) + '\n';
    out += 'en = ' + tomlStr(meta.en) + '\n';
    out += 'desc_zh = ' + tomlStr(meta.desc_zh) + '\n';
    out += 'desc_en = ' + tomlStr(meta.desc_en) + '\n';
  }
  return out;
}

function buildServicesIni(model) {
  let out = '; SparkOrg · Services API（由 scripts/generate-api.mjs 从 services.toml 生成，请勿手工编辑）\n';
  out += '[meta]\n';
  out += 'home = ' + model.homeKey + '\n';
  out += 'home_domain = ' + model.homeDomain + '\n';
  out += 'disabled = ' + model.disabled.join(',') + '\n';
  out += '[services]\n';
  for (const key of model.active) {
    out += key + ' = ' + model.services[key] + '\n';
  }
  out += '[labels]\n';
  for (const key of model.order) {
    const meta = model.labels[key];
    out += key + '_ZH = ' + meta.zh + '\n';
    out += key + '_EN = ' + meta.en + '\n';
    out += key + '_DESC_ZH = ' + meta.desc_zh + '\n';
    out += key + '_DESC_EN = ' + meta.desc_en + '\n';
  }
  return out;
}

function buildServicesXml(model) {
  let out = '<?xml version="1.0" encoding="UTF-8"?>\n';
  out += '<!-- SparkOrg · Services API（由 scripts/generate-api.mjs 从 services.toml 生成，请勿手工编辑） -->\n';
  out += '<services home="' + escXml(model.homeKey) + '" home_domain="' + escXml(model.homeDomain) + '">\n';
  for (const key of model.active) {
    const meta = model.labels[key];
    out += '  <service key="' + escXml(key) + '" domain="' + escXml(model.services[key]) + '">\n';
    out += '    <zh>' + escXml(meta.zh) + '</zh>\n';
    out += '    <en>' + escXml(meta.en) + '</en>\n';
    out += '    <desc_zh>' + escXml(meta.desc_zh) + '</desc_zh>\n';
    out += '    <desc_en>' + escXml(meta.desc_en) + '</desc_en>\n';
    out += '  </service>\n';
  }
  if (model.disabled.length) {
    out += '  <disabled>\n';
    for (const key of model.disabled) {
      out += '    <service>' + escXml(key) + '</service>\n';
    }
    out += '  </disabled>\n';
  }
  out += '</services>\n';
  return out;
}

function buildServicesCsv(model) {
  const rows = [['service', 'domain']].concat(model.active.map((key) => [key, model.services[key]]));
  return rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

function buildServicesEnv(model) {
  let out = '# SparkOrg · Services API（由 scripts/generate-api.mjs 从 services.toml 生成，请勿手工编辑）\n';
  for (const key of model.active) {
    out += key + '=' + model.services[key] + '\n';
  }
  if (model.disabled.length) {
    out += '# 未配置 / not configured: ' + model.disabled.join(', ') + '\n';
  }
  return out;
}

function buildGoHtml(model) {
  const bakedUrl = 'https://' + model.homeDomain;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!-- 无 JS 兜底：8 秒后跳转到生成时的 HOME -->
<meta http-equiv="refresh" content="8; url=${bakedUrl}">
<title>跳转中… / Redirecting…</title>
<style>
  :root{
    --bg:#0f1117; --card:#181b23; --text:#e8eaed; --muted:#9aa0aa;
    --line:#2a2e38; --primary:#3b82f6; --primary-soft:rgba(59,130,246,.15);
  }
  *{box-sizing:border-box;}
  body{
    margin:0; min-height:100vh; background:var(--bg); color:var(--text);
    display:flex; align-items:center; justify-content:center; padding:24px;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
  }
  .wrap{width:100%; max-width:460px; text-align:center;}
  .logo{font-size:13px; letter-spacing:2px; color:var(--muted); text-transform:uppercase; margin-bottom:10px;}
  h1{font-size:22px; margin:0 0 16px;}
  .box{
    background:var(--card); border:1px solid var(--line); border-radius:12px;
    padding:18px; margin-bottom:16px; font-size:14px;
  }
  .target{
    margin-top:10px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
    font-size:16px; color:var(--primary); word-break:break-all;
  }
  .spin{
    display:inline-block; width:13px; height:13px; border:2px solid var(--line);
    border-top-color:var(--primary); border-radius:50%; animation:sp .8s linear infinite;
    vertical-align:-2px; margin-right:8px;
  }
  @keyframes sp{to{transform:rotate(360deg);}}
  .tip{font-size:12px; color:var(--muted); line-height:1.8; margin-top:4px;}
  a{color:var(--primary);}
</style>
</head>
<body>

<div class="wrap">
  <div class="logo">SparkOrg</div>
  <h1>正在跳转 / Redirecting…</h1>
  <div class="box">
    <div><span class="spin"></span><span id="status">正在读取服务配置… / Resolving service…</span></div>
    <div class="target" id="target">${bakedUrl}</div>
  </div>
  <p class="tip">
    如果没有自动跳转，请 <a id="manual" href="${bakedUrl}">点击这里手动跳转</a>。<br>
    If it doesn't redirect automatically, <a id="manual2" href="${bakedUrl}">click here</a>.<br>
    可用参数：${model.active.map((k) => '<code>?to=' + k + '</code>').join('、')}<br>
    也可在服务名后带路径：<code>?to=SERVICE/path</code> · Path suffix is supported: <code>?to=SERVICE/path</code><br>
    本页由 scripts/generate-api.mjs 生成 · Generated by scripts/generate-api.mjs
  </p>
</div>

<script>
/* ===== 本段由 scripts/generate-api.mjs 自动生成，请勿手工编辑 ===== */
var BAKED_HOME = '${model.homeDomain}';

function stripTomlComment(line){
  var quote = '';
  for(var i = 0; i < line.length; i++){
    var ch = line.charAt(i);
    if(quote){
      if(quote === '"' && ch === '\\\\'){ i++; }
      else if(ch === quote){ quote = ''; }
    } else if(ch === '"' || ch === "'"){
      quote = ch;
    } else if(ch === '#'){
      return line.slice(0, i);
    }
  }
  return line;
}

function parseTomlString(raw){
  var value = raw.trim();
  if(value.charAt(0) === '"'){
    try { return JSON.parse(value); } catch(e){ return value.replace(/^"|"$/g, ''); }
  }
  if(value.charAt(0) === "'"){ return value.replace(/^'|'$/g, ''); }
  return value;
}

/* 只读取顶层变量与 [services] 表；其余表（如 [labels.*]）忽略 */
function parseServices(text){
  var order = [], services = {}, section = '';
  text.split(/\\r?\\n/).forEach(function(raw){
    var line = stripTomlComment(raw).trim();
    if(!line) return;
    if(line.charAt(0) === '['){
      var end = line.indexOf(']');
      if(end > 0) section = line.slice(1, end).trim();
      return;
    }
    if(section && section !== 'services') return;
    var i = line.indexOf('=');
    if(i < 0) return;
    var key = line.slice(0, i).trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    if(!key) return;
    var value = parseTomlString(line.slice(i + 1)).trim().replace(/^https?:\\/\\//i, '').replace(/\\/+$/, '');
    if(!(key in services)) order.push(key);
    services[key] = value;
  });
  return { order: order, services: services };
}

function pickTarget(info){
  var raw = '';
  try {
    var m = location.search.match(/[?&]to=([^&]*)/);
    raw = m ? decodeURIComponent(m[1]).trim() : '';
  } catch(e){}

  /* 支持 ?to=SERVICE/path：第一个 / 之前的是服务名，之后原样拼到域名后面 */
  var slash = raw.indexOf('/');
  var q = (slash < 0 ? raw : raw.slice(0, slash)).toUpperCase();
  var suffix = slash < 0 ? '' : raw.slice(slash);

  var active = info.order.filter(function(key){ return info.services[key]; });
  var home = info.services.HOME || (active.length ? info.services[active[0]] : BAKED_HOME);
  var target = home;

  if(q === 'OTHER' || q === 'BACKUP'){
    var firstOther = active.filter(function(key){ return key !== 'HOME'; })[0];
    target = info.services[firstOther] || home;
  } else if(/^\\d+$/.test(q)){
    var idx = parseInt(q, 10) - 1;
    target = (idx >= 0 && idx < active.length) ? info.services[active[idx]] : home;
  } else if(q && info.services[q]){
    target = info.services[q];
  }

  if(!suffix) return target;
  return String(target).replace(/\\/+$/, '') + suffix;
}

function applyUI(url){
  var t = document.getElementById('target');
  var m1 = document.getElementById('manual');
  var m2 = document.getElementById('manual2');
  var s = document.getElementById('status');
  if(t) t.textContent = url;
  if(m1) m1.href = url;
  if(m2) m2.href = url;
  if(s) s.textContent = '跳转中… / Redirecting…';
}

function go(url){
  applyUI(url);
  location.replace(url);
}

/* 先展示烘焙兜底值，再尝试实时读取 services.toml */
applyUI('https://' + BAKED_HOME);

function fallback(){ go('https://' + BAKED_HOME); }

if(window.fetch){
  fetch('services.toml', { cache: 'no-store' })
    .then(function(r){ if(!r.ok) throw 0; return r.text(); })
    .then(function(t){ go('https://' + pickTarget(parseServices(t))); })
    .catch(fallback);
} else {
  fallback();
}
/* 不再用 setTimeout 兜底：2 秒定时器会在 fetch 较慢时抢先跳到 HOME，
   导致 ?to=XXX 全部失效；真正的兜底交给 <meta refresh>。 */
</script>

</body>
</html>
`;
}

/* ---------------- 主流程 ---------------- */

console.log('SparkOrg API generator');
console.log('  root: ' + ROOT);
console.log('  config: ' + CONFIG_FILE);

const config = loadConfig();
const model = buildModel(config);

console.log('  home: ' + model.homeKey + ' = ' + model.homeDomain);
console.log('  services: ' + model.active.map((key) => key + '=' + model.services[key]).join(', '));
if (model.disabled.length) console.log('  disabled: ' + model.disabled.join(', '));
console.log('');

writeIfChanged('api/services.txt', buildServicesTxt(model));
writeIfChanged('api/services.json', buildServicesJson(model));
writeIfChanged('api/services.yaml', buildServicesYaml(model));
writeIfChanged('api/services.yml', buildServicesYaml(model));
writeIfChanged('api/services.toml', buildServicesToml(model));
writeIfChanged('api/services.ini', buildServicesIni(model));
writeIfChanged('api/services.xml', buildServicesXml(model));
writeIfChanged('api/services.csv', buildServicesCsv(model));
writeIfChanged('api/services.env', buildServicesEnv(model));
writeIfChanged('api/home.txt', model.homeDomain + '\n');
writeIfChanged('api/domain.txt', model.homeDomain + '\n');
writeIfChanged('go.html', buildGoHtml(model));

console.log('');
console.log('Done. written=' + written + ' unchanged=' + skipped);
