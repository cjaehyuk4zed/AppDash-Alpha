---
name: appdash-create-app
description: Build a local service with its own UI or a finite automation script and its declarative AppDash configuration.
---

# Build an AppDash-compatible local app

Deliver real source, executable entry points, appdash-gateway-config.json, setup/start/stop instructions and checks actually performed. AppDash manages local processes, registration, allowed connections/tokens, logs and results. The app owns its UI, business logic, AI calls, tools and memory. Do not build a controller or mandatory orchestration layer for AppDash. Do not register or run the app automatically unless the human explicitly asks.

## Exactly two categories

- service: an app with its own UI. Set gateway.openUrl and start the real server with gateway.start. AppDash opens the actual UI in a new tab, reuses an existing owned instance, manages process start/stop, readiness and logs. Business schedules belong INSIDE the service, not in AppDash. Implement them in that service only if requested; persist them, prevent duplicate occurrences and document that the service/PC must be running.
- automation: a finite script without its own UI. Leave openUrl and healthUrl empty. Clicking the card opens an execution panel. AppDash handles manual runs, inputs, schedules, stop, logs and downloadable results. Exit 0 on success and nonzero on failure. Do not add an unnecessary internal scheduler.

scheduled is a legacy import alias, not a third category. Do not generate uiStart/uiStop in new configurations. A service uses start/stop directly.

## Configuration

The exact filename is appdash-gateway-config.json.

```json
{
  "name": "My script",
  "description": "What the task does",
  "type": "automation",
  "group": "Personal",
  "gateway": {
    "adapter": "process",
    "workingDirectory": "C:\\Apps\\my-script",
    "start": { "executable": "node", "args": ["run.mjs"] },
    "stop": { "executable": "", "args": [] },
    "healthUrl": "",
    "openUrl": "",
    "timeoutSeconds": 300,
    "readinessSeconds": 20
  }
}
```

For a UI app use type service, start args ["server.mjs"], a real loopback openUrl and healthUrl (for example http://127.0.0.1:4180/ and /api/ready). AppDash uses port 4175; use a separate app port. workingDirectory must be the user's real absolute folder, not an unedited example. Separate executable from argument array. No implicit shell expansion; use a shell host explicitly for BAT/PowerShell commands. stop is optional; without it AppDash terminates only its owned process tree. Bind app servers to loopback unless explicitly requested otherwise. All listed files and entry points must exist.

name is the single app name. Do not embed credentials, secrets or installation-specific token/connection IDs in source or distributable configuration. Do not claim importing a file approves execution.

## Runtime environment

APPDASH_APP_ID and APPDASH_RUN_ID identify the app and execution. APPDASH_INPUT_JSON is an input object and must be validated. APPDASH_OUTPUT_DIR is a dedicated result directory; write downloadable results there without links or path escape. APPDASH_CONNECTIONS_JSON contains permitted connection metadata, not secrets. APPDASH_URL is the local base URL. APPDASH_TOKEN_ACCESS_KEY is a transient execution credential: never log or persist it.

Apps may use their own .env/authentication. Explicitly assigned central tokens are injected under registered names. Never overwrite system or APPDASH control variables. If fresh lookup is required, sdk/appdash-sdk.mjs getToken(name) prefers the environment; getToken(name,{fresh:true}) calls POST /api/runtime/tokens/{name} with Authorization: Bearer APPDASH_TOKEN_ACCESS_KEY. Only assigned, current, unexpired tokens on an active run may be retrieved. Do not use the UI management session. Deleting/rotating a token cannot erase an already injected environment value.

## Verify and hand over

Test real start, service readiness/stop or script success/failure/timeout, input validation, persistence, result generation and scheduling when implemented. Explain anything not tested. Keep test data separate. The human prepares the folder, imports the JSON under 앱 만들기 · 연결하기, reviews commands/permissions, chooses any tokens/connections and explicitly registers the app. AppDash is a local process manager, not a sandbox.
