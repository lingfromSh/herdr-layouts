# AGENTS.md — herdr-layouts

A Herdr desktop layout plus the one mod it needs. Herdr runs mods in QuickJS with its own UI kit;
none of this is part of Herdr's Go build.

- `layouts/herdr-work.json` is a `layout.clone` of `main`, with a `tabs-row` carrying one toggle and one
  panel column (`tsk-panel`) appended to `work-body`. `RECIPE.md` explains why each node is there;
  `README.md` is the user-facing side. Keep all three in step with the code.
- `mods/tsk/main.js` is the only file that imports `herdr`. `mods/tsk/model.js` takes no Herdr functions,
  so `node --test tests/` covers it without the app: parsing, grouping, sorting, argument building.
  Put new logic in `model.js` and a test; keep `main.js` to views.
- Check the mod with `herdr-app check mods/tsk` (`make check`) on a machine with Herdr. QuickJS rejects
  `??` mixed with `||`/`&&` without parentheses, and `node --check` accepts it — so check both.
- Herdr theme tokens only, never hard-coded colours. Never keep a `cx` past its callback, call
  `setShared`/`cx.notify` during render (use `later(cx, …)`), or pass `null` to `.child`.
- Element ids that carry a path or uuid go through `idOf()`; the same id twice in one tree is a bug.
- Install by **copying** `mods/tsk` into `~/.config/herdr-app/mods/` — a symlinked mod is not hot-reloaded.
  `./install.sh` does the copy, keeps a `.before-<stamp>` backup, and runs the check.
- `preview.png` and `layouts/herdr-work.png` are screenshots of a real window, so they carry the author's
  project and task names. Re-shoot them (`herdr-app shot …`) rather than editing pixels.
- tsk's own `tsk setup herdr` registers a pane into the legacy `herdr` TUI plugin system
  (`~/.config/herdr/plugins.json`), not into Herdr desktop's layouts/mods. Don't confuse the two; this repo
  only touches `~/.config/herdr-app/`.
