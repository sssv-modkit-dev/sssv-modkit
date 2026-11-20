# Offline bundles

A zip per OS: the public site (`app/`), a small launcher, and empty `rom/` and `out/` folders. Unzip, put your own ROM in `rom/`, run the launcher. Nothing is installed and nothing is written outside the folder.

```
python tools/bundle/make_bundle.py                       # all targets, rebuilds the site
python tools/bundle/make_bundle.py --skip-site -t windows-x64
```

Needs Go 1.22+ (cross-compiles every target from one machine). Output: `build/bundles/` (ignored). The script refuses to zip any ROM-like file.

## Launcher (`launcher/`, Go standard library only)
- Serves `app/` on `127.0.0.1` (random port) and opens the default browser. Uses the user's own browser, not an embedded web view.
- Guards: requests must name its exact `host:port` (DNS rebinding), a per-run token is exchanged for an `HttpOnly; SameSite=Strict` cookie, and `/bundle/api/*` POSTs need a custom header plus a same-origin `Origin`/`Sec-Fetch-Site`.
- Injects `bridge.js`/`bridge.css` into pages whose CSP allows `script-src 'self'` and adds `connect-src 'self'` where a page has none. Redirect stubs are left alone.
- Panel ("ROM, builds & emulator", bottom right; open until the user hides it): **Use here** loads a ROM from `rom/` into the page's ROM picker; downloads made by the pages are saved to `out/` (toggle); each saved file has **Open** (the system's program for that file type), **Folder** (show it), and **Emulator** once one is set under *Your emulator* (program path + optional arguments, saved to `settings.json`; the path must exist; macOS `.app` bundles start via `open -a`).
- Opening uses `ShellExecuteW` (Windows), `open` (macOS), `xdg-open` (Linux). The emulator command from `settings.json` runs directly with arguments (no shell); `{rom}` is replaced by the file path. The launcher never searches the disk for emulators.

## Limits
- Not code-signed: SmartScreen / Gatekeeper warnings (the bundle README explains the bypass). Notarizing macOS needs an Apple developer account.
- Downloads are caught only where a page uses `a.download` + `a.click()` on a blob URL (every current tool does).
- Tested on Windows (API probes + Chrome). macOS/Linux builds compile but are untested.
