# herdr-work

A [Herdr](https://herdr.dev) desktop layout: `main`'s window with one more column — **tsk**'s task progress
across every project — switched from the tab bar, right where you work.

![herdr-work](preview.png)

- **tsk column** — every task that waits on your review, is blocked, or is moving, grouped by project, with
  the project your current space sits in first and unfolded. `Start` marks a task started **and runs a coding
  agent on it** through `hc`, in the background, in a terminal labeled with the task — so the row shows which
  agent is on it, whether it is still working, and one click walks you back to it; open the row and it also
  names the space and tab (`Pi · Fosun Work / 1`). `Done` and the capture input write through
  tsk's own CLI; the tab-bar button carries a badge with the review + blocked count, so you see it with the
  column closed, and a task that changes status while you are elsewhere raises a notification.
- One **layout node**, not an entry in `main`'s per-space `panel` stack: Herdr's tabs mod rebuilds that stack
  for every space, while a layout node's hidden state is a layout click — it survives space switches and
  restarts.

**中文速览**：在 Herdr 的 `main` 窗口上加一列 tsk 任务进度（当前 space 的项目排最前，可 `Start`/`Done`/加任务）。
`Start` 走 `hc run` 后台起 agent，终端带 `tsk=T<n>` 标签，所以面板能显示是哪个 agent 在跑、是否还在跑、点一下跳回该终端；
展开任务还能看到它在哪个 space / tab（`Pi · Fosun Work / 1`）；
任务状态一变就弹通知；刷新频率可在面板上选（关闭 / 5s / 15s / 1m / 5m）。
面板放在**布局节点**里而不是每个 space 自己的 `panel` 栈里，所以切 space 不会丢。装法：`./install.sh`，然后 `layout.switch`。

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
| `tsk` | the task data | `tsk list --all --json \| head -c 200` |
| `hc` | starts a task's agent and finds its terminal again | `hc ls --json \| head -c 200` |

`hc` ships with Herdr, so the last row is a check, not an install. Without it `Start` falls back to a plain
`tab.new` tab: the agent runs, but the panel cannot tell whether it is alive.

`tsk setup herdr` registers a pane in the **old** TUI's plugin system (`~/.config/herdr/plugins.json`), not in
Herdr desktop's layouts/mods — that is why this repo ships its own mod.

## Layout

```
root row
├── sidebar (px 268)              brand / spaces + agents / footer —— as in main
└── work column
    ├── tabs-row (px 42, padding [0, 8])
    │   tabs(weight 1) │ tsk-toggle(px 74)
    ├── work-body row (padding 8, gap 8)
    │   ├── main                    the active tab's terminals
    │   ├── panel (px 368, hidden)  main's own files / changes stack
    │   └── tsk-panel (px 330, min 260, max 620)
    └── status (px 28)
```

The toggle is the same mod as the panel, with `props: {role: "toggle"}`:

```json
{ "id": "tsk-toggle", "type": "block", "size": { "px": 74 },
  "content": { "mod": "tsk", "props": { "role": "toggle" } } }
```

and each column is a wrapper (which is what drags) around a block (which fills it):

```json
{ "id": "tsk-panel", "type": "column", "size": { "px": 330 }, "min": 260, "max": 620,
  "children": [ { "id": "tsk", "type": "block", "content": { "mod": "tsk" } } ] }
```

Widths are remembered when you drag them. `main` keeps ~1150px for itself, so at 1920 the column fits with the
sidebar rail (76px); with the full 268px sidebar, or below ~1440, close the column. `ctrl-shift-b` folds the
sidebar, `ctrl-shift-l` goes back to `main`.

## What the tsk column reads

One exec, two commands, split by a marker (`--done` is a separate view, and only both together are the table):

```sh
tsk list --all --json
printf "\n@@tsk-done@@\n"
tsk list --all --done --json
```

- Refetched on the interval the strip's chips set — `off`, `5s`, `15s`, `1m`, `5m`, remembered in this mod
  copy's `localStorage` and defaulted by the block's `props.poll` — and immediately when the column comes
  back, after a write, or when you press ⟳. `off` still notifies: only polling stops.
- Rows group by project: **the project your active space's folder is (or is inside) sorts first and unfolds**;
  the rest follow by how much needs you, then total, then name. Projects with no live task stay hidden unless
  a space is open in them.
- Each task shows `T<n>`, a status dot, the title, and thread/assignee chips. An agent's terminal shows as a
  terminal chip while that terminal is live — colored while it works, with the agent's own name (`Pi`) beside it —
  and clicking it brings that terminal forward. A small archive icon at the end of the row takes the task off the
  board (see below).
  Opening a task shows the block reason or `review: 2/3 checks`, then `Open` / `Stop` for its terminal and
  `Start` / `Done`, and a last line naming **who runs it and where**: the agent's icon, `Pi · Fosun Work / 1`
  (agent · space / tab) and `working` or `idle`. That line is a shortcut to the terminal too.
- The strip counts `review` / `blocked` / `started`; `review + blocked` also goes into
  `shared("tsk.attention")`, which is the badge on the tab-bar button.
- The capture input is `tsk add`: it lands in the current space's project, or on the desk without a match.
  The `□` on a project card opens tsk's own board with `tab.new {folder, argv: ["tsk"]}`.

### Start runs an agent on the task

`Start` (on an `open` or `ready` task, or on a `started` one whose agent is gone) does two things:
`tsk status T<n> started`, then `hc run --bg` starts the agent in a terminal of its own, with the task's brief
as its last argument — the same shape `tsk dispatch` uses for an agent profile:

```text
hc run --bg --json --no-parent --keep --name tsk-12 --label tsk=T12 \
       --label herdr.space=<this space> --label herdr.tab=<this tab> \
       --cwd <project> -- /Users/you/.bun/bin/pi <brief>
```

- `--bg` and `--no-parent`: the agent outlives the panel and the terminal that started it.
- The program is an **absolute path**, not `pi`. `hc` spawns with herdr-core's own environment, which has
  neither a login shell's `PATH` nor `~/.bun/bin`, so an agent Herdr calls installed still fails there with
  `spawn_failed: No such file or directory`. The panel resolves the program where it found `tsk` —
  `command -v`, then `~/.bun/bin`, `~/.local/bin`, `~/.npm-global/bin`, `~/.cargo/bin`, `/opt/homebrew/bin`,
  `/usr/local/bin` — and hands the result to `hc`.
- `tsk=T12` is the link. Herdr's live `terminals()` carries each terminal's labels, so every refetch finds the
  agent again — after a restart, a space switch, or a `Done` — with no state file of ours.
- `herdr.space` / `herdr.tab` make Herdr adopt the terminal into the window you pressed Start in, so it is a
  normal tab, not a hidden one.
- Who and where come back from the same record: `program` gives the agent's name (`Pi`) and its icon, and
  herdr-core turns those two labels into `labels.where` — `Fosun Work / 1`, the space and tab by name. The panel
  reads them; it never looks spaces or tabs up itself.
- If `hc` will not start the agent the task goes **back to the status it had** and the notice says why, rather
  than leaving a started task with nothing running. `hc` reports failures as JSON on stderr; the panel shows
  its `message` (and `hint`) rather than the raw object.

Which agent: `knownAgents()` — Herdr's own list of the agents installed on this machine, most picked first.
Pin one in the layout instead:

```json
{ "id": "tsk", "type": "block",
  "content": { "mod": "tsk", "props": { "agent": "codex" } } }   // by key or name
{ "content": { "mod": "tsk", "props": { "run": ["pi"] } } }        // an exact argv
{ "content": { "mod": "tsk", "props": { "agent": "none" } } }     // status only, no agent
```

Without a match the task is only marked started and the notice says so — nothing is silently launched.

### A task that moves raises a notification

Every refetch is diffed against the one before it, and each task whose status changed gets one notification:
`tsk · review` / `started` / `done` / `blocked` / `ready` / `open`, with `project · T<n> title` under it, and a
level — a block is an error, a review a warning, a done task good news. That covers the two cases the column
exists for — an agent hands work back for review, and a task is closed — as well as anything else that moves in
the store, whether it moved in the panel or in a terminal.

- More than three moves in one refetch arrive as a single counted notice (`tsk · 4 changed`,
  `3 review · 1 done`) rather than a stack.
- Moves the panel made itself (`Start`, `Done`, the archive icon) are written into the baseline before the refetch, so pressing a
  button never notifies you about your own click. A move made in tsk's CLI does.
- The first refetch after the mod starts only sets the baseline: opening Herdr never replays old news.
- Notifications go through Herdr's own `notify()`, so they appear as Herdr toasts — no Automation permission,
  no `osascript`, nothing macOS-only about them.
- Knobs, in the panel block's props: `{ "notify": false }` turns them off, `{ "sound": "Glass" }` adds a
  system sound (silent by default, via `playSound`), `{ "poll": "off" }` sets the default interval.

One limit: notifications need the panel's mod running, which starts the first time the column shows in this app
run — hide it afterwards and they keep coming, never show it and there is nothing to poll. With the interval on
`off` there is nothing to diff either: use `5s`–`1m` if you rely on the notices.



### tsk across the projects you have open in Herdr

The link is a path on both sides: Herdr knows space → `folder`, tsk knows task → `project` (absolute), and
`matchesFolder(project, folder)` is the whole join — a space opened in a subdirectory of a repo still matches.
So the column answers "where do the repos I am working in stand", and `□` opens tsk's board in the right
directory without a `cd`. Writes go through the real CLI (`add`, `status`, `archive`), never the database: `add -t
<title> [-p <path>|--desk]`, `status T12 started`, `status T12 done`, `archive T12`; exit 0 is success and
anything else prints the command's own stderr.

Archive is the panel's remove: tsk's command line has no delete (only its TUI task page does), so the icon runs
`tsk archive T<n>`, which drops the task from every working view and keeps its number and status. `tsk unarchive
T<n>` puts it back — nothing is lost, and the panel says so after each click.

Limits: `--all` reads the global store, so projects with no open space still appear (further down), and the
column never switches spaces for you. `tsk list --json` has no steps progress, so rows show thread, assignee,
block reason and review checks only — and the last three need tsk 0.11 or newer (0.10.1 prints just
`id/number/project/status/thread/title`, so those rows simply stay empty).

## Test

```bash
make test     # node --test tests/  —— model.js, no Herdr needed
make check    # + herdr-app check mods/tsk (QuickJS rules node does not catch)
```

`model.js` imports nothing from `herdr`: parsing, grouping, sorting, argument building, the `hc run` arguments,
terminal matching and the notice text live there. `main.js` is views only.

## Files

```
layouts/herdr-work.json   the layout (a clone of main 0.1.14)
layouts/herdr-work.png    its screenshot
preview.png               the column open
mods/tsk/main.js          the tsk column + the tab-bar button (the only file importing herdr)
mods/tsk/model.js         tsk output → rows / projects / progress; add and status arguments; hc arguments and
                          terminal matching; notice text
mods/tsk/mark.svg         the mark; icons/ has the 16 stroke icons
tests/model.test.mjs      27 tests
install.sh, Makefile      install, check, screenshot, pull the layout back from Herdr
RECIPE.md                 the brief this layout was built from — read it before changing anything
```

## Credits

- [smarzban/tsk](https://github.com/smarzban/tsk) — the task store behind the column, and the `dispatch` this
  panel's `Start` follows the shape of.

Listed in the Herdr gallery: <https://herdr.dev/layouts/lingfromSh/herdr-layouts/>. MIT.
