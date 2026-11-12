// What `tsk` prints, read as the panel's data: task rows, per-project progress, and the
// arguments that add a task or move one along. No Herdr imports, so tests/model.test.mjs
// runs this file under node.

/** Attention first: a review waits on you, a block waits on someone, started work is moving. */
export const STATUSES = ["review", "blocked", "started", "ready", "open"];
export const LABEL = { review: "review", blocked: "blocked", started: "started", ready: "ready", open: "open", done: "done" };

/** Splits the two lists in one exec: live tasks, then done ones. */
export const DONE_MARK = "@@tsk-done@@";
export const LIST = `tsk list --all --json
printf "\\n${DONE_MARK}\\n"
tsk list --all --done --json`;

/** Installers put tsk in ~/.local/bin; an exec's PATH need not have it. */
export const PATHS = 'PATH="$HOME/.local/bin:$HOME/go/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"; export PATH';

// ---- How often the panel refetches ----

/** The refresh choices in the panel's strip. 0 never polls; the refresh button still works. */
export const INTERVALS = [
  { ms: 0, label: "off" },
  { ms: 5000, label: "5s" },
  { ms: 15000, label: "15s" },
  { ms: 60000, label: "1m" },
  { ms: 300000, label: "5m" },
];
export const DEFAULT_POLL = 15000;

/** A stored choice, a layout prop, or the default, read as ms: a label ("off", "5s", "1m") or a number. */
export function parsePoll(value, fallback = DEFAULT_POLL) {
  if (value === null || value === undefined || value === "") return fallback;
  const text = String(value).trim().toLowerCase();
  const named = INTERVALS.find((i) => i.label === text);
  if (named) return named.ms;
  const ms = Number(text);
  if (!isFinite(ms) || ms < 0) return fallback;
  return Math.round(ms);
}

/** The chip label for an interval: the named one, else its seconds. */
export function pollLabel(ms) {
  const hit = INTERVALS.find((i) => i.ms === ms);
  return hit ? hit.label : `${Math.round(Number(ms || 0) / 1000)}s`;
}

export function lastLine(text) {
  const lines = String(text ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : "";
}

function parseRows(text) {
  const s = String(text ?? "").trim();
  if (!s) return { rows: [], error: null };
  // A notice on the same stream would break JSON.parse: take the array between the outermost brackets.
  const from = s.indexOf("["), to = s.lastIndexOf("]");
  const body = from >= 0 && to > from ? s.slice(from, to + 1) : s;
  try {
    const value = JSON.parse(body);
    if (!Array.isArray(value)) return { rows: [], error: "tsk list did not print an array" };
    return { rows: value.map(normalize), error: null };
  } catch (e) {
    return { rows: [], error: lastLine(s) || String((e && e.message) || e) };
  }
}

function normalize(row) {
  const status = String(row && row.status ? row.status : "open");
  return {
    id: String(row && row.id ? row.id : ""),
    number: Number(row && row.number) || 0,
    title: String((row && row.title) || ""),
    status: STATUSES.indexOf(status) >= 0 ? status : status === "done" ? "done" : "open",
    project: row && row.project != null ? String(row.project) : null,
    thread: row && row.thread ? String(row.thread) : null,
    assignee: row && row.assignee ? String(row.assignee) : null,
    block: (row && row.block) || null,
    review: (row && row.review) || null,
  };
}

/** { live, done, error } from the LIST script's stdout. */
export function parseList(stdout) {
  const text = String(stdout ?? "");
  const at = text.indexOf(DONE_MARK);
  const live = parseRows(at < 0 ? text : text.slice(0, at));
  const done = parseRows(at < 0 ? "" : text.slice(at + DONE_MARK.length));
  return { live: live.rows, done: done.rows, error: live.error || done.error || null };
}

export function countsOf(tasks) {
  const c = { review: 0, blocked: 0, started: 0, ready: 0, open: 0, total: tasks.length };
  for (const t of tasks) if (c[t.status] !== undefined) c[t.status] += 1;
  c.attention = c.review + c.blocked;
  return c;
}

export const projectName = (path) => String(path ?? "").split("/").filter(Boolean).pop() ?? "desk";

/** A space in a sub-folder of a project still counts as that project. */
export const matchesFolder = (project, folder) =>
  Boolean(project && folder) && (folder === project || String(folder).startsWith(`${project}/`));

/** Board order inside a project: whatever waits on you first, then the newest. */
const byAttention = (a, b) => {
  const d = STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status);
  return d !== 0 ? d : b.number - a.number;
};

/**
 * One entry per project (the desk is `path: null`), with its live tasks and its done count.
 * `folders` are the open spaces' folders: a project holding one sorts first and shows as
 * active. Projects with nothing live are left out unless they hold an open space, or
 * `showDoneOnly` asks for them.
 */
export function buildProjects(live, done, folders = [], { showDoneOnly = false } = {}) {
  const projects = new Map();
  const at = (path) => {
    if (!projects.has(path)) {
      projects.set(path, { path, name: path ? projectName(path) : "desk", desk: !path, tasks: [], done: 0, active: false });
    }
    return projects.get(path);
  };
  for (const task of live) at(task.project).tasks.push(task);
  for (const task of done) at(task.project).done += 1;
  const out = [];
  for (const p of projects.values()) {
    p.tasks.sort(byAttention);
    p.counts = countsOf(p.tasks);
    p.total = p.counts.total + p.done;
    p.active = folders.some((f) => matchesFolder(p.path, f));
    if (!p.counts.total && !p.active && !showDoneOnly) continue;
    out.push(p);
  }
  return out.sort((a, b) =>
    Number(b.active) - Number(a.active) ||
    b.counts.attention - a.counts.attention ||
    b.total - a.total ||
    (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** The portfolio's shape: every status summed across projects, plus the done count. */
export function totalsOf(projects) {
  const sum = { review: 0, blocked: 0, started: 0, ready: 0, open: 0, total: 0, attention: 0, done: 0 };
  for (const p of projects) {
    for (const s of [...STATUSES, "total", "attention"]) sum[s] += p.counts[s];
    sum.done += p.done;
  }
  return sum;
}

// ---- Status changes: what a desktop notification is about ----

/** id → status for every task in this poll: live and done alike. */
export function snapshotOf(tasks) {
  const seen = {};
  for (const t of tasks) if (t.id) seen[t.id] = t.status;
  return seen;
}

/** Tasks whose status moved since `seen`. One nobody had seen yet is not a change, so a first poll is quiet. */
export function changedTasks(seen, tasks) {
  const out = [];
  if (!seen) return out;
  for (const t of tasks) {
    const was = seen[t.id];
    if (was && was !== t.status) out.push({ task: t, from: was, to: t.status });
  }
  return out;
}

/** More than this many moves in one refetch arrive as one counted notice, not a stack of them. */
export const ALERTS_MAX = 3;

/** The notices for a refetch's changes: one per task, or a single summary when a batch landed. */
export function alertPlan(changes) {
  if (!changes || !changes.length) return [];
  if (changes.length > ALERTS_MAX) {
    const counts = {};
    for (const c of changes) counts[c.to] = (counts[c.to] || 0) + 1;
    const body = [...STATUSES, "done"].filter((s) => counts[s]).map((s) => `${counts[s]} ${LABEL[s]}`).join(" · ");
    return [{ title: `tsk · ${changes.length} changed`, body, level: "info" }];
  }
  return changes.map((c) => ({
    title: `tsk · ${LABEL[c.to] || c.to}`,
    body: `${c.task.project ? projectName(c.task.project) : "desk"} · T${c.task.number} ${c.task.title}`,
    level: levelOf(c.to),
  }));
}

/** A notice's weight: a block needs an answer, a done task is good news. */
const levelOf = (status) => ({
  blocked: "error", review: "warning", done: "success",
}[status] || "info");

/** Tasks matching a filter: title, thread, assignee, or its T number. */
export function filterTasks(tasks, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return tasks;
  return tasks.filter((t) =>
    t.title.toLowerCase().includes(q) ||
    String(t.thread ?? "").toLowerCase().includes(q) ||
    String(t.assignee ?? "").toLowerCase().includes(q) ||
    `t${t.number}` === q || String(t.number) === q);
}

/** Projects to show for a filter: the name matched, or at least one task inside it did. */
export function filterProjects(projects, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return projects;
  return projects.filter((p) => p.name.toLowerCase().includes(q) || filterTasks(p.tasks, q).length > 0);
}

/** Element ids built from paths and uuids: only what an id may hold. */
export const idOf = (key) => String(key ?? "").replace(/[^A-Za-z0-9_.-]/g, "-");

/** `tsk add` arguments: into `project`, or onto the desk when it is null. */
export function addArgs(title, project) {
  const args = ["add", "-t", String(title), "--json"];
  return project ? [...args, "-p", project] : [...args, "--desk"];
}

/** `tsk status` arguments: `started` and `done` are the two moves the panel offers. */
export const statusArgs = (number, status) => ["status", `T${number}`, status];

/**
 * `tsk archive` arguments: off every working view, number and status kept. tsk has no delete on the
 * command line, so this is the panel's "remove": `tsk unarchive T<n>` puts the task straight back.
 */
export const archiveArgs = (number) => ["archive", `T${number}`];

/** The board tab for a project: its name, and the folder tsk opens it in. */
export function boardOf(project, home) {
  return { name: `tsk ${project.name}`, folder: project.path ?? home };
}

/** One line under a task: what blocks it, what a review checks, or its thread. */
export function taskHint(task) {
  if (task.block) {
    const why = String(task.block.why ?? "").trim();
    return why ? `blocked: ${why}` : "blocked";
  }
  if (task.review) {
    const checks = Array.isArray(task.review.checks) ? task.review.checks : [];
    const open = checks.filter((c) => c && c.state === "open").length;
    return checks.length ? `review · ${checks.length - open}/${checks.length} checks` : "review";
  }
  return task.thread ? `#${task.thread}` : "";
}

/** The first message a coding agent gets when a task's Start is pressed. */
export function agentBrief(task, projectPath) {
  const where = task.project || projectPath || "";
  return [
    `tsk task T${task.number}${task.thread ? ` (${task.thread})` : ""} — ${task.title}`,
    where ? `Project: ${where}` : "",
    "The rest of the record is in tsk: `tsk list --all --json` (and `tsk help`).",
    `Do the work, then hand it back for review: \`tsk status T${task.number} review\`.`,
  ].filter(Boolean).join("\n");
}

/** Which agent to start: props.agent by key or name ("none" turns it off), else the most picked installed one. */
export function pickAgent(agents, want) {
  const list = (agents || []).filter((a) => a && a.installed && Array.isArray(a.run) && a.run.length > 0);
  const w = String(want ?? "").trim().toLowerCase();
  if (w === "none") return null;
  if (!list.length) return null;
  if (!w) return list[0];
  return list.find((a) => String(a.key).toLowerCase() === w || String(a.name).toLowerCase() === w)
    || list.find((a) => String(a.key).toLowerCase().includes(w) || String(a.name).toLowerCase().includes(w))
    || list[0];
}

/** `tab.new` arguments that start `agent` on `task`, in the task's project folder. */
export function launchArgs(task, agent) {
  return { name: `T${task.number}`, folder: task.project || null, argv: agent.run, task: agentBrief(task) };
}

// ---- The agent's terminal, found again by the label hc was given ----

/** The label every terminal Start opens carries, and the one the panel reads back. */
export const taskLabel = (number) => `T${number}`;

/**
 * `hc --name`: lowercase letters, digits, `-` and `_`, and not shaped like a terminal id —
 * `T12` is refused as uppercase and `t12` as an id, so the name is `tsk-12`.
 */
export const taskName = (number) => `tsk-${number}`;

/**
 * `hc run` arguments for a task's agent: a background terminal that outlives both this
 * process and the terminal it was started from, labeled so the panel finds it again, and
 * adopted into `space`/`tab` when Herdr knows them.
 */
export function hcRunArgs({ task, argv, brief, folder, space, tab }) {
  const args = ["run", "--bg", "--json", "--no-parent", "--keep", "--name", taskName(task.number),
    "--label", `tsk=${taskLabel(task.number)}`];
  if (space && tab) args.push("--label", `herdr.space=${space}`, "--label", `herdr.tab=${tab}`);
  if (folder) args.push("--cwd", folder);
  args.push("--");
  for (const arg of argv || []) args.push(String(arg));
  if (brief) args.push(String(brief));
  return args;
}

/**
 * `hc` reports failures as one JSON object on stderr (`{"error":{"message":…,"hint":…}}`), which
 * reads as noise in a notice: show the message, with the hint after it. Anything else is the last line.
 */
export function hcError(text) {
  const raw = String(text || "").trim();
  const last = raw.split("\n").pop() || "";
  if (last.startsWith("{")) {
    try {
      const error = JSON.parse(last).error;
      if (error && error.message) return error.hint ? `${error.message} (${error.hint})` : String(error.message);
    } catch (e) {
      // not JSON after all: the last line is the message
    }
  }
  return lastLine(raw);
}

/** The terminal record without the fields the panel never reads. */
const terminalOf = (row) => ({
  address: String(row.address || ""),
  agent: String(row.agent || ""),
  cwd: row.cwd ? String(row.cwd) : null,
  state: String(row.state || ""),
  status: row.status ? String(row.status) : null,
  name: row.name ? String(row.name) : "",
  title: row.title ? String(row.title) : "",
  where: row.labels && row.labels.where ? String(row.labels.where) : "",
  program: row.program
    ? {
      key: String(row.program.key || ""),
      name: String(row.program.name || ""),
      icon: row.program.icon ? String(row.program.icon) : "",
      tint: Boolean(row.program.tint),
    }
    : null,
});

/**
 * Who runs the task, in the app's own words: the program's name (`Pi`), its key (`pi`), then the
 * record's agent or terminal name. Empty when the task has no terminal.
 */
export function agentName(term) {
  if (!term) return "";
  const p = term.program || {};
  return p.name || p.key || term.agent || term.name || "";
}

/**
 * Where it runs, as herdr-core already labels it: `Fosun Work / 1` is space / tab. `hc run` is given
 * `herdr.space` and `herdr.tab`, and the core turns them into that label on the terminal itself.
 */
export const whereLabel = (term) => (term && term.where ? term.where : "");

/** `Pi · Fosun Work / 1`: the agent and the tab it sits in, for the row that explains a task. */
export function whoLine(term) {
  return [agentName(term), whereLabel(term)].filter(Boolean).join(" \u00b7 ");
}

/**
 * The task's agent terminal out of Herdr's live `terminals()`: a running one carrying the
 * label wins, then a running one named after the task (a launch that never got its label),
 * then the leftover of an earlier run. Null when the task never had one.
 */
export function taskTerminal(task, terminals) {
  const rows = Array.isArray(terminals) ? terminals.filter(Boolean) : [];
  const labeled = (r) => r.labels && r.labels.tsk === taskLabel(task.number);
  const named = (r) => r.name === taskName(task.number);
  const live = (r) => r.state === "live";
  const found = rows.find((r) => labeled(r) && live(r))
    || rows.find((r) => named(r) && live(r))
    || rows.find(labeled)
    || rows.find(named);
  return found ? terminalOf(found) : null;
}

/** A terminal that is still running. `--keep` leaves a finished one listed, never live. */
export const isLive = (term) => Boolean(term) && term.state === "live";
