# OMP integration handoff

Owner: `omp_integration` agent. Work in progress.

This agent owns `patches/`, `scripts/prepare-upstream.ts`, `scripts/generate-catalog.ts`, `scripts/build-runtime.ts`, `src/generated/`, `docs/upstream.md`, and changes made to the OMP reference checkout for patch generation. It does not edit desktop Rust files or frontend components.

Planned runtime additions: absolute `OMP_USER_ROOT`; `desktop_settings` (`operation: list|set|unset`, `key?`, `value?`) and `desktop_commands` RPC operations. Runtime patch remains independent from the desktop host. Generated catalog includes CLI, slash commands, settings and RPC entries, with explicit execution surfaces.

Root agent: please leave these paths to this agent. The current message tool appears to deliver empty task payloads; this file is the shared handoff source until messages recover.

Progress: dependencies installed on F:; upstream gen:rpc succeeded. `src/generated/catalog.json`, `rpc-wire.ts` and `rpc-wire.schema.json` generated. Catalog has 241 entries with `{name,kind,description,surface,source,rpc?}`. Settings schema is live via desktop_settings. Desktop settings returns `{settings:[{key,type,value,defaultValue,credential,configured,options,ui,provenance}]}`. Credentials never returned.

Root owns vendor/omp-rpc; copy regenerated upstream sdk/rust/omp-rpc/src/wire.rs when convenient. prepare-upstream does not modify vendor. Runtime build in progress; native package staging will use F:/omp-better-desktop/cache/natives-18.12.6-win32-x64.

Additional bridge work: rpc-ui `login` now supports `input.secret` (frontend input must render `type=password` and never persist it), login runs outside the serial command queue. MCP auth challenges use existing UI-independent reauthorizeMcpServer and emit open_url/notify in rpc-ui. Generic terminal-only built-ins are inventoried honestly as terminal surfaces until dedicated GUI routes exist.

Frontend alignment: settings entries now include `path` and `key`, and `enumValues` (not options). Response is `{settings:[...]}`. Please unwrap `settings`. All operations use the live session's Settings; no model call is involved. Provider input requests may have `secret:true` and must use password fields.

Verification: 3 focused tests pass (profile/default root relocation, relative root rejection, invalid setting rejection). Type check caught and fixed a missing parseValueDialogResponse argument; final recheck running. Runtime binary build is running, native addon from the exact upstream 18.12.6 Windows leaf staged.

Typecheck passed. Initial binary built successfully (414,308,352 bytes). Rebuilding once now to include latest settings field alignment and cancellation signal for provider login. Patches and final manifest will be written next; do not package the previous binary as final. Native-only built-in remaining list from current catalog: collab, join, leave, copy, open, live, record, pause, quit, new, clear, delete, btw, tan, omfg, cleanse, debug, exit, restart, plan, plan-review, vibe, goal, guided-goal, loop, queue, skills. Several have direct RPC equivalents (new, btw, live, goal) and can be mapped by frontend without engine changes.

FINAL BUILD READY: latest binary and `artifacts/runtime-windows-x64/runtime-manifest.json` now exist. Patch generated and `prepare-upstream` successfully verified reverse-apply/idempotence. Focused 3 tests pass, upstream coding-agent typecheck passes, git diff --check passes. Actual compiled RPC smoke is currently running (ready/settings/commands, no provider call). README details in docs/upstream.md. Root can copy generated upstream Rust wire.rs now; schema complete. Storage manifest schema ignores extra patchDigest but identity still includes file hashes; ensure installer hashes complete file list.
