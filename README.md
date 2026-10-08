# Markdown Notes

A lightweight repository for collecting notes, drafts, and snippets in Markdown.

## Structure

```
.
├── README.md   # 本文件：仓库说明
├── index.html  # 笔记索引页（自包含，双击即可打开）
└── notes/      # 放置日常笔记（可自行创建）
```

## 索引页

`index.html` 是一个零依赖的单文件页面：内嵌笔记数据，支持关键词搜索（按 `/` 聚焦）、标签筛选与深浅色主题切换。新增笔记时，在文件内的 `NOTES` 数组追加一条记录即可。

## Conventions

- 一个主题一个文件，文件名使用小写中划线，例如 `api-design.md`。
- 每篇笔记以一级标题开头，并在顶部用引用块写明日期与来源。
- 代码片段使用围栏代码块并标注语言，便于语法高亮。

## Example note

```markdown
# 2026-10-09 · 某个想法

> 来源：会议记录

- 要点一
- 要点二
```

## License

未指定 —— 如需开源，请补充 `LICENSE` 文件。
