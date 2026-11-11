// The panel's data layer, checked without Herdr: `node --test tests/`.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DONE_MARK, STATUSES, parseList, countsOf, totalsOf, projectName, matchesFolder,
  buildProjects, filterTasks, filterProjects, idOf, addArgs, statusArgs, boardOf, taskHint, lastLine,
  agentBrief, pickAgent, launchArgs,
  snapshotOf, changedTasks, alertPlan, notifyScript,
} from "../mods/tsk/model.js";

const task = (number, status, project, more = {}) =>
  ({ id: `id${number}`, number, status, project, title: `Task ${number}`, thread: null, assignee: null, block: null, review: null, ...more });

const listOut = (live, done) => `${JSON.stringify(live)}\n${DONE_MARK}\n${JSON.stringify(done)}\n`;

test("parseList splits live from done at the marker", () => {
  const out = listOut(
    [task(2, "started", "/w/app", { thread: "auth" }), task(1, "open", null)],
    [task(7, "done", "/w/app")],
  );
  const { live, done, error } = parseList(out);
  assert.equal(error, null);
  assert.deepEqual(live.map((t) => t.number), [2, 1]);
  assert.deepEqual(done.map((t) => t.number), [7]);
  assert.equal(live[0].thread, "auth");
  assert.equal(live[1].project, null);
});

test("parseList survives noise on stderr-ish lines and a missing done list", () => {
  assert.deepEqual(parseList(`${JSON.stringify([task(1, "open", null)])}\n${DONE_MARK}\n`).done, []);
  const noisy = parseList(`tsk: some warning\n${JSON.stringify([task(1, "open", null)])}`);
  assert.equal(noisy.live.length, 1);
  assert.match(parseList("tsk: not a repository").error, /not a repository/);
  assert.equal(parseList("").error, null);
});

test("an unknown status reads as open, so a newer tsk still lists its tasks", () => {
  const { live } = parseList(JSON.stringify([task(1, "someday", null)]));
  assert.equal(live[0].status, "open");
});

test("countsOf and totalsOf agree", () => {
  const tasks = [task(1, "review", "/w/app"), task(2, "blocked", "/w/app"), task(3, "open", "/w/app")];
  const c = countsOf(tasks);
  assert.deepEqual([c.review, c.blocked, c.open, c.total, c.attention], [1, 1, 1, 3, 2]);
  const projects = buildProjects(tasks, [task(9, "done", "/w/app")], []);
  const t = totalsOf(projects);
  assert.equal(t.total, 3);
  assert.equal(t.attention, 2);
  assert.equal(t.done, 1);
});

test("projects sort: open spaces first, then what waits on you, then size", () => {
  const live = [
    task(1, "open", "/w/quiet"),
    task(2, "open", "/w/loud"),
    task(3, "review", "/w/loud"),
    task(4, "open", "/w/held"),
    task(5, "started", "/w/held"),
    task(6, "open", null),
  ];
  const projects = buildProjects(live, [], ["/w/quiet/sub"]);
  assert.deepEqual(projects.map((p) => p.name), ["quiet", "loud", "held", "desk"]);
  assert.equal(projects[0].active, true);
  assert.equal(projects[1].counts.attention, 1);
  assert.equal(projects[3].desk, true);
  // Inside a project: attention first, then the newest number.
  const loud = projects[1];
  assert.deepEqual(loud.tasks.map((t) => t.number), [3, 2]);
});

test("projects with nothing live stay out unless a space is open in them", () => {
  const done = [task(1, "done", "/w/old"), task(2, "done", "/w/open-here")];
  assert.deepEqual(buildProjects([], done, []).map((p) => p.name), []);
  assert.deepEqual(buildProjects([], done, ["/w/open-here"]).map((p) => p.name), ["open-here"]);
  assert.equal(buildProjects([], done, [], { showDoneOnly: true }).length, 2);
  assert.equal(buildProjects([], done, ["/w/open-here"])[0].done, 1);
});

test("a space in a sub-folder still owns its project, a sibling does not", () => {
  assert.equal(matchesFolder("/w/app", "/w/app"), true);
  assert.equal(matchesFolder("/w/app", "/w/app/packages/x"), true);
  assert.equal(matchesFolder("/w/app", "/w/application"), false);
  assert.equal(matchesFolder("/w/app", null), false);
  assert.equal(matchesFolder(null, "/w/app"), false);
});

test("projectName is the last folder; the desk has none", () => {
  assert.equal(projectName("/Users/example/w/app/"), "app");
  assert.equal(projectName(null), "desk");
});

test("filterTasks matches title, thread, assignee and T number", () => {
  const tasks = [
    task(12, "open", "/w/app", { title: "Roll back the db", thread: "db-rollback", assignee: "agent" }),
    task(3, "review", "/w/app", { title: "Portal hardening" }),
  ];
  const hits = (q) => filterTasks(tasks, q).map((t) => t.number);
  assert.deepEqual(hits(""), [12, 3]);
  assert.deepEqual(hits("roll"), [12]);
  assert.deepEqual(hits("db-roll"), [12]);
  assert.deepEqual(hits("AGENT"), [12]);
  assert.deepEqual(hits("t3"), [3]);
  assert.deepEqual(hits("3"), [3]);
  assert.deepEqual(hits("nothing"), []);
});

test("filterProjects keeps a project when its name or one of its tasks matches", () => {
  const projects = buildProjects([
    task(1, "open", "/w/webapp", { title: "portal migration" }),
    task(2, "open", "/w/lumos-vault", { title: "index notes" }),
  ], [], []);
  assert.equal(filterProjects(projects, "").length, 2);
  assert.deepEqual(filterProjects(projects, "portal").map((p) => p.name), ["webapp"]);
  assert.deepEqual(filterProjects(projects, "LUMOS").map((p) => p.name), ["lumos-vault"]);
  assert.deepEqual(filterProjects(projects, "nothing"), []);
});

test("idOf strips what an element id may not hold", () => {
  assert.equal(idOf("/Users/example/w/app"), "-Users-example-w-app");
  assert.equal(idOf("15fec2dd-f640-4794"), "15fec2dd-f640-4794");
});

test("the two moves the panel offers build the right arguments", () => {
  assert.deepEqual(addArgs("Ship it", "/w/app"), ["add", "-t", "Ship it", "--json", "-p", "/w/app"]);
  assert.deepEqual(addArgs("Ship it", null), ["add", "-t", "Ship it", "--json", "--desk"]);
  assert.deepEqual(statusArgs(12, "started"), ["status", "T12", "started"]);
  assert.deepEqual(statusArgs(12, "done"), ["status", "T12", "done"]);
});

test("the board tab is named after its project and opens where tsk scopes it", () => {
  const project = { path: "/w/app", name: "app", desk: false };
  assert.deepEqual(boardOf(project, "/Users/example"), { name: "tsk app", folder: "/w/app" });
  assert.deepEqual(boardOf({ path: null, name: "desk", desk: true }, "/Users/example"), { name: "tsk desk", folder: "/Users/example" });
});

test("taskHint says what waits: a block's reason, review checks, else the thread", () => {
  assert.equal(taskHint(task(1, "blocked", "/w/a", { block: { why: "needs a token" } })), "blocked: needs a token");
  assert.equal(taskHint(task(1, "blocked", "/w/a", { block: {} })), "blocked");
  assert.equal(taskHint(task(1, "review", "/w/a", { review: { checks: [{ state: "passed" }, { state: "open" }] } })), "review · 1/2 checks");
  assert.equal(taskHint(task(1, "open", "/w/a", { thread: "portal" })), "#portal");
  assert.equal(taskHint(task(1, "open", "/w/a")), "");
});

test("lastLine is the last non-empty line, so errors do not print a stack", () => {
  assert.equal(lastLine("a\n\nb  \n"), "b");
  assert.equal(lastLine(undefined), "");
});

test("STATUSES is attention-first, and every one is a tsk status", () => {
  assert.deepEqual(STATUSES, ["review", "blocked", "started", "ready", "open"]);
});

test("agentBrief names the task, its project, and how to hand it back", () => {
  const brief = agentBrief(task(3, "open", "/w/app", { thread: "auth" }), "/w/app");
  assert.match(brief, /^tsk task T3 \(auth\) — Task 3$/m);
  assert.match(brief, /^Project: \/w\/app$/m);
  assert.match(brief, /tsk status T3 review/);
});

test("pickAgent takes props.agent by key or name, falls back to the first installed, none turns it off", () => {
  const agents = [
    { key: "claude", name: "Claude Code", run: ["claude"], installed: false },
    { key: "pi", name: "pi", run: ["pi"], installed: true },
    { key: "codex", name: "Codex", run: ["codex"], installed: true },
  ];
  assert.equal(pickAgent(agents, "codex").key, "codex");
  assert.equal(pickAgent(agents, "Codex").key, "codex");
  assert.equal(pickAgent(agents, "clau").key, "pi", "an installed agent wins over a missing one");
  assert.equal(pickAgent(agents, "").key, "pi");
  assert.equal(pickAgent(agents, null).key, "pi");
  assert.equal(pickAgent(agents, "none"), null);
  assert.equal(pickAgent([{ key: "x", name: "x", run: [], installed: true }], ""), null);
});

test("launchArgs opens a tab in the task's project, running the agent with the brief", () => {
  const t = task(9, "open", "/w/app", { thread: "db" });
  const args = launchArgs(t, { key: "pi", name: "pi", run: ["pi", "--yolo"] });
  assert.equal(args.name, "T9");
  assert.equal(args.folder, "/w/app");
  assert.deepEqual(args.argv, ["pi", "--yolo"]);
  assert.match(args.task, /T9/);
  assert.equal(launchArgs(task(9, "open", null), { run: ["pi"] }).folder, null);
});

test("changedTasks reports moves only: a first poll and an unseen task stay quiet", () => {
  const before = snapshotOf([task(1, "started", "/w/app"), task(2, "open", "/w/app")]);
  assert.deepEqual(before, { id1: "started", id2: "open" });
  assert.deepEqual(changedTasks(null, [task(1, "review", "/w/app")]), [], "no baseline, no news");

  const changes = changedTasks(before, [
    task(1, "review", "/w/app"), task(2, "open", "/w/app"), task(3, "started", "/w/app"),
  ]);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].task.number, 1);
  assert.equal(changes[0].from, "started");
  assert.equal(changes[0].to, "review");
});

test("a task closed in tsk reads as a move to done, because done rows carry that status", () => {
  const seen = snapshotOf([task(4, "started", "/w/app")]);
  const changes = changedTasks(seen, [task(4, "done", "/w/app")]);
  assert.deepEqual(changes.map((c) => [c.task.number, c.to]), [[4, "done"]]);
});

test("alertPlan: one banner per move, one counted banner when a batch lands", () => {
  assert.deepEqual(alertPlan([]), []);
  const one = alertPlan([{ task: task(12, "review", "/w/app", { title: "Fix login" }), to: "review" }]);
  assert.deepEqual(one, [{ title: "tsk · review", body: "app · T12 Fix login" }]);
  assert.equal(alertPlan([{ task: task(5, "open", null), to: "started" }])[0].body, "desk · T5 Task 5");

  const many = [1, 2, 3, 4].map((n) => ({ task: task(n, "review", "/w/app"), to: n > 3 ? "done" : "review" }));
  assert.deepEqual(alertPlan(many), [{ title: "tsk · 4 changed", body: "3 review · 1 done" }]);
});

test("notifyScript quotes the text, goes through System Events, and adds a sound only when asked", () => {
  assert.equal(notifyScript("tsk · review", 'app · T1 say "hi" \\ bye'),
    'tell application "System Events" to display notification "app · T1 say \\"hi\\" \\\\ bye" with title "tsk · review"');
  assert.match(notifyScript("t", "b", "Glass"), / sound name "Glass"$/);
  assert.doesNotMatch(notifyScript("t", "b", null), /sound name/);
});
