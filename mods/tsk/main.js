// tsk beside your agents: every tsk project's progress at a glance — what waits on your review,
// what is blocked, what is moving — with the current space's project first, and one keystroke to
// start a task, finish it, or open tsk's own board in a tab.
//
// Roles (props.role): the panel (default), and "toggle", the tab-bar button that shows or hides
// the layout's "tsk-panel" node. The toggle reads the shared attention count the panel writes, so
// the tab bar shows how many tasks wait on you even while the panel is hidden.
import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { exec, run, spaces, focused, home, shared, setShared, theme, settings, layout, props as blockProps } from "herdr";
import {
  STATUSES, LABEL, LIST, PATHS, parseList, lastLine, buildProjects, totalsOf, filterTasks,
  filterProjects, idOf, addArgs, statusArgs, boardOf, taskHint,
} from "./model.js";

const PANEL = "tsk-panel"; // the layout node the toggle shows and hides; hidden state is the layout's, so it survives space switches
const ATTENTION = "tsk.attention"; // shared: tasks in review or blocked, for the tab-bar badge
const DESK = "·desk"; // the expanded-set key for tasks that belong to no project
const POLL = 20000, NOTICE_MS = 5000;

// ---- Running tsk ----

// Herdr's exec has a 30s limit and the usual PATH may miss ~/.local/bin.
const sh = (script, args = []) => exec("sh", ["-c", `${PATHS}\n${script}`, "tsk-panel", ...args], { timeout: 20000 })
  .catch((e) => ({ code: 127, stdout: "", stderr: String((e && e.message) || e) }));
const tsk = (args) => sh('exec tsk "$@"', args);

// Work started from render. cx.spawn runs its body up to the first await at once, and
// cx.notify() throws while a view renders, so the work starts after the render ends.
const later = (cx, fn) => cx.spawn(async (cx) => { await cx.sleep(0); return fn(cx); });

const activeSpace = () => spaces().find((s) => s.active) || null;

function S() {
  const b = Number(settings().ui_font_size) || 13;
  return { title: b + 1, body: b + 0.5, secondary: b - 0.5, button: b - 0.5, label: b - 1 };
}

// ---- Look (Herdr theme tokens only) ----

const icon = (name, size, color) => svg(`mods/tsk/icons/${name}.svg`).size(size).flex_none().text_color(color);
const stop = (_e, cx) => cx.stop_propagation();
const dot = (color, size = 8) => div().w(size).h(size).flex_none().rounded_full().bg(color);

const STATUS_COLOR = (t, status) => ({
  review: t.accent, blocked: t.blocked, started: t.working, ready: t.done, open: t.muted, done: t.dim,
}[status] || t.muted);

function primary(id, label, t, onClick, opts = {}) {
  const h = opts.h || 26;
  return h_flex().id(id).h(h).px(opts.px || 10).gap(5).flex_none().items_center().rounded(6).bg(t.solid)
    .text_size(opts.size || S().button).font_semibold().text_color(t.solid_foreground).cursor_pointer()
    .hover((s) => s.opacity(0.88)).on_mouse_down("left", stop).on_click(onClick)
    .when(Boolean(opts.icon), (el) => el.child(icon(opts.icon, 12, t.solid_foreground))).child(label);
}

function secondary(id, label, t, onClick, opts = {}) {
  const c = opts.color || t.foreground, h = opts.h || 26;
  return h_flex().id(id).h(h).px(opts.px || 10).gap(5).flex_none().items_center().rounded(6)
    .when(!opts.quiet, (el) => el.border_1().border_color(t.border))
    .text_size(opts.size || S().button).text_color(c).cursor_pointer().hover((s) => s.bg(t.hover))
    .on_mouse_down("left", stop).on_click(onClick)
    .when(Boolean(opts.icon), (el) => el.child(icon(opts.icon, 12, c))).child(label);
}

const pill = (text, t, c) => h_flex().h(19).px(7).flex_none().items_center().rounded(10).bg(t.selected)
  .text_size(S().label).text_color(c || t.muted).child(text);

const note = (t, text) => div().text_size(S().secondary).text_color(t.muted).child(text);

function warnBox(t, text) {
  return h_flex().mx(10).mt(6).p(8).gap(7).items_start().rounded(6).bg(t.chrome).border_1().border_color(t.ansi1)
    .child(icon("alert", 13, t.ansi1)).child(div().flex_1().text_size(S().secondary).text_color(t.muted).child(text));
}

/** A project's shape in one strip: done as a hole, each status a colour, at most 96px wide. */
function bar(t, project, width = 80) {
  const c = project.counts, parts = STATUSES.filter((s) => c[s] > 0);
  const base = div().w(width).h(4).flex_none().rounded(2).overflow_hidden().bg(t.border);
  if (!project.total) return base;
  return h_flex().w(width).h(4).flex_none().rounded(2).overflow_hidden().bg(t.border)
    .when(project.done > 0, (el) => el.child(div().h_full().flex_grow(project.done).bg(t.done).opacity(0.5)))
    .children(parts.map((s) => div().h_full().flex_grow(c[s]).bg(STATUS_COLOR(t, s))));
}

function find(node, id) {
  if (node && node.id === id) return node;
  for (const child of (node && node.children) || []) { const f = find(child, id); if (f) return f; }
  return null;
}

// ---- The tab-bar button ----

function toggle() {
  const t = theme(), node = find(layout(), PANEL), on = node && !node.hidden;
  const waiting = Number(shared(ATTENTION)) || 0;
  return h_flex().size_full().pr(10).items_center().bg(t.chrome).border_b(1).border_color(t.border)
    .child(h_flex().id("toggle-tsk").h(26).px(8).gap(5).flex_none().items_center().rounded(6)
      .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop)
      .on_click(() => run("layout.toggle", { id: PANEL }))
      .child(image("mods/tsk/mark.svg").w(15).h(15).flex_none())
      .child("tsk")
      .when(waiting > 0, (el) => el.child(pill(String(waiting), t, t.accent))));
}

// ---- The panel ----

export default class Tsk extends View {
  init(_props, cx) {
    this.role = (blockProps() || {}).role || "panel";
    if (this.role === "toggle") return;

    this.handle = cx.focus_handle();
    this.projects = [];
    this.done = 0;
    this.error = null;
    this.loadedAt = 0;
    this.loading = false;
    this.token = 0; // execs from before an action are stale: their token no longer matches
    this.expanded = new Set();
    this.openTask = null;
    this.notice = null;
    this.noticeAt = 0;
    this.query = "";
    this.wasHidden = false;
    this.refreshed = false;

    this.filter = InputState.new({ placeholder: "Filter tasks" });
    this.filter.on("change", (_e, cx) => { this.query = this.filter.value(); cx.notify(); });
    this.capture = InputState.new({ placeholder: "New task — Enter adds it" });
    this.capture.on("submit", (_e, cx) => this.addTask(cx));

    const hidden = () => {
      const node = find(layout(), PANEL);
      return Boolean(node && node.hidden);
    };
    cx.timer.every(POLL, (cx) => { if (!this.loading && !hidden()) this.refresh(cx); });
  }

  // ---- Data ----

  refresh(cx) {
    if (this.loading) return;
    this.loading = true;
    const token = ++this.token;
    cx.spawn(async (cx) => {
      const r = await sh(LIST);
      if (token !== this.token) return;
      this.loading = false;
      if (r.code === 127) {
        this.error = "tsk is not on PATH — install it with `curl -fsSL https://gettsk.sh/install.sh | sh`";
      } else if (r.code !== 0) {
        this.error = lastLine(r.stderr) || `tsk list exited ${r.code}`;
      } else {
        const parsed = parseList(r.stdout);
        this.error = parsed.error;
        this.projects = buildProjects(parsed.live, parsed.done, this.openFolders());
        this.done = parsed.done.length;
        this.loadedAt = Date.now();
        this.refreshed = true;
        if (!this.expanded.size) {
          // First look: unfold whatever the open spaces are working in.
          for (const p of this.projects) if (p.active) this.expanded.add(this.keyOf(p));
        }
        setShared(ATTENTION, totalsOf(this.projects).attention);
      }
      cx.notify();
    });
  }

  /** Folders the open spaces sit in: a project holding one is the current one. */
  openFolders() {
    const folders = spaces().map((s) => s.folder).filter(Boolean);
    const f = focused();
    if (f && f.cwd) folders.push(f.cwd);
    return folders;
  }

  keyOf(project) { return project.desk ? DESK : project.path; }

  /** Element ids carry project paths and task ids: keep them to what an id may hold. */
  idOf(key) { return idOf(key); }

  say(kind, text, cx) {
    this.notice = { kind, text };
    const at = ++this.noticeAt;
    later(cx, async (cx) => {
      await cx.sleep(NOTICE_MS);
      if (this.noticeAt !== at) return; // a newer notice owns the line
      this.notice = null;
      cx.notify();
    });
  }

  /** Where a new task lands: the current space's project, else the desk. */
  captureTarget() {
    const active = this.projects.find((p) => p.active);
    return active || null;
  }

  addTask(cx) {
    const title = this.capture.value().trim();
    if (!title) return;
    const target = this.captureTarget();
    this.capture.set_value("");
    cx.spawn(async (cx) => {
      const r = await tsk(addArgs(title, target && !target.desk ? target.path : null));
      const added = r.code === 0 ? firstNumber(r.stdout) : 0;
      this.say(r.code === 0 ? "ok" : "warn",
        r.code === 0 ? `Added ${added ? `T${added}` : "a task"}${target ? ` to ${target.name}` : " to the desk"}`
          : lastLine(r.stderr) || `tsk add exited ${r.code}`, cx);
      cx.notify();
      this.refresh(cx);
    });
  }

  move(task, status, cx) {
    cx.spawn(async (cx) => {
      const r = await tsk(statusArgs(task.number, status));
      this.say(r.code === 0 ? "ok" : "warn",
        r.code === 0 ? `T${task.number} ${LABEL[status]}` : lastLine(r.stderr) || `tsk status exited ${r.code}`, cx);
      cx.notify();
      this.refresh(cx);
    });
  }

  /** tsk's own board, in a new tab of this space, scoped to that project's folder. */
  openBoard(project) {
    const b = boardOf(project, home());
    run("tab.new", { name: b.name, folder: b.folder, argv: ["tsk"] });
  }

  // ---- Render ----

  render(cx) {
    if (this.role === "toggle") return toggle();
    return this.panel(cx);
  }

  panel(ctx) {
    const t = theme();
    const node = find(layout(), PANEL);
    const shownNow = !(node && node.hidden);
    if (shownNow && this.wasHidden && ctx) later(ctx, (cx) => this.refresh(cx));
    this.wasHidden = !shownNow;
    if (!this.refreshed && !this.loading && ctx) later(ctx, (cx) => this.refresh(cx));

    const view = filterProjects(this.projects, this.query);
    const totals = totalsOf(this.projects);

    return v_flex().id("tsk").track_focus(this.handle).size_full().min_h(0).rounded(10).overflow_hidden()
      .bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(S().body)
      .child(this.header(t, totals, node))
      .child(this.strip(t, totals))
      .child(this.tools(t))
      .children([this.error ? warnBox(t, this.error) : null].filter(Boolean))
      .child(div().id("projects").flex_1().min_h(0).overflow_y_scrollbar().child(this.list(t, view)))
      .children([this.notice ? this.noticeRow(t) : null].filter(Boolean))
      .child(this.footer(t));
  }

  header(t, totals, node) {
    return h_flex().h(42).flex_none().pl(12).pr(8).gap(7).items_center().border_b(1).border_color(t.border)
      .child(image("mods/tsk/mark.svg").w(17).h(17).flex_none())
      .child(div().text_size(S().title).font_semibold().child("tsk"))
      .child(div().flex_1().min_w(0).truncate().text_size(S().secondary).text_color(t.muted)
        .child(this.loadedAt ? `${this.projects.length} projects · ${totals.total} live` : "reading tsk…"))
      .child(h_flex().id("refresh").size(24).justify_center().items_center().rounded(6).cursor_pointer()
        .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click((_e, cx) => this.refresh(cx)).child(icon("refresh", 13, this.loading ? t.accent : t.muted)))
      .when(Boolean(node), (el) => el.child(h_flex().id("close").size(24).justify_center().items_center().rounded(6)
        .cursor_pointer().hover((s) => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => run("layout.hide", { id: PANEL })).child(icon("close", 13, t.muted))));
  }

  /**
   * What waits on you and what is moving, in one line. Three chips at most and the
   * row clips: a 324px panel has no room for every status, and the cards carry the rest.
   */
  strip(t, totals) {
    const shown = ["review", "blocked", "started"].filter((s) => totals[s] > 0);
    const chips = shown.length
      ? shown.map((s) => {
        const loud = s === "review" || s === "blocked";
        return h_flex().flex_none().gap(4).items_center()
          .child(dot(STATUS_COLOR(t, s), 6))
          .child(div().text_size(S().label).text_color(loud ? STATUS_COLOR(t, s) : t.muted)
            .child(`${totals[s]} ${LABEL[s]}`));
      })
      : [div().text_size(S().label).text_color(t.muted).child("nothing needs you")];
    return h_flex().flex_none().h(26).px(12).gap(10).items_center()
      .child(h_flex().flex_1().min_w(0).overflow_hidden().gap(9).items_center().children(chips))
      .child(div().flex_none().text_size(S().label).text_color(t.muted).child(`${totals.done || this.done} done`));
  }

  tools(t) {
    return h_flex().flex_none().px(10).pb(8).gap(6)
      .child(h_flex().flex_1().min_w(0).h(28).px(8).gap(6).items_center().rounded(6).border_1().border_color(t.border).bg(t.chrome)
        .child(icon("search", 12, t.muted))
        .child(Input.new(this.filter).flex_1().min_w(0).h_full().text_size(S().secondary).text_color(t.foreground)))
      .child(secondary("desk-board", "Board", t, () => run("tab.new", { name: "tsk", argv: ["tsk"] }), { h: 28, px: 8 }));
  }

  list(t, projects) {
    if (!this.refreshed) {
      return v_flex().pt(2).gap(6).children([0, 1, 2].map((i) => div().mx(10).h(46).rounded(8).bg(t.chrome).opacity(1 - i * 0.2)));
    }
    if (!projects.length) {
      return v_flex().p(14).gap(6)
        .child(note(t, this.query.trim() ? "Nothing matches the filter." : "No live tasks."))
        .child(note(t, this.query.trim() ? "" : "Add one below — it lands in the space's project."));
    }
    return v_flex().pt(2).pb(10).gap(2).children(projects.map((p) => this.card(t, p)));
  }

  card(t, p) {
    const key = this.keyOf(p), open = this.expanded.has(key), c = p.counts;
    const tasks = filterTasks(p.tasks, this.query);
    const label = `${c.total} live${p.done ? ` · ${p.done} done` : ""}`;
    return v_flex().id(`project-${this.idOf(key)}`).mx(8).rounded(8)
      .when(p.active, (el) => el.bg(t.raised).border_1().border_color(t.border))
      .child(h_flex().h(32).pl(8).pr(8).gap(6).items_center().rounded(8).cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => {
          if (open) this.expanded.delete(key); else this.expanded.add(key);
          cx.notify();
        })
        .child(icon(open ? "chevron-down" : "chevron-right", 11, t.muted))
        .when(p.active, (el) => el.child(dot(t.working, 6)))
        .child(div().flex_1().min_w(0).truncate().text_size(S().body)
          .when(p.active, (el) => el.font_semibold()).child(p.name))
        .child(div().text_size(S().label).text_color(t.muted).child(label))
        .child(h_flex().id(`board-${this.idOf(key)}`).size(22).justify_center().items_center().rounded(5).cursor_pointer()
          .hover((s) => s.bg(t.selected)).on_mouse_down("left", stop)
          .on_click(() => this.openBoard(p)).child(icon("terminal", 12, t.muted))))
      .child(h_flex().pl(25).pr(8).pb(7).gap(8).items_center()
        .when(open || !c.total, (el) => el.child(bar(t, p)))
        .when(c.review > 0, (el) => el.child(pill(`${c.review} review`, t, t.accent)))
        .when(c.blocked > 0, (el) => el.child(pill(`${c.blocked} blocked`, t, t.blocked)))
        .when(c.attention === 0 && c.started > 0, (el) => el.child(pill(`${c.started} started`, t, t.muted)))
        .when(c.attention === 0 && !c.started && c.ready > 0, (el) => el.child(pill(`${c.ready} ready`, t, t.done))))
      .when(open, (el) => el.child(v_flex().pb(6).gap(1)
        .children(tasks.slice(0, 60).map((task) => this.taskRow(t, task)))
        .when(Boolean(this.query.trim()) && tasks.length > 60, (el) => el.child(div().pl(25).py(3)
          .text_size(S().label).text_color(t.muted).child(`+${tasks.length - 60} more`)))));
  }

  taskRow(t, task) {
    const open = this.openTask === task.id, hint = taskHint(task);
    return v_flex()
      .child(h_flex().id(`task-${this.idOf(task.id)}`).h(27).pl(27).pr(8).gap(6).items_center().rounded(5).cursor_pointer()
        .hover((s) => s.bg(open ? t.selected : t.hover)).when(open, (el) => el.bg(t.selected))
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => { this.openTask = open ? null : task.id; cx.notify(); })
        .child(dot(STATUS_COLOR(t, task.status), 6))
        .child(div().w(28).flex_none().text_size(S().label).text_color(t.muted).child(`T${task.number}`))
        .child(div().flex_1().min_w(0).truncate().text_size(S().secondary).child(task.title))
        .when(task.assignee === "agent", (el) => el.child(icon("bot", 11, t.working)))
        .when(Boolean(task.thread), (el) => el.child(icon("thread", 11, t.muted))))
      .when(open, (el) => el.child(h_flex().pl(33).pr(8).pb(6).gap(6).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(S().label).text_color(t.muted).child(hint || LABEL[task.status]))
        .when(task.status !== "done", (el) => el
          .when(task.status === "open" || task.status === "ready", (el) => el.child(secondary(`start-${this.idOf(task.id)}`, "Start", t,
            (_e, cx) => this.move(task, "started", cx), { h: 22, px: 7, size: S().label })))
          .child(secondary(`done-${this.idOf(task.id)}`, "Done", t, (_e, cx) => this.move(task, "done", cx), { h: 22, px: 7, size: S().label })))));
  }

  noticeRow(t) {
    const warn = this.notice.kind === "warn";
    return h_flex().flex_none().mx(10).mb(6).px(8).h(24).gap(6).items_center().rounded(6).bg(t.chrome)
      .child(icon(warn ? "alert" : "check", 12, warn ? t.ansi1 : t.done))
      .child(div().flex_1().min_w(0).truncate().text_size(S().label).text_color(warn ? t.ansi1 : t.muted).child(this.notice.text));
  }

  footer(t) {
    const target = this.captureTarget();
    return v_flex().flex_none().px(10).pt(8).pb(9).gap(5).border_t(1).border_color(t.border)
      .child(h_flex().gap(6).items_center().text_size(S().label).text_color(t.muted)
        .child(icon(target ? "folder" : "desk", 11, t.muted))
        .child(div().flex_1().min_w(0).truncate().child(target ? `new task → ${target.name}` : "new task → desk")))
      .child(h_flex().flex_1().min_w(0).h(30).px(8).gap(6).items_center().rounded(6).border_1().border_color(t.border).bg(t.chrome)
        .child(icon("plus", 13, t.muted))
        .child(Input.new(this.capture).flex_1().min_w(0).h_full().text_size(S().secondary).text_color(t.foreground)));
  }
}

function firstNumber(stdout) {
  try {
    const v = JSON.parse(String(stdout).trim());
    const row = Array.isArray(v) ? v[0] : v;
    return row && row.number ? row.number : 0;
  } catch (_e) { return 0; }
}
