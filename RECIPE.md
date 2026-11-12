# herdr-work

Herdr's `main` layout with one column added beside the terminal: tsk's task progress across every
tsk project (what waits on your review, what is blocked, what is moving), and one button that starts an
agent on a task through `hc` and finds that agent again afterwards. The column is switched from the tab
bar, so a narrow window can drop it without losing it.

![herdr-work](preview.png)

## What you see

Left to right, the window is still `main`'s:

- **Sidebar** (`px 268`, `min 44`, `max 480`, not resizable): brand, `spaces`, `agents`, footer — untouched
  from `main`. Narrowed under 160px it becomes the numbered rail that `main` ships.
- **Work column** (not resizable), three rows: the tab bar, the body, the status bar.
- **Tab bar row** (`px 42`, not resizable, `padding [0, 8]`): the tabs strip (`weight 1`, keeps
  `window_drag`) then one fixed button — `tsk-toggle` (`px 74`). It is the same mod as the panel with
  `"props": {"role": "toggle"}`: a 26px-high rounded button with the mod's mark, the name at 12px, and a
  count pill when something needs you. The 8px right padding is what keeps the button off the window edge.
- **Body row** (`row`, `padding 8`, `gap 8`): the active tab's terminals, `main`'s hidden
  files/changes `panel` (`px 368`, `min 280`, `max 900`, `hidden`), `tsk-panel` (`px 330`, `min 260`,
  `max 620`).
- **Status bar** (`px 28`), unchanged.

The tsk column is a card: white surface, 10px radius, 1px border, one column of:

- header: `tsk` mark, the word `tsk`, the subtitle `3 projects · 7 live`, a refresh icon and a close icon;
- a strip of at most three chips — `review`, `blocked`, `started` — each a 6px dot plus `1 review`, with
  review and blocked in their status colour and started in muted; `nothing needs you` when empty; the count
  of finished tasks (`1 done`) pinned right;
- a filter input (`Filter tasks`), a `Board` button and a row of interval chips — `off`, `5s`, `15s`,
  `1m`, `5m` — one of them selected;
- one card per project: name, `4 live · 1 done`, a progress bar (one colour segment per status, done
  at half opacity), the attention pills (`1 review`, `1 blocked`), and the tasks — `T3` in the status
  colour, the title, thread/assignee chips when set, and a terminal chip when an agent runs for it;
  clicking a task unfolds `why blocked`, `review: 2/3 checks`, the last activity line, `Open` / `Stop`
  for its agent's terminal, and `Start` / `Done`; an archive icon sits at the end of every row;
- a capture input at the bottom: `new task → aurora-api`, placeholder `New task — Enter adds it`.

Colours are Herdr theme tokens only: `review` = `accent`, `blocked` = `blocked`, `started` = `working`,
`ready` = `done`, `open` = `muted`, `done` = `dim`. Type sizes derive from `settings().ui_font_size`
(title +1, body +0.5, secondary −0.5, label −1).

## How it behaves

- On mount, and on the interval the chips select (`off`, `5s`, `15s`, `1m`, `5m`; default 15s, or
  `props.poll`), the panel runs one `exec`: `tsk list --all --json`, a `@@tsk-done@@` marker, then
  `tsk list --all --done --json`. A 1s `cx.spawn` loop compares `Date.now()` with the last fetch rather
  than ticking on a timer, so changing the interval applies at once and `off` stops polling without
  killing the loop; a refetch always runs right after a write, and when the column is shown again.
- Every refetch is diffed against the previous one and each task whose status changed posts one notice
  through Herdr's `notify()`: `tsk · <status>` over `<project> · T<n> <title>`, with a level (`blocked`
  error, `review` warning, `done` success), batched into `tsk · N changed` past three, with the optional
  `playSound(props.sound)`. The first refetch only records a baseline, so opening Herdr never replays old
  news, and moves the panel made itself are written into the baseline before the refetch so your own
  `Start` / `Done` click never notifies you.
- Agent liveness: every refetch also reads herdr-app's live `terminals()` — no `hc ls` subprocess — and
  matches a task's terminal by its `tsk=T<n>` label, falling back to its `t<n>` name. The row then shows a
  terminal chip (working / idle) that calls `terminal.show`; Herdr stops listing a terminal once it exits, so
  the chip is there exactly while the agent runs, and the unfolded row offers `Stop` (`hc kill <address>`).
- Grouping: projects hold tasks; a project is "the current one" when any open space's folder
  (or the focused terminal's cwd) is that path or inside it. The current project sorts first and unfolds
  by itself on the first load; everything else follows sorted by how much needs you, then total, then name.
  Projects with no live task are dropped unless an open space sits in them; tasks in the done view mark
  `1 done` and never show as rows.
- The tab-bar button toggles the layout node: `layout.toggle {id: "tsk-panel"}`. Its pill reads
  `shared("tsk.attention")` — review plus blocked across all projects — so the count is visible with the
  panel closed.
- Clicks: toggle button → hide/show the column; close icon → `layout.hide`; refresh icon → refetch now;
  interval chip → store the choice and refetch (except `off`); `Board` → `tab.new` running `tsk` in that
  project's folder (its own cwd when the project is the desk); a project header → fold/unfold; a terminal
  chip → `terminal.show`; `Start` → `tsk status T<n> started`, then `hc run --bg --json --no-parent
  --keep --name t<n> --label tsk=T<n> [--label herdr.space=<space> --label herdr.tab=<tab>] --cwd
  <project> -- <agent argv...> <brief>`, so the agent runs in its own background terminal, adopted into
  the current tab, carrying the label that lets the panel find it again; `hc` missing falls back to a plain
  `tab.new`, and any other `hc` failure puts the task back to its previous status and says why; `Done` →
  asks first when the task has an agent terminal (`Done + close` / `Keep` / `✕`), then `tsk status T<n> done`
  and, on close, `tab.close {id, confirmed: true}` for a tab holding only that terminal or `hc kill` for a
  split; the archive icon → `tsk archive T<n>`; all refetch on success and print the
  command's own error text on failure.
- Typing: the filter narrows projects and tasks as you type; the capture input adds a task on Enter
  (`tsk add -t <title>`, plus `-p <path>` or `--desk`), and Escape clears the filter. The panel has no
  keys of its own and ships no `keys.json`; everything else is Herdr's.
- Nothing moves on its own except the progress bars (they follow `tsk`'s data), the interval loop and the
  pill count.

## Built from

Node tree in `layouts/herdr-work.json`, a `layout.clone` of `main` 0.1.14 (`cloned_from` records it):

```
root (row, titlebar none, traffic_lights [12,16])   ← from main
├── sidebar (column px 268)                          ← from main
└── work (column, resizable false)                   ← from main
    ├── tabs-row (row px 42, resizable false, padding [0,8])   ← new wrapper
    │   ├── tabs          (block weight 1, window_drag, mod "tabs")
    │   └── tsk-toggle    (block px 74,  mod "tsk",       props {role:"toggle"})
    ├── work-body (row, padding 8, gap 8)            ← from main, children added
    │   ├── main        (block, the active tab's terminals)
    │   ├── panel       (column px 368, hidden)      ← from main, files/changes
    │   └── tsk-panel   (column px 330, min 260, max 620) [block mod "tsk"]
    └── status (px 28)                               ← from main
```

`mods/tsk/` — one mod, two roles via `props.role`: `panel` (a `View`) and `toggle`.

- `main.js` imports `herdr` and draws both. `herdr` calls: `exec`, `hc`, `run`, `spaces`, `focused`,
  `terminals`, `home`, `knownAgents`, `notify`, `playSound`, `shared`, `setShared`, `theme`, `settings`,
  `layout`, `props`. Drawing uses `gpui-kit` (`View`, `div`, `image`, `svg`) and `gpui-base` (`v_flex`,
  `h_flex`, `InputState`, `Input`). Commands it runs: `layout.toggle`, `layout.hide`, `terminal.show`,
  `tab.new` (fallback and Board), and `hc run` / `hc kill` through `hc()`.
- `model.js` has no Herdr imports: `LIST` (the two-command shell script), `PATHS` (prepends
  `~/.local/bin`, `~/go/bin`, `/opt/homebrew/bin`, `/usr/local/bin`), `parseList` (splits on the marker,
  parses both arrays), `buildProjects`, `totalsOf`, `filterTasks`, `filterProjects`, `idOf`,
  `addArgs`, `statusArgs`, `boardOf`, `taskHint`, `INTERVALS` / `DEFAULT_POLL` / `parsePoll` /
  `pollLabel`, for Start: `hcRunArgs` (the linked path), plus `agentBrief`, `pickAgent`, `launchArgs` (the
  no-`hc` fallback), for liveness: `taskTerminal`, `isLive`; and for the notices: `snapshotOf`,
  `changedTasks`, `alertPlan` (with `ALERTS_MAX = 3` and a `level` per notice).
- Which agent Start runs: `props.run` if the panel block carries one (an argv, e.g. `["pi"]`), else
  `knownAgents()` (Herdr's list of agents with a `run`, most picked first) filtered to what is installed,
  matched by `props.agent` (key or name) or else the first; `props.agent: "none"` makes Start status-only.
- Programs it runs: `tsk list --all --json`, `tsk list --all --done --json`, `tsk add -t <title>
  [-p <path>|--desk]`, `tsk status T<n> started|done`, `hc run …`, `hc kill <address>`,
  `tab.new {folder, argv:["tsk"]}`. Never the database; a non-zero exit prints the command's last stderr
  line.
- Art: `mark.svg` (the tsk check mark) and 16 stroke icons in `icons/` (`refresh`, `close`, `search`,
  `chevron-*`, `folder`, `desk`, `thread`, `bot`, `alert`, `check`, `plus`, `terminal`). No images, no
  network calls beyond `exec`.

## Watch out

- **Do not put these panels in `main`'s `panel` stack.** The `tabs` mod rebuilds that stack per space, so a
  column added there disappears on a space switch. A layout node's own `hidden` is a layout click: it
  survives space switches and restarts.
- Give the *wrapping column* the `size` / `min` / `max`, never the inner block — the column is what drags,
  the block just fills it. `padding` on a `row` pads both sides (`[vertical, horizontal]`), which is how
  the tab bar gets its 8px right margin without shifting the tabs strip.
- Width budget at 1920: `main` will not go much under ~1150px, so `268 (full sidebar) + 1150 + 330`
  overflows and the column is pushed off-screen. It fits with the sidebar rail (76px); below 1440 hide the
  column. Trying to shrink `main` instead does nothing.
- **QuickJS**: `??` may not mix with `||` or `&&` without parentheses — `node --check` accepts it,
  `herdr-app check` does not. Run `make check`.
- No `setShared` or `cx.notify()` during render; state changes go through `later(cx, …)` or a spawn.
  `.child(null)` throws — use `.children([…].filter(Boolean))` or `.when()`.
- Element ids carry project paths and task ids, so they go through `idOf()`; the same id twice in one tree
  is a bug.
- Editing a mod in place does not always reload it in a running window; a fresh folder name (or a restart)
  does. Install by copying — a symlinked mod is not picked up.
- A mod reaches `exec` and `hc`, so this layout runs `tsk` and `hc` from your `PATH`; `tsk` missing shows
  the install hint in the panel instead of an empty card. Start goes through `hc run`, so an agent Herdr
  cannot find installed is reported by `hc` and the task is put back to the status it had — nothing is
  marked started with nothing running.
- `hc` is not the shell that found the agent: it spawns with herdr-core's environment, which carries no
  login-shell `PATH` and no `~/.bun/bin`, so `hc run … -- pi` fails `spawn_failed` while Herdr happily lists
  pi as installed. `resolveRun` asks the panel's own `sh` for `command -v <program>`, falls back to the usual
  install folders, and passes `hc` an absolute path. Any agent whose launcher lives outside those folders
  still needs `props.run` with an absolute path.
- `hc` reports failures as one JSON object on stderr; `hcError` unwraps `error.message` (+ `hint`) so the
  notice reads `cannot start "pi": No such file or directory (os error 2)`, not the object.
- `tsk list --json` carries no steps progress, so rows show thread, assignee, block reason and review
  checks but no step count. `block` and `review` are present **only while the task is in that state** (tsk
  ≥0.13; 0.10.1 printed neither), so read them as optional, never as `null`-always fields. `--all` reads the
  global store: tasks of projects with no open space still appear, just further down.
- tsk's command line has no delete — only its TUI task page does — so the panel's remove is `tsk archive
  T<n>`: the task leaves every working view and keeps its number and status, and `tsk unarchive T<n>` puts it
  back. Never write the store to delete; the archive icon is one click and says how to undo it.
- `hc run --name` accepts only `a-z 0-9 - _` (1–32) and refuses what looks like a terminal id, so the
  terminal is named `tsk-12` (`t12` is rejected) and carries the label `tsk=T12`; the label is the link, the
  name only the fallback. Labels are what `terminals()` exposes, which is why no address is stored anywhere.
- Herdr lists a terminal while it lives and drops it when it exits, so the chip marks "an agent is on this
  now", not "ever started"; a task left `started` with no chip therefore offers `Start` again.
- `tab.close` ends **every** terminal in the tab, so `Done` never closes one unasked: the row asks
  `Done — close its tab too?` whenever the task has a terminal. A tab's terminal count comes from
  `spaces()[i].tabs[j].panes`, which is a **number**, not a `terminals` array (tab keys: `id, index, name,
  named, active, status, panes, zoomed, settled, settled_at, changed_at, working_since`); `1` means the
  agent's own tab and it goes with the task, `>1` means a split and only the agent's terminal is killed.
- The brief is the agent's **last argv argument**, the same shape tsk's own `dispatch` uses: once you
  configure an `[agent.<name>]` profile in `~/.tsk/config.toml` and upgrade to tsk ≥0.13, let `tsk status
  T<n> started` do the dispatch (worktree, branch, prompt) and keep this panel's `hc run` for setups without
  a profile. Two dispatchers on one task is a bug.
- Banners became Herdr notices (`notify()`, plus `playSound`) so they need no Automation permission and are
  not macOS-only; the panel still needs its mod running, which happens the first time the column shows in
  this app run. With the interval on `off` nothing is diffed, so nothing notifies.
- `terminals()` records carry more than the label: `program` (`{key: "pi", name: "Pi", icon: "icons/pi.svg",
  tint: true}`) names the agent, and herdr-core writes `labels.where` — `Fosun Work / 1`, space / tab — from the
  `herdr.space` / `herdr.tab` labels `hc run` was given. The panel renders those two and looks nothing up, so the
  who-line is `program.name` + `labels.where`. `program.icon` is an app-relative path: `svg()` it when `tint`,
  `image()` it otherwise (the agents mod's `icon()` helper is the same two lines).
- A notice needs the mod to be running, which happens the first time the column is shown in this app run:
  hide it afterwards and notices keep coming, never show it and nothing polls. `props.notify: false` mutes
  them, `props.sound: "Glass"` adds a system sound (silent by default), `props.poll` sets the default
  interval.

## Done when

- `herdr-app check mods/tsk` prints `check passed: mods/tsk` and `node --test tests/` passes (31 tests).
- `herdr-app do layout.switch '{"name":"herdr-work"}'` shows two columns: terminal, tsk, with the button at
  the right end of the tab bar and 8px of space after it.
- The panel lists the project your active space sits in first, unfolded, with the rest below; the header
  subtitle counts projects and live tasks; the strip shows review/blocked/started chips that fit inside the
  column.
- `layout.hide {id:"tsk-panel"}` hides the column, the tab-bar button no longer looks selected, and its pill
  still shows the review + blocked count; `layout.toggle` brings the column back with fresh data at once.
- `Start` on a row makes the task `started` in `tsk list --all --json` within the next refresh, and
  `hc ls --json --label tsk=T<n>` shows a live terminal running the agent; the row then carries a terminal
  chip, `Stop` kills it and the chip goes away. Opening that row shows `Pi · <space> / <tab>` and `working` or
  `idle` under the buttons, and clicking that line focuses the terminal. `Done` sets the task `done`, the
  archive icon removes the row and `tsk unarchive T<n>` brings it back. A
  capture like `Write the changelog` appears as a new task in the current space's project.
- The interval chips switch the refetch rate at once (`off` stops it), and the choice survives a restart.
- With the column hidden and another app in front, `tsk status T<n> review` in a terminal raises a Herdr
  notice within one interval (`tsk · review` / `<project> · T<n> <title>`); pressing `Start` in the panel
  does not.
