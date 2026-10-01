#!/usr/bin/env node
/**
 * scripts/generate-api.mjs
 * SparkOrg · 域名接口文件生成器 / Domain API file generator
 *
 * 读取 domain.txt，生成 /api/ 下各格式的静态接口文件与 /go.html 跳转页。
 * 零依赖，Node >= 16。修改 domain.txt 后运行：
 *
 *     node scripts/generate-api.mjs
 *
 * GitHub Action (.github/workflows/api-sync.yml) 会在 domain.txt
 * 或本脚本变更时自动运行并提交结果。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 与 index / zh / en 页面内联逻辑保持一致的兜底配置 */
const DEFAULT_DOMAINS = {
  primary: ['sparkorg.dpdns.org'],
  others: ['sparkorg.cc.cd'],
};

/* ---------------- 解析 domain.txt（与页面端逻辑一致） ---------------- */

function parseDomains(text) {
  const primary = [];
  const others = [];
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.charAt(0) === '#') continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const val = line.slice(i + 1).trim();
    if (!val) continue;
    if (key === 'primary') primary.push(val);
    else if (key === 'other') others.push(val);
  }
  if (!primary.length && !others.length) {
    return { primary: [...DEFAULT_DOMAINS.primary], others: [...DEFAULT_DOMAINS.others] };
  }
  return { primary, others };
}

function loadDomains() {
  try {
    return parseDomains(readFileSync(join(ROOT, 'domain.txt'), 'utf8'));
  } catch {
    return { primary: [...DEFAULT_DOMAINS.primary], others: [...DEFAULT_DOMAINS.others] };
  }
}

/* ---------------- 转义工具 ---------------- */

const escXml = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const csvCell = (s) => (/[",\n]/.test(s) ? '"' + String(s).replace(/"/g, '""') + '"' : s);

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

function buildAll(domains) {
  const primary = domains.primary;
  const others = domains.others;
  const primaryDomain = primary[0] || others[0] || DEFAULT_DOMAINS.primary[0];
  const bakedUrl = 'https://' + primaryDomain;

  /* ---- /api/domain.txt：主域名原文，无任何格式 ---- */
  const txt = primaryDomain + '\n';

  /* ---- /api/domain.json ---- */
  const json =
    '{\n' +
    '  "primary": [' + primary.map((d) => JSON.stringify(d)).join(', ') + '],\n' +
    '  "others": [' + others.map((d) => JSON.stringify(d)).join(', ') + '],\n' +
    '  "primary_domain": ' + JSON.stringify(primaryDomain) + '\n' +
    '}\n';

  /* ---- /api/domain.yaml 与 /api/domain.yml ---- */
  const yaml =
    '# SparkOrg · Domain API（由 scripts/generate-api.mjs 从 domain.txt 生成，请勿手工编辑）\n' +
    'primary_domain: ' + primaryDomain + '\n' +
    'primary:\n' +
    primary.map((d) => '  - ' + d).join('\n') + (primary.length ? '\n' : '') +
    (others.length
      ? 'others:\n' + others.map((d) => '  - ' + d).join('\n') + '\n'
      : 'others: []\n');

  /* ---- /api/domain.toml ---- */
  const toml =
    '# SparkOrg · Domain API（由 scripts/generate-api.mjs 从 domain.txt 生成，请勿手工编辑）\n' +
    'primary_domain = ' + JSON.stringify(primaryDomain) + '\n' +
    'primary = [' + primary.map((d) => JSON.stringify(d)).join(', ') + ']\n' +
    'others = [' + others.map((d) => JSON.stringify(d)).join(', ') + ']\n';

  /* ---- /api/domain.ini：多值以英文逗号分隔 ---- */
  const ini =
    '; SparkOrg · Domain API（由 scripts/generate-api.mjs 从 domain.txt 生成，请勿手工编辑）\n' +
    '[domains]\n' +
    'primary_domain = ' + primaryDomain + '\n' +
    'primary = ' + primary.join(',') + '\n' +
    'others = ' + others.join(',') + '\n';

  /* ---- /api/domain.xml ---- */
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!-- SparkOrg · Domain API（由 scripts/generate-api.mjs 从 domain.txt 生成，请勿手工编辑） -->\n' +
    '<domains>\n' +
    '  <primary_domain>' + escXml(primaryDomain) + '</primary_domain>\n' +
    '  <primary>\n' +
    primary.map((d) => '    <domain>' + escXml(d) + '</domain>').join('\n') + (primary.length ? '\n' : '') +
    '  </primary>\n' +
    '  <others>\n' +
    others.map((d) => '    <domain>' + escXml(d) + '</domain>').join('\n') + (others.length ? '\n' : '') +
    '  </others>\n' +
    '</domains>\n';

  /* ---- /api/domain.csv：列 role,domain ---- */
  const csvRows = [['role', 'domain']]
    .concat(primary.map((d) => ['primary', d]))
    .concat(others.map((d) => ['other', d]));
  const csv = csvRows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

  /* ---- /api/domain.env：dotenv 环境变量 ---- */
  const env =
    '# SparkOrg · Domain API（由 scripts/generate-api.mjs 从 domain.txt 生成，请勿手工编辑）\n' +
    'PRIMARY_DOMAIN=' + primaryDomain + '\n' +
    'PRIMARY=' + primary.join(',') + '\n' +
    'OTHERS=' + others.join(',') + '\n';

  /* ---- /go.html：跳转页（烘焙兜底值 + 运行时实时读取 domain.txt） ---- */
  const goHtml =
`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!-- 无 JS 兜底：5 秒后跳转到生成时的主域名 -->
<meta http-equiv="refresh" content="5; url=${bakedUrl}">
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
  <h1>正在跳转到主域名 / Redirecting…</h1>
  <div class="box">
    <div><span class="spin"></span><span id="status">正在读取主域名配置… / Resolving primary domain…</span></div>
    <div class="target" id="target">${bakedUrl}</div>
  </div>
  <p class="tip">
    如果没有自动跳转，请 <a id="manual" href="${bakedUrl}">点击这里手动跳转</a>。<br>
    If it doesn't redirect automatically, <a id="manual2" href="${bakedUrl}">click here</a>.<br>
    本页由 scripts/generate-api.mjs 生成 · Generated by scripts/generate-api.mjs
  </p>
</div>

<script>
/* ===== 本段由 scripts/generate-api.mjs 自动生成，请勿手工编辑 ===== */
var BAKED_PRIMARY = '${primaryDomain}';

function parseDomains(text){
  var primary = [], others = [];
  text.split(/\\r?\\n/).forEach(function(line){
    line = line.trim();
    if(!line || line.charAt(0) === '#') return;
    var i = line.indexOf('=');
    if(i < 0) return;
    var key = line.slice(0, i).trim().toLowerCase();
    var val = line.slice(i + 1).trim();
    if(!val) return;
    if(key === 'primary') primary.push(val);
    else if(key === 'other') others.push(val);
  });
  if(!primary.length && !others.length) return { primary: ['sparkorg.dpdns.org'], others: ['sparkorg.cc.cd'] };
  return { primary: primary, others: others };
}

function pickTarget(d){
  var all = d.primary.concat(d.others);
  var q = '';
  try {
    var m = location.search.match(/[?&]to=([^&]*)/);
    q = m ? decodeURIComponent(m[1]).toLowerCase() : '';
  } catch(e){}
  if(q === 'other' || q === 'backup') return d.others[0] || d.primary[0] || BAKED_PRIMARY;
  if(/^\\d+$/.test(q)){
    var idx = parseInt(q, 10) - 1;
    if(idx >= 0 && idx < all.length) return all[idx];
    return d.primary[0] || BAKED_PRIMARY;
  }
  return d.primary[0] || BAKED_PRIMARY;
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

/* 先展示烘焙兜底值，再尝试实时读取 domain.txt */
applyUI('https://' + BAKED_PRIMARY);

function fallback(){ go('https://' + BAKED_PRIMARY); }

if(window.fetch){
  fetch('domain.txt')
    .then(function(r){ if(!r.ok) throw 0; return r.text(); })
    .then(function(t){ go('https://' + pickTarget(parseDomains(t))); })
    .catch(fallback);
} else {
  fallback();
}
setTimeout(fallback, 2000);
</script>

</body>
</html>
`;

  return { primaryDomain, bakedUrl, txt, json, yaml, toml, ini, xml, csv, env, goHtml };
}

/* ---------------- 主流程 ---------------- */

console.log('SparkOrg API generator');
console.log('  root: ' + ROOT);

const domains = loadDomains();
const built = buildAll(domains);

console.log('  primary: ' + built.primaryDomain);
if (domains.primary.length > 1) console.log('  primary list: ' + domains.primary.join(', '));
if (domains.others.length) console.log('  others: ' + domains.others.join(', '));
console.log('');

writeIfChanged('api/domain.txt', built.txt);
writeIfChanged('api/domain.json', built.json);
writeIfChanged('api/domain.yaml', built.yaml);
writeIfChanged('api/domain.yml', built.yaml);
writeIfChanged('api/domain.toml', built.toml);
writeIfChanged('api/domain.ini', built.ini);
writeIfChanged('api/domain.xml', built.xml);
writeIfChanged('api/domain.csv', built.csv);
writeIfChanged('api/domain.env', built.env);
writeIfChanged('go.html', built.goHtml);

console.log('');
console.log('Done. written=' + written + ' unchanged=' + skipped);
