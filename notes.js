#!/usr/bin/env node
/**
 * notes.js —— 扫描仓库中的 Markdown 笔记，生成索引数据。
 *
 * 零依赖，需要 Node.js >= 18。它按 README 的约定解析笔记：
 *   - 一级标题作为标题，形如 `# 2026-10-09 · 某个想法` 时自动拆出日期
 *   - 顶部引用块中的 `> 来源：xxx` 作为来源
 *   - 正文中的 `- 要点` 作为摘要条目
 *   - 标签取自 front matter 的 tags，或正文中的 #hashtag
 *
 * 用法：
 *   node notes.js              列出所有笔记（等价于 list）
 *   node notes.js list         列出所有笔记
 *   node notes.js list --json  以 JSON 输出
 *   node notes.js export       输出可直接粘贴进 index.html 的 NOTES 数组
 *   node notes.js --help       查看帮助
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const IGNORED_DIRS = new Set([".git", "node_modules", ".obsidian", ".vscode"]);
const MAX_POINTS = 6;

/* ------------------------------------------------------------------ 扫描 */

/** 递归收集 Markdown 文件（跳过根目录的 README.md 与隐藏目录）。 */
function collectMarkdownFiles(dir, base = dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      collectMarkdownFiles(full, base, out);
      continue;
    }
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".md") continue;
    const rel = path.relative(base, full);
    if (rel === "README.md") continue;
    out.push(rel);
  }
  return out.sort();
}

/* ------------------------------------------------------------------ 解析 */

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const DATE_IN_TITLE = /^(\d{4}-\d{2}-\d{2})\s*[·|\-–—]\s*(.+)$/;

/** 解析极简 front matter：只支持 `key: value` 与 `key: [a, b]`。 */
function parseFrontMatter(text) {
  const match = text.match(FRONT_MATTER);
  if (!match) return { data: {}, body: text };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    const [, key, raw] = kv;
    const value = raw.trim();
    if (/^\[.*\]$/.test(value)) {
      data[key] = value.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else {
      data[key] = value.replace(/^["']|["']$/g, "");
    }
  }
  return { data, body: text.slice(match[0].length) };
}

/** 去掉行内 Markdown 修饰，得到纯文本要点。 */
function plainText(line) {
  return line
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim();
}

/** 把一个 Markdown 文件解析成索引页使用的笔记对象。 */
function parseNote(relPath) {
  const full = path.join(ROOT, relPath);
  const raw = fs.readFileSync(full, "utf8");
  const { data, body } = parseFrontMatter(raw);

  const lines = body.split(/\r?\n/);
  let title = "";
  const points = [];
  const hashtags = [];
  const titleTags = [];
  let inFence = false;

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const heading = line.match(/^#\s+(.+?)\s*#*$/);
    if (heading && !title) {
      // 标题里的 #hashtag 视为标签，并从标题中剔除。
      title = plainText(heading[1]);
      for (const m of title.matchAll(/(?:^|\s)#([A-Za-z0-9][\w-]*)/g)) {
        const tag = m[1].toLowerCase();
        if (!titleTags.includes(tag)) titleTags.push(tag);
      }
      title = title.replace(/(?:^|\s)#[A-Za-z0-9][\w-]*/g, " ").replace(/\s+/g, " ").trim();
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    if (bullet && points.length < MAX_POINTS) {
      const text = plainText(bullet[1]);
      if (text) points.push(text);
    }

    for (const tag of line.matchAll(/(?:^|[\s(（])#([A-Za-z0-9][\w-]*)/g)) {
      if (!hashtags.includes(tag[1].toLowerCase())) hashtags.push(tag[1].toLowerCase());
    }
  }

  const dateMatch = title.match(DATE_IN_TITLE);
  if (dateMatch) {
    title = dateMatch[2].trim();
  }

  const sourceLine = lines.find((l) => /^\s*>\s*(来源|source)\s*[:：]/i.test(l));
  const source =
    (typeof data.source === "string" && data.source) ||
    (sourceLine ? plainText(sourceLine.replace(/^\s*>\s*/, "").replace(/^(来源|source)\s*[:：]\s*/i, "")) : "");

  let date = typeof data.date === "string" ? data.date.slice(0, 10) : "";
  if (!date && dateMatch) date = dateMatch[1];
  if (!date) date = fs.statSync(full).mtime.toISOString().slice(0, 10);

  const declared = Array.isArray(data.tags)
    ? data.tags
    : typeof data.tags === "string" && data.tags
      ? data.tags.split(/[\s,]+/).filter(Boolean)
      : hashtags;
  const tags = [...new Set([...declared, ...titleTags].map((t) => String(t).toLowerCase()))];

  if (!title) title = path.basename(relPath, path.extname(relPath));

  return {
    date,
    title,
    source,
    tags,
    points,
    file: relPath.split(path.sep).join("/"),
  };
}

/** 扫描整个仓库并按日期倒序返回笔记。 */
function readNotes() {
  return collectMarkdownFiles(ROOT)
    .map((rel) => {
      try {
        return parseNote(rel);
      } catch (err) {
        console.error(`! 跳过 ${rel}：${err.message}`);
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date) || a.file.localeCompare(b.file));
}

/* ------------------------------------------------------------------ 输出 */

function renderList(notes) {
  if (notes.length === 0) {
    return [
      "没有找到笔记。",
      "按 README 的约定新建 notes/ 目录并放入 .md 文件，例如：",
      "",
      "  mkdir -p notes",
      '  printf "# 2026-10-09 · 某个想法\\n\\n> 来源：会议记录\\n\\n- 要点一\\n" > notes/some-idea.md',
    ].join("\n");
  }
  const rows = notes.map((n) => {
    const tags = n.tags.length ? ` · ${n.tags.map((t) => `#${t}`).join(" ")}` : "";
    const source = n.source ? ` · ${n.source}` : "";
    return `${n.date}  ${n.title}${tags}${source}\n           ${n.file}`;
  });
  return `${rows.join("\n")}\n\n共 ${notes.length} 篇笔记。`;
}

/** 生成与 index.html 中 NOTES 数组同构的代码片段。 */
function renderExport(notes) {
  const items = notes.map((n) => {
    const fields = [
      `      date: ${JSON.stringify(n.date)}`,
      `      title: ${JSON.stringify(n.title)}`,
      `      source: ${JSON.stringify(n.source)}`,
      `      tags: [${n.tags.map((t) => JSON.stringify(t)).join(", ")}]`,
      `      points: ${
        n.points.length
          ? `[\n${n.points.map((p) => `        ${JSON.stringify(p)}`).join(",\n")}\n      ]`
          : "[]"
      }`,
      `      file: ${JSON.stringify(n.file)}`,
    ];
    return `    {\n${fields.join(",\n")}\n    }`;
  });
  if (items.length === 0) return "  const NOTES = [];";
  return `  const NOTES = [\n${items.join(",\n")}\n  ];`;
}

const HELP = `用法：node notes.js [command] [options]

命令：
  list         列出所有笔记（默认）
  export       输出可粘贴进 index.html 的 NOTES 数组
  help         显示本帮助

选项：
  --json       以 JSON 输出（仅 list）
`;

function main(argv) {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(HELP);
    return 0;
  }
  const command = args.find((a) => !a.startsWith("-")) || "list";
  const notes = readNotes();

  switch (command) {
    case "list":
      process.stdout.write(
        (args.includes("--json") ? JSON.stringify(notes, null, 2) : renderList(notes)) + "\n"
      );
      return 0;
    case "export":
      process.stdout.write(renderExport(notes) + "\n");
      return 0;
    case "help":
      process.stdout.write(HELP);
      return 0;
    default:
      console.error(`未知命令：${command}\n`);
      process.stdout.write(HELP);
      return 1;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv);
}

module.exports = { collectMarkdownFiles, parseNote, readNotes, renderExport, renderList };
