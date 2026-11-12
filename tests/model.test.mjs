// The panel's data layer, checked without Herdr: `node --test tests/`.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DONE_MARK, STATUSES, parseList, countsOf, totalsOf, projectName, matchesFolder,
  buildProjects, filterTasks, filterProjects, idOf, addArgs, statusArgs, archiveArgs, boardOf, taskHint, lastLine,
  agentBrief, pickAgent, launchArgs, hcError, agentName, whereLabel, whoLine,
  snapshotOf, changedTasks, alertPlan, INTERVALS, DEFAULT_POLL, parsePoll, pollLabel,
  hcRunArgs, taskTerminal, isLive,
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

test("archive takes the task number, because tsk's delete is not on the command line", () => {
  assert.deepEqual(archiveArgs(48), ["archive", "T48"]);
  assert.deepEqual(archiveArgs(3), ["archive", "T3"]);
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

test("hcError unwraps hc's JSON failure, and falls back to the last line", () => {
  const spawn = '{"error":{"hint":"check the program name and cwd","kind":"spawn_failed","message":"cannot start \\"pi\\": No such file or directory (os error 2)"}}';
  assert.equal(hcError(spawn), 'cannot start "pi": No such file or directory (os error 2) (check the program name and cwd)');
  assert.equal(hcError('{"error":{"kind":"x","message":"plain"}}'), "plain");
  assert.equal(hcError("tsk: unknown task T9"), "tsk: unknown task T9");
  assert.equal(hcError("noise\n{\"error\":{\"message\":\"boom\"}}"), "boom");
  assert.equal(hcError(""), "", "nothing to say, so the caller's own message wins");
  assert.equal(hcError("{not json}"), "{not json}");
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

test("alertPlan: one notice per move, one counted notice when a batch lands", () => {
  assert.deepEqual(alertPlan([]), []);
  const one = alertPlan([{ task: task(12, "review", "/w/app", { title: "Fix login" }), to: "review" }]);
  assert.deepEqual(one, [{ title: "tsk · review", body: "app · T12 Fix login", level: "warning" }]);
  assert.equal(alertPlan([{ task: task(5, "open", null), to: "started" }])[0].body, "desk · T5 Task 5");

  const many = [1, 2, 3, 4].map((n) => ({ task: task(n, "review", "/w/app"), to: n > 3 ? "done" : "review" }));
  assert.deepEqual(alertPlan(many), [{ title: "tsk · 4 changed", body: "3 review · 1 done", level: "info" }]);
});

test("a notice's level follows its status: a block is an error, a done task good news", () => {
  const level = (to) => alertPlan([{ task: task(1, to, "/w/a"), to }])[0].level;
  assert.equal(level("blocked"), "error");
  assert.equal(level("review"), "warning");
  assert.equal(level("done"), "success");
  assert.equal(level("started"), "info");
  assert.equal(level("ready"), "info");
});

test("the interval: named choices, numbers, and props that name nothing", () => {
  assert.deepEqual(INTERVALS.map((i) => i.label), ["off", "5s", "15s", "1m", "5m"]);
  assert.deepEqual(INTERVALS.map((i) => i.ms), [0, 5000, 15000, 60000, 300000]);
  assert.equal(parsePoll("off"), 0);
  assert.equal(parsePoll("5s"), 5000);
  assert.equal(parsePoll("5S "), 5000);
  assert.equal(parsePoll("60000"), 60000);
  assert.equal(parsePoll(null), DEFAULT_POLL);
  assert.equal(parsePoll(""), DEFAULT_POLL);
  assert.equal(parsePoll("soon"), DEFAULT_POLL);
  assert.equal(parsePoll("-1"), DEFAULT_POLL);
  assert.equal(parsePoll(undefined, 0), 0, "props may pass the fallback too");
  assert.equal(pollLabel(15000), "15s");
  assert.equal(pollLabel(0), "off");
  assert.equal(pollLabel(2000), "2s", "an interval that is not on the strip still reads");
});

test("hcRunArgs: a background terminal, named and labeled for the task, brief last", () => {
  const args = hcRunArgs({
    task: task(12, "open", "/w/app"), argv: ["pi"], brief: "do T12",
    folder: "/w/app", space: "s1", tab: "s1-t2",
  });
  assert.deepEqual(args, [
    "run", "--bg", "--json", "--no-parent", "--keep", "--name", "tsk-12", "--label", "tsk=T12",
    "--label", "herdr.space=s1", "--label", "herdr.tab=s1-t2", "--cwd", "/w/app", "--", "pi", "do T12",
  ]);
  const bare = hcRunArgs({ task: task(7, "open", null), argv: ["codex", "--yolo"] });
  assert.deepEqual(bare.slice(-3), ["--", "codex", "--yolo"], "no space, no folder, no brief");
  assert.ok(!bare.includes("--cwd"));
});

test("taskTerminal finds the label first, then the task's name, and nothing when it is gone", () => {
  const rows = [
    { address: "t4", agent: "zsh", state: "live", labels: {} },
    { address: "t9", agent: "pi", state: "live", status: "working", labels: { tsk: "T12" } },
    { address: "t11", name: "tsk-13", agent: "claude", state: "finished" },
  ];
  const found = taskTerminal(task(12, "started", "/w/app"), rows);
  assert.equal(found.address, "t9");
  assert.equal(found.agent, "pi");
  assert.equal(found.status, "working");
  assert.equal(found.state, "live");
  assert.equal(taskTerminal(task(13, "started", "/w/app"), rows).address, "t11", "a launch that never got its label");
  assert.equal(taskTerminal(task(99, "open", "/w/app"), rows), null);
  const stale = [
    { address: "t3", name: "tsk-12", state: "finished", labels: { tsk: "T12" } },
    { address: "t8", name: "tsk-12", state: "live", labels: { tsk: "T12" } },
  ];
  assert.equal(taskTerminal(task(12, "open", "/w/app"), stale).address, "t8",
    "a finished leftover loses to the run that took its place");
  assert.equal(taskTerminal(task(12, "open", "/w/app"), null), null);
});

test("whoLine names the agent and the space / tab herdr-core labeled it with", () => {
  const row = {
    address: "t6w", state: "live", status: "working", name: "tsk-54", title: "π - app",
    labels: { tsk: "T54", where: "Fosun Work / 1" },
    program: { key: "pi", name: "Pi", icon: "icons/pi.svg", tint: true },
  };
  const term = taskTerminal(task(54, "started", "/w/app"), [row]);
  assert.equal(agentName(term), "Pi", "the program's own name wins");
  assert.equal(whereLabel(term), "Fosun Work / 1");
  assert.equal(whoLine(term), "Pi · Fosun Work / 1");
  assert.deepEqual(term.program, { key: "pi", name: "Pi", icon: "icons/pi.svg", tint: true });
  assert.equal(whoLine({ program: { key: "codex" }, where: "" }), "codex", "the key when there is no name");
  assert.equal(whoLine({ name: "tsk-7" }), "tsk-7", "the terminal name when there is no program");
  assert.equal(whoLine(null), "");
});

test("isLive is the state, not a status: hc keeps a finished terminal listed", () => {
  assert.equal(isLive(taskTerminal(task(13, "open", null), [{ address: "t1", name: "tsk-13", state: "finished" }])), false);
  assert.equal(isLive(taskTerminal(task(13, "open", null), [{ address: "t1", name: "tsk-13", state: "live" }])), true);
  assert.equal(isLive(null), false);
  assert.equal(isLive(undefined), false);
});
