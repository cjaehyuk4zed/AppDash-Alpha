---
name: appdash-create-app
description: Build a web service, desktop app, or finite automation script with a declarative AppDash process configuration.
---

# Build an AppDash-compatible local app

Deliver real source, executable entry points, appdash-gateway-config.json, setup/start/stop instructions and checks actually performed. AppDash manages local processes, registration, allowed connections/tokens, logs and results. The app owns its UI, business logic, AI calls, tools and memory. Do not build a controller or mandatory orchestration layer for AppDash. The human registers the app; do not register it or stop/restart an existing installation automatically.

## Three categories

- service / 웹 서비스·앱: a browser UI. Set gateway.openUrl and start the real server with gateway.start. AppDash opens its UI in a new tab, reuses the owned instance and manages readiness, stop and logs. Business schedules belong INSIDE the service, not in AppDash. Implement them only if requested and document that the service/PC must be running.
- desktop / 데스크톱 앱: a native PC window. Leave gateway.openUrl and healthUrl empty. Clicking its card starts gateway.start on the server without a confirmation panel or browser tab. No HTTP readiness checks, finite automation timeout, automation input panel or AppDash schedule. Track the process until it exits.
- automation / 자동화 스크립트: a finite script without its own UI. Leave openUrl and healthUrl empty. The card opens an execution panel; AppDash manages manual runs, input, schedules, stop, logs and downloadable results. Exit 0 on success and nonzero on failure.

scheduled is a legacy import alias, not a selectable category. Existing scheduled/service/automation and uiStart/uiStop definitions remain readable; explicit desktop must never be inferred as automation just because it has no URL. Generate gateway.start/stop, never new uiStart/uiStop fields.

## Desktop lifecycle

allowMultipleInstances is a top-level boolean, default false when omitted. Strings such as "false", numbers and null are invalid. It applies only to desktop.
- false: an already running instance is kept; another card click reports already running and does not spawn a duplicate. Do not claim it focuses the existing window.
- true: each click, including simultaneous requests, starts an independent instance with its own process, logs and history.
- The card stop button stops ALL AppDash-owned instances for that app. New starts are blocked during the entire stop operation. Never find and kill unrelated processes by executable name.
- Users can close the app window normally. Forced termination can lose unsaved work; explain this.
- The launcher MUST remain alive until the actual app exits. A launcher that starts another process and immediately exits breaks reliable status tracking. Use a direct executable or a waiting launcher. Document single-instance OS apps or child processes that detach as limitations.
- Any custom stop command must target only the instance(s) AppDash started, never unrelated windows/processes.

## Configuration

The exact filename is appdash-gateway-config.json.

```json
{
  "name": "My desktop app",
  "description": "A local desktop window",
  "type": "desktop",
  "allowMultipleInstances": false,
  "group": "Personal",
  "gateway": {
    "adapter": "process",
    "workingDirectory": "C:\\Apps\\my-desktop-app",
    "start": { "executable": "python", "args": ["app.py"] },
    "stop": { "executable": "", "args": [] },
    "healthUrl": "",
    "openUrl": "",
    "timeoutSeconds": 300,
    "readinessSeconds": 20
  }
}
```

timeoutSeconds/readinessSeconds are retained for schema compatibility but are not applied to desktop. For automation use type automation and a finite command such as node run.mjs. For service use type service, start args ["server.mjs"], a real loopback openUrl and optional readiness healthUrl (for example http://127.0.0.1:4180/ and /api/ready). AppDash uses port 4175; use a separate app port.

workingDirectory must be the user's real absolute folder on the CURRENT PC, not an unedited example or another PC's path. Separate executable from argument array. No implicit shell expansion; use a shell host explicitly for BAT/PowerShell commands. stop is optional; AppDash otherwise terminates only its owned process tree. Bind app servers to loopback unless explicitly requested otherwise. All listed files and entry points must exist.

name is the single app name. Do not embed credentials, secrets or installation-specific token/connection IDs in source or distributable configuration. Importing a file does not approve execution.

## Runtime environment

APPDASH_APP_ID and APPDASH_RUN_ID identify the app and individual execution. APPDASH_INPUT_JSON is a validated input object. APPDASH_OUTPUT_DIR is a dedicated result directory; write results there without links or path escape. APPDASH_CONNECTIONS_JSON contains permitted connection metadata, not secrets. APPDASH_URL is the local base URL. APPDASH_TOKEN_ACCESS_KEY is a transient execution credential: never log or persist it.

Keep the existing authentication/storage approach unless the human explicitly requests changes. Apps may use their own .env/authentication. Explicitly assigned central tokens are injected under registered names. Never overwrite system or APPDASH control variables. If fresh lookup is required, sdk/appdash-sdk.mjs getToken(name) prefers the environment; getToken(name,{fresh:true}) calls POST /api/runtime/tokens/{name} with Authorization: Bearer APPDASH_TOKEN_ACCESS_KEY. Only assigned, current, unexpired tokens on an active run may be retrieved. Do not use the UI management session. Rotation/deletion cannot erase an already injected environment value.

## Verify and hand over

Test real service readiness/start/stop, desktop single/multiple/concurrent starts and stop-all races, or finite script success/failure/timeout as applicable. Verify persistence, input, logs, history and schedules when relevant. Test desktop/mobile layouts without changing the human's live data. Explain untested behavior. Shut down all test processes and servers. The human prepares the folder, imports the JSON under 앱 만들기 · 연결하기, reviews commands/permissions, chooses any tokens/connections and explicitly registers it. AppDash is a local process manager, not a sandbox.
