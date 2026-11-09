# RECIPE — herdr-work 为什么长这样

给未来改这个布局的人（包括我自己）。这里只写「构建做了什么、为什么」，不写用法 —— 用法在 `README.md`。

## 一句话

`main` 布局 + 一个 tsk 面板列 + 一个 skillshare 面板列 + 顶栏两个开关。别的不动。

## 为什么是「克隆 main + 加列」而不是从零写

Herdr 的布局是一棵节点树，节点只有 `row / column / block` 三种，能做的事就那些：
`{id, size:{px|weight}, min, max, hidden, background, border, radius, padding, gap, divider, resizable, window_drag, floating}`。
只有根节点能写 `titlebar / traffic_lights / preview / theme / colors / font`。

所以任何「在现有桌面上加一块」的需求，正确答案都是 `layout.clone`：

```bash
herdr-app do layout.clone '{"name":"main","as":"herdr-work"}'
```

克隆会写进 `cloned_from:{name:"main",version:"0.1.14"}`，Herdr 的布局列表拿它做「派生自」的标注。
之后改 JSON 就是改她的副本，`main` 以后怎么变都不会把这份改回去 —— 代价是 `main` 的升级要手动跟。
跟的办法：重新 clone 一份、把下面两段补回去，或者 `make pull` 把线上那份拉回仓库对比。

## 三处改动

### 1. 顶栏变成一行：tabs + 两个开关

`main` 里 `tabs` 是一个 `px 42` 的 block，直接坐在 `work` 这一列里。要往同一行加东西，就得把它包进一个 row，
否则每加一个兄弟节点，`work` 会把它们竖着排下去。

```json
{ "id": "tabs-row", "type": "row", "size": { "px": 42 }, "resizable": false, "children": [
  { "id": "tabs", "type": "block", "size": { "weight": 1 }, "window_drag": true, "content": { "mod": "tabs" } },
  { "id": "tsk-toggle", "type": "block", "size": { "px": 74 }, "content": { "mod": "tsk", "props": { "role": "toggle" } } },
  { "id": "skillshare-toggle", "type": "block", "size": { "px": 108 }, "content": { "mod": "skillshare", "props": { "role": "toggle" } } }
] }
```

- `weight: 1` 给 tabs，另外两个 `px` 固定：开关不该跟着窗口宽度变胖。
- `window_drag: true` 留在 tabs 上，顶部那一条仍然能拖窗口。
- `resizable: false`：这一行是 chrome，不是工作区，不给拖。

`props.role` 是 mod 自己的约定：`role:"toggle"` 的实例只画一个按钮，点它就是 `layout.toggle {id:"<panel>"}`。
一个 mod 两种形态，省得为一个按钮再写一个 mod —— skillshare 的 herdr mod 也是这么干的（`role` 缺省是面板）。

### 2. 面板放在 `work-body`，不放在每个 space 的 `panel` 栈里

这是整件事最关键的一条，值得抄在墙上：

> Herdr 的 tabs 模块按 **space** 还原 `panel` 栈。把面板放进那个栈，切个 space 面板就没了。

`main` 的 `panel`（px 368，`hidden: true`）就是这么一个栈，里面是 files/changes。布局节点的 `hidden` 不一样，
它是**布局点击**（`layout.hide / layout.show / layout.toggle`）留下的状态，Herdr 跨 space、跨重启都保留。
所以新面板一律是 `work-body` 的直接子节点：

```json
{ "id": "tsk-panel", "type": "column", "size": { "px": 324 }, "min": 260, "max": 620,
  "children": [ { "id": "tsk", "type": "block", "content": { "mod": "tsk" } } ] }
```

外面那层 `column` 不是多余的：它才是可拖宽度的那个节点（`min/max` + 缺省 `resizable`），
里面的 `block` 被它撑满。直接给 block 写 `px` 也能显示，但拖不动。

宽度怎么定的：1920 的屏上 `main` 还剩 ~1070px，够放 board；再窄（<1440）就建议关掉一列。
`skillshare-panel` 默认可见 —— 这个布局的卖点就是三件事并排；不想看见就点顶栏那个开关，Herdr 记得住。

### 3. tsk 用原生面板，不嵌 TUI

`tsk` 自己带一个全屏 board（crossterm TUI）。把它塞进 `terminal` block 也能用，但那样侧栏就成了一个终端：
点它得先给焦点、看的是 80 列的 ASCII、每 20 秒还得担心 TUI 重绘。侧栏要的是三行摘要。

于是走 `--json`：

```sh
tsk list --all --json
printf "\n@@tsk-done@@\n"      # done 是另一个视图，一次 exec 里跑两遍，用一个标记切开
tsk list --all --done --json
```

一次 `exec` 而不是两次：Herdr 的 `exec` 是一次进程调用，两次就要两个 await + 两个错误分支，
而且两次之间数据可能已经变了。代价是要解析两段 JSON，`parseList` 就是干这个的（切标记、各自 `JSON.parse`、
状态归一化、数字化 `number`）。

要知道但不用改的事：

- `--all` 走的是 tsk 的全局库，所以**没有开 space 的项目也在里面**。排序把「当前 space 命中」的顶到前面就够了，
  过滤掉反而会看不见手边就有的活。
- `tsk list` 的 `--json` 里没有 steps 进度，行里只放 `thread` / `assignee` / `block` / `review`。
- 写操作只有三个，全走 CLI：`add -t`、`status T<n> started`、`status T<n> done`。不碰 tsk 的库。
  退出码 0 才算成功，1（refusal）/2（usage）/3（storage）把 stderr 原文贴出来 —— tsk 的报错比我们能编的好。
- 想开 board 就 `tab.new {folder}` —— 在项目的**正确目录**里开，省掉 `cd`；tsk 只看得到 cwd 往上找到的项目。

## 数据流

```
space.folder ─┐
focused.cwd  ─┴→ openFolders() ─┐
                                ├→ buildProjects(live, done, folders) → 排序/展开/进度
tsk list --all --json ──────────┤
(@@tsk-done@@) tsk list …--done ┘
                                        ↓
                    totalsOf() → strip 那行 / shared("tsk.attention") → 顶栏角标
```

- 20 秒轮询，`layout.hide` 期间跳过（`find(layout(),"tsk-panel").hidden`），重新显示时立刻刷一次。
- 首屏只自动展开「当前 space 命中」的项目；之后展开状态归用户，刷新不覆盖。
- `shared("tsk.attention")` 是给开关按钮用的：面板关着也知道有几条在 review/blocked。

## 改的时候注意

- **QuickJS**：`??` 不能和 `||`/`&&` 直接混用（要加括号），`node --check` 不报，`herdr-app check` 报。
  改完 `make check`。
- 视图里不许 `setShared` / `cx.notify`（渲染中被拒）；要改状态就 `later(cx, …)`。
- `.child(null)` 会炸；用 `.children([…].filter(Boolean))` 或 `.when()`。
- 不要留着 `cx` 到回调之外。
- 颜色只用 `theme()` 的 token；`S()` 的字号从 `settings().ui_font_size` 推，别写死 px。
- 装 mod **必须复制**进 `~/.config/herdr-app/mods/`，软链热加载不到。
- 元素 id 里带路径要过一遍 `idOf()`（路径有 `/`），否则会撞 id。

## 想加的变体

- **只想要 tsk**：删掉 `skillshare-toggle` / `skillshare-panel` 两个节点，`tsk-panel` 宽度调到 420。
- **换成第三个面板**：照抄 `tsk-panel` 那一段，`id` 换掉，`content.mod` 换成目标 mod（前提它支持 `role:"toggle"` 或你不用开关）。
- **不想要 desk**：`buildProjects` 里 `desk: !row.project` 的项目就是 desk 组，直接 `if (p.desk) return false`。
- **看全部（含 done-only 的项目）**：`buildProjects(live, done, folders, {showDoneOnly:true})`。

## 验证

```bash
make test                                  # model.js，无需 Herdr
make check                                 # + herdr-app check mods/tsk
herdr-app do layout.switch '{"name":"herdr-work"}'
herdr-app shot layouts/herdr-work.png      # 截图进仓库
```

`preview.png` 是真人窗口的截图，不是设计稿 —— 里面是真实项目名，换人用之前记得换掉数据或重拍。
