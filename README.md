# herdr-work

A [Herdr](https://herdr.dev) desktop layout: `main`'s window with two more columns — **tsk**'s task progress
across every project and **skillshare**'s sync status — switched from the tab bar, right where you work.

![herdr-work](preview.png)

- **tsk column** — every task that waits on your review, is blocked, or is moving, grouped by project, with
  the project your current space sits in first and unfolded. `Start` / `Done` / a capture input write through
  tsk's own CLI; the tab-bar button carries a badge with the review + blocked count, so you see it with the
  column closed.
- **skillshare column** — [runkids/skillshare](https://github.com/runkids/skillshare)'s Herdr panel (skills,
  agents, MCP, plugins, hooks), same toggle, unmodified.
- Both columns are **layout nodes**, not entries in `main`'s per-space `panel` stack: Herdr's tabs mod rebuilds
  that stack for every space, while a layout node's hidden state is a layout click — it survives space switches
  and restarts.

**中文速览**：在 Herdr 的 `main` 窗口上加两列 —— 左边 tsk 的任务进度（当前 space 的项目排最前，可 `Start`/`Done`/加任务），
右边 skillshare 的同步状态，两列都能从顶栏开关。面板放在**布局节点**里而不是每个 space 自己的 `panel` 栈里，所以切 space 不会
丢。装法：`./install.sh`，然后 `layout.switch`。

## Install

```bash
git clone https://github.com/lingfromSh/herdr-layouts
cd herdr-layouts
./install.sh                    # copies mods/tsk + layouts/herdr-work.json into ~/.config/herdr-app
herdr-app do layout.switch '{"name":"herdr-work"}'
```

`install.sh` copies (never symlinks — a symlinked mod is not picked up), keeps the previous files as
`*.before-<stamp>`, and runs `herdr-app check mods/tsk`. By hand it is two steps: `mods/tsk/` →
`~/.config/herdr-app/mods/tsk/`, `layouts/herdr-work.json` → `~/.config/herdr-app/layouts/`, then
`layout.switch`.

`make uninstall` removes both and puts you back on `main`. Your layout clicks (column widths, hidden
columns) live in `~/.config/herdr-app/layouts/.state/` and are not touched by installing.

## Requirements

| What | Why | Check |
|---|---|---|
| Herdr desktop | cloned from `main` 0.1.14 | `herdr-app --version` |
| `tsk` | the only data source of the tsk column | `tsk list --all --json \| head -c 200` |
| `skillshare` + its Herdr mod | the right column; without it the toggle shows an empty block | `ls ~/.config/herdr-app/mods/skillshare` |

`tsk setup herdr` registers a pane in the **old** TUI's plugin system (`~/.config/herdr/plugins.json`), not in
Herdr desktop's layouts/mods — that is why this repo ships its own mod.

## Layout

```
root row
├── sidebar (px 268)              brand / spaces + agents / footer —— as in main
└── work column
    ├── tabs-row (px 42, padding [0, 8])
    │   tabs(weight 1) │ tsk-toggle(px 74) │ skillshare-toggle(px 108)
    ├── work-body row (padding 8, gap 8)
    │   ├── main                    the active tab's terminals
    │   ├── panel (px 368, hidden)  main's own files / changes stack
    │   ├── tsk-panel (px 330, min 260, max 620)
    │   └── skillshare-panel (px 340, min 300, max 720)
    └── status (px 28)
```

Both buttons are the same mod as their panel, with `props: {role: "toggle"}`:

```json
{ "id": "tsk-toggle", "type": "block", "size": { "px": 74 },
  "content": { "mod": "tsk", "props": { "role": "toggle" } } }
```

and each column is a wrapper (which is what drags) around a block (which fills it):

```json
{ "id": "tsk-panel", "type": "column", "size": { "px": 330 }, "min": 260, "max": 620,
  "children": [ { "id": "tsk", "type": "block", "content": { "mod": "tsk" } } ] }
```

Widths are remembered when you drag them. `main` keeps ~1150px for itself, so at 1920 the two columns fit
with the sidebar rail (76px); with the full 268px sidebar, or below ~1440, close one column. `ctrl-shift-b`
folds the sidebar, `ctrl-shift-l` goes back to `main`.

## What the tsk column reads

One exec, two commands, split by a marker (`--done` is a separate view, and only both together are the table):

```sh
tsk list --all --json
printf "\n@@tsk-done@@\n"
tsk list --all --done --json
```

- Refetched every 20s, skipped while the column is hidden, immediate when it comes back.
- Rows group by project: **the project your active space's folder is (or is inside) sorts first and unfolds**;
  the rest follow by how much needs you, then total, then name. Projects with no live task stay hidden unless
  a space is open in them.
- Each task shows `T<n>`, a status dot, the title, and thread/assignee chips. Opening one shows the block
  reason or `review: 2/3 checks`, the last activity line, and `Start` / `Done`.
- The strip counts `review` / `blocked` / `started`; `review + blocked` also goes into
  `shared("tsk.attention")`, which is the badge on the tab-bar button.
- The capture input is `tsk add`: it lands in the current space's project, or on the desk without a match.
  The `□` on a project card opens tsk's own board with `tab.new {folder, argv: ["tsk"]}`.

### tsk across the projects you have open in Herdr

The link is a path on both sides: Herdr knows space → `folder`, tsk knows task → `project` (absolute), and
`matchesFolder(project, folder)` is the whole join — a space opened in a subdirectory of a repo still matches.
So the column answers "where do the repos I am working in stand", and `□` opens tsk's board in the right
directory without a `cd`. Writes go through the real CLI (`add`, `status`), never the database: `add -t
<title> [-p <path>|--desk]`, `status T12 started`, `status T12 done`; exit 0 is success and anything else
prints the command's own stderr.

Limits: `--all` reads the global store, so projects with no open space still appear (further down), and the
column never switches spaces for you. `tsk list --json` has no steps progress, so rows show thread, assignee,
block reason and review checks only.

## Test

```bash
make test     # node --test tests/  —— model.js, no Herdr needed
make check    # + herdr-app check mods/tsk (QuickJS rules node does not catch)
```

`model.js` imports nothing from `herdr`: parsing, grouping, sorting and argument building live there.
`main.js` is views only.

## Files

```
layouts/herdr-work.json   the layout (a clone of main 0.1.14)
layouts/herdr-work.png    its screenshot
preview.png               both columns open
mods/tsk/main.js          the tsk column + the tab-bar button (the only file importing herdr)
mods/tsk/model.js         tsk output → rows / projects / progress; add and status arguments
mods/tsk/mark.svg         the mark; icons/ has the 16 stroke icons
tests/model.test.mjs      16 tests
install.sh, Makefile      install, check, screenshot, pull the layout back from Herdr
RECIPE.md                 the brief this layout was built from — read it before changing anything
```

## Credits

- [runkids/skillshare](https://github.com/runkids/skillshare) — the skillshare Herdr panel and the idea of
  putting a layout in a repo with a `RECIPE.md`.
- [smarzban/tsk](https://github.com/smarzban/tsk) — the task store behind the left column.

Listed in the Herdr gallery: <https://herdr.dev/layouts/lingfromSh/herdr-layouts/>. MIT.
