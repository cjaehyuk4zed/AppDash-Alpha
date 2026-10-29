---
name: appdash-create-app
description: Build a local app and its declarative AppDash Gateway configuration for user review and registration.
---

# Build an AppDash-compatible local app

AppDash manages registration, process start/stop, schedules, connections, credentials, logs and result downloads. The app owns its domain logic, UI, AI calls, memory and tools. Build a local app; do not build a controller for AppDash or require a general orchestration/MCP layer. AppDash does not generate app code internally.

## Deliverables

Deliver working source, dependencies and installation instructions, real start/stop entry points, `appdash-gateway-config.json`, and a report of checks actually performed. Never claim installation, execution or registration that you did not perform. Keep credentials and private data out of source, configuration JSON and logs. A user reviews and registers the app in AppDash after preparing it on their PC.

## Configuration contract

Use exactly this filename: `appdash-gateway-config.json`.

```json
{
  "name": "My local app",
  "description": "What it does",
  "type": "automation",
  "group": "Personal",
  "gateway": {
    "adapter": "process",
    "workingDirectory": "C:\\Apps\\my-app",
    "start": { "executable": "node", "args": ["main.mjs"] },
    "stop": { "executable": "", "args": [] },
    "healthUrl": "",
    "openUrl": "",
    "timeoutSeconds": 300,
    "readinessSeconds": 20
  }
}
```

`name` is the single app name. `workingDirectory` must be the user's real absolute directory; replace example paths. Separate executable and argument array. No implicit shell expansion, pipes, redirection or interpolation: explicitly select `powershell.exe` or `cmd.exe` and pass host arguments when required. All listed entry points must exist. URLs must be HTTP(S) without embedded credentials.

- `automation`: finite task; exit 0 for success, nonzero for failure. Stop command is optional.
- `service`: persistent web app or local AI agent service. Supply an actual health URL and a UI open URL. AppDash reuses an active instance and opens its UI in a new tab. Closing the tab does not stop it. With no stop entry point, AppDash terminates the process tree it started.
- `scheduled`: finite task with schedules managed by AppDash. Do not add an unnecessary internal scheduler. AppDash and the PC must be running. Times use Asia/Seoul.

Default task timeout is 300 seconds; service readiness is 20 seconds. AppDash is a local process manager, not a security sandbox. Bind app servers to loopback unless the user explicitly requires otherwise.

## Runtime environment

- `APPDASH_APP_ID`, `APPDASH_RUN_ID`: stable app ID and unique execution ID.
- `APPDASH_INPUT_JSON`: execution input object; validate before use.
- `APPDASH_OUTPUT_DIR`: dedicated result directory. Write downloadable outputs here. Avoid symlinks and external result paths.
- `APPDASH_CONNECTIONS_JSON`: authorized connection ID/name/type/URL/authEnvName metadata, never token values.
- `APPDASH_URL`: local AppDash base URL.
- `APPDASH_TOKEN_ACCESS_KEY`: transient execution credential, never log or persist it.

Apps may retain their own `.env` or authentication mechanism. Central AppDash tokens are optional and explicitly assigned by the user after registration; do not embed installation-specific token or connection IDs in distributable JSON. Authorized tokens are injected under their registered variable names. Never overwrite system or APPDASH control variables.

For fresh tokens, use the provided `appdash-sdk.mjs`: `getToken('GITHUB_TOKEN')` prefers the app's environment; `getToken('GITHUB_TOKEN', { fresh: true })` calls `POST /api/runtime/tokens/GITHUB_TOKEN` with `Authorization: Bearer <APPDASH_TOKEN_ACCESS_KEY>`. Only assigned, unexpired tokens on an active execution are available. Never use the UI management session token. Replacement is reflected on fresh lookup or the next process start; existing environment values cannot be remotely erased. Do not log secrets, input containing secrets, authorization headers or raw upstream errors containing credentials.

## Verify and hand over

Test a real task or service start, readiness, successful/failing exit, output generation and stop when applicable. Explain untested steps. Have the user download/review the config, prepare their local folder, import the JSON in **앱 만들기 · 연결하기**, review commands and permissions, choose connections/tokens, and explicitly register. Importing is never execution approval by itself. App UI belongs to the app and opens in a new tab; AppDash need not generate domain-specific forms.
