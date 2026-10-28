# Runtime acceptance

## Gate 0 — installation

The test APK is signed with an ephemeral GS test key.

Because its signature differs from the original DSH APK:

1. uninstall the currently installed DSH;
2. install the GS test APK;
3. reinstall the few external plugins if needed.

Do not test by trying to update the original package in place.

## Gate 1 — original browser chain still works

Ask the model:

> 请实际调用 browser 打开 https://example.com，然后 read 页面标题。

Expected:

- `browser action=open` executes;
- `browser action=read` returns `Example Domain`;
- no iframe-only fallback;
- no raw `<tool_calls>` text;
- no `PI_AI_ERROR`.

## Gate 2 — blocking permission prompt

In a session where ordinary Approval prompts are disabled, ask:

> 请调用 browser 打开 https://example.com 并实际操作。

Expected before the first mutating action:

```text
AI 浏览器权限
[拒绝] [允许 AI 控制 5 分钟]
```

The tool call must remain pending until the user chooses.

Reject:

- operation does not run;
- model receives a normal rejected result;
- no automatic re-ask loop.

Allow:

- operation runs in the same tool call;
- subsequent actions within the short control lease do not prompt on every click.

## Gate 3 — desktop mode

Ask:

> 用 browser 打开 https://example.com，mode=desktop。然后用 eval 返回 document.documentElement.clientWidth、navigator.userAgent。

Expected:

- `deviceMode=desktop`;
- requested layout width = 1366 CSS px;
- JS-visible UA reports the desktop profile;
- result explicitly contains `networkUserAgentChanged=false`.

A website can still detect Android at the HTTP request layer in this asset-only build. Do not mark that as native-UA PASS.

## Gate 4 — iPhone mode

Ask:

> 把当前 browser 切换成 iphone 模式，再读取 viewport 宽度和 navigator.userAgent。

Expected:

- mode = `iphone`;
- target viewport = 390 CSS px;
- JS-visible UA is iPhone Safari profile;
- network-level UA remains Android.

## Gate 5 — iPad mode

Same as Gate 4 with:

```text
mode=ipad
target width=820
```

## Gate 6 — AI operation remains native

Run a small sequence:

1. `read`
2. `click` using a returned index
3. `type` into a harmless text field
4. `screenshot`
5. `read` again

Expected:

- browser remains the native second WebView;
- user can see AI actions;
- existing “AI 操作中” control behavior remains;
- screenshot path is returned;
- no regression to curl/iframe simulation.

## Gate 7 — sensitive data boundary

For login / 2FA / payment:

- passwords and OTP values should be entered by the user in the webpage;
- model should not ask the user to paste those values into chat;
- if the user takes over, the model must read the page again before continuing.

## Gate 8 — content preservation

`scripts/verify_apk.py` must report:

```text
VERIFY=PASS
ENTRY_SET_IDENTICAL=YES
ONLY_CHANGED_ENTRY=assets/browser-tool.zip
CLASSES_DEX_UNCHANGED=YES
BROWSER_PANE_UNCHANGED=YES
```

## Native-UA milestone

Full Desktop/iPhone/iPad support is only complete when a later native patch can prove:

```text
WebSettings.userAgentString = requested profile
HTTP request UA = requested profile
viewport = requested profile
mode survives/reloads correctly
```

Until then, the UI/report must say “layout + JS UA emulation”, not “full iOS/desktop browser emulation”.
