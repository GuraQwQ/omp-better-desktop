# Upstream integration

The source and protocol baseline is `upstream.lock.json`. The reference repositories live outside the product checkout, in the sibling `.references` directory. Only the pinned build inputs, independently replayable patch, generated contracts and selected Rust client are tracked here.

## Build

Use `scripts/dev.ps1` to configure non-system-drive dependency and build caches. Run `bun run prepare:upstream`, then `bun run build:runtime`. The build installs the upstream lockfile with lifecycle scripts disabled, generates the upstream RPC contracts, provisions the exact-version Windows native addon, and invokes the upstream binary compiler. The native addon is pinned to the engine's version because its version sentinel is an ABI compatibility boundary.

The resulting `artifacts/runtime-windows-x64/runtime-manifest.json` accompanies the executable and license notices. Import that directory from the desktop's Runtime settings. The manifest hashes actual distribution files and records a patch digest; no build paths enter the identity. `scripts/package-runtime.ts` packages an already-built binary for local iteration; use it only after the binary has been rebuilt from the current patch inputs.

## Patch boundary

`patches/0001-desktop-runtime.patch` contains:

- `OMP_USER_ROOT`: an absolute OMP user root shared by the desktop, managed CLI, default profile and named profiles. It does not change the OS home directory or project discovery locations. Under this explicit root, legacy agent-dir overrides and XDG relocation do not split native state into another location.
- `desktop_settings`: list, set and unset through the upstream settings registry, validation and persistence. It returns metadata for every setting and redacts credentials. The list response is `{settings:[{key,path,type,value,defaultValue,credential,configured,enumValues,ui,provenance}]}`.
- `desktop_commands`: a complete built-in command directory, including commands with only TUI presentation. `rpc` and `tui` record which upstream handler exists; they do not claim native desktop parity.
- GUI OAuth inputs, including password fields, with host abort and disconnect cancellation. Provider login runs outside the serial request queue. MCP challenges in rpc-ui reuse the existing OAuth engine and report authorization URLs/progress to the desktop.
- Matching generated TypeScript, JSON Schema, Rust, Python and Go wire contracts.

`src/generated/catalog.json` and `docs/feature-map.md` inventory built-in CLI/slash/tool/RPC capabilities using the pinned source. The generator parses the source syntax tree; it does not initialize an agent, load user credentials or call a model.

## Verification and limits

Focused checks cover default/profile root isolation, relative-root rejection and settings validation. Upstream coding-agent typechecking also validates the generated protocol against the server types. Runtime smoke checks exercise the actual compiled executable over rpc-ui without a provider request.

The installed runtime retains OMP's built-ins. Native GUI coverage is tracked separately. Terminal-only built-ins currently listed by the catalog are `collab`, `join`, `leave`, `copy`, `open`, `live`, `record`, `pause`, `quit`, `new`, `clear`, `delete`, `btw`, `tan`, `omfg`, `cleanse`, `debug`, `exit`, `restart`, `plan`, `plan-review`, `vibe`, `goal`, `guided-goal`, `loop`, `queue`, and `skills`. Some already have direct RPC equivalents (new session, side questions, live voice and goals); map those to native controls before claiming full GUI parity. Third-party custom TUI components remain embedded-terminal features by design.

Browser-cookie login providers that require `onBrowserSession` still need a host browser-session bridge. MCP loopback OAuth is implemented; manual callback-code UI for MCP has not been added. No paid provider login, real MCP service, live voice or collaborative service was exercised in the initial local checks.
