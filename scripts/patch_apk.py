#!/usr/bin/env python3
import argparse
import hashlib
import io
import json
import shutil
import tempfile
import zipfile
from pathlib import Path

BASE_SHA256 = "d12735f679bdac29bd4f3c17425c738e0340aeae376f71eb675ad28cb878a430"
ASSET = "assets/browser-tool.zip"

DEVICE_BLOCK = r"""
/** Browser control lease + page-layout device profiles. */
const CONTROL_LEASE_MS = 5 * 60 * 1000;
const DEVICE_MODES = ['auto', 'desktop', 'iphone', 'ipad'];
const DEVICE_PROFILES = {
  auto: { width: 0, ua: '', platform: '' },
  desktop: {
    width: 1366,
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    platform: 'Win32',
  },
  iphone: {
    width: 390,
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
    platform: 'iPhone',
  },
  ipad: {
    width: 820,
    ua: 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
    platform: 'iPad',
  },
};
"""

HELPERS = r"""
function normalizeMode(value) {
  return DEVICE_MODES.includes(value) ? value : 'auto';
}

function isMutating(args) {
  if (!args || typeof args.action !== 'string') return false;
  if (['read', 'screenshot', 'wait'].includes(args.action)) return false;
  if (args.action === 'tabs' && (!args.sub || args.sub === 'list')) return false;
  return true;
}

function originOf(raw) {
  try {
    const value = /^[a-z][a-z0-9+.-]*:/i.test(String(raw || '')) ? String(raw) : `https://${raw}`;
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function deviceScript(mode) {
  const key = normalizeMode(mode);
  const profile = DEVICE_PROFILES[key];
  return `(() => {
    const mode = ${JSON.stringify(key)};
    const width = ${profile.width};
    const ua = ${JSON.stringify(profile.ua)};
    const platform = ${JSON.stringify(profile.platform)};
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      (document.head || document.documentElement).appendChild(meta);
    }
    if (!width) {
      meta.setAttribute('content', 'width=device-width,initial-scale=1,user-scalable=yes');
    } else {
      const sw = Math.max(1, Number(screen && screen.width) || Number(innerWidth) || 360);
      const scale = Math.max(0.1, Math.min(1, sw / width));
      meta.setAttribute('content',
        'width=' + width + ',initial-scale=' + scale.toFixed(4)
        + ',minimum-scale=0.1,maximum-scale=5,user-scalable=yes');
    }
    try {
      if (ua) Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => ua });
      if (platform) Object.defineProperty(navigator, 'platform', { configurable: true, get: () => platform });
    } catch (_) {}
    try { window.dispatchEvent(new Event('resize')); } catch (_) {}
    return JSON.stringify({
      ok: true,
      mode,
      requestedWidth: width || 'device-width',
      viewportWidth: document.documentElement ? document.documentElement.clientWidth : innerWidth,
      viewportHeight: document.documentElement ? document.documentElement.clientHeight : innerHeight,
      jsUserAgent: navigator.userAgent,
      networkUserAgentChanged: false,
    });
  })()`;
}

async function requestControl(ctx, exec, args, state) {
  if (!isMutating(args)) return { allowed: true, reused: true };

  const now = Date.now();
  const targetOrigin = args.action === 'open' ? originOf(args.url) : state.origin;
  if (state.until > now && (!targetOrigin || !state.origin || targetOrigin === state.origin)) {
    return { allowed: true, reused: true };
  }

  const allowLabel = '允许 AI 控制 5 分钟';
  const denyLabel = '拒绝';
  const id = 'android-browser-control';
  const answer = await ctx.userQuestions.ask({
    agent: exec?.agent,
    signal: exec?.signal,
    questions: [{
      id,
      header: 'AI 浏览器权限',
      question: `允许 AI ${args.action === 'open' ? '打开并操作网页' : '继续操作当前网页'}吗？`,
      detail: `操作：${args.describe || args.action}\n${targetOrigin ? `网站：${targetOrigin}\n` : ''}授权后 5 分钟内可连续操作。密码、验证码和支付确认不要发送给 AI。`,
      options: [
        { label: allowLabel, description: '仅授予当前 AI 浏览器短时控制权' },
        { label: denyLabel, description: '不执行本次控制操作' },
      ],
      intent: {
        kind: 'approval',
        approve: allowLabel,
        reject: denyLabel,
        subject: { name: targetOrigin || 'AI 浏览器' },
      },
    }],
  });

  const selected = answer?.answers?.find((item) => item?.id === id)?.selected;
  if (!Array.isArray(selected) || !selected.includes(allowLabel)) {
    state.until = 0;
    return { allowed: false, reused: false };
  }

  state.until = now + CONTROL_LEASE_MS;
  state.origin = targetOrigin || state.origin || '';
  return { allowed: true, reused: false };
}
"""

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"patch anchor missing: {label}")
    return text.replace(old, new, 1)

def patch_index(source: str) -> str:
    s = source

    s = replace_once(
        s,
        "export const inject = ['tools'];",
        "export const inject = ['tools', 'userQuestions'];",
        "inject",
    )
    s = replace_once(
        s,
        "'screenshot', 'back', 'forward', 'reload', 'tabs', 'wait', 'eval',",
        "'screenshot', 'back', 'forward', 'reload', 'tabs', 'wait', 'eval', 'device',",
        "actions",
    )
    s = replace_once(
        s,
        "const POLL_INTERVAL_MS = 80;",
        "const POLL_INTERVAL_MS = 80;\n" + DEVICE_BLOCK.strip(),
        "device constants",
    )

    # Make the new behavior visible to the model without rewriting the original long description.
    s = replace_once(
        s,
        "- Up to 6 tabs. \`{action:\"tabs\", sub:\"new\", url:\"...\"}\` opens one.`;",
        """- Up to 6 tabs. \`{action:\"tabs\", sub:\"new\", url:\"...\"}\` opens one.

## Device modes and permission

- \`open\` accepts \`mode:\"auto\"|\"desktop\"|\"iphone\"|\"ipad\"\`.
- \`{action:\"device\", mode:\"desktop\"}\` changes the current page layout.
- Device mode changes the layout viewport and JS-visible UA only. Network WebView UA is still Android in this asset-only build.
- The first mutating browser action requests a blocking User Questions permission; an approved control lease lasts 5 minutes.
- \`read\`, \`screenshot\`, \`wait\`, and \`tabs:list\` remain read-only.`;""",
        "description",
    )

    s = replace_once(s, "function validate(args) {", HELPERS + "\nfunction validate(args) {", "helpers")

    s = replace_once(
        s,
        "\tif (args.action === 'wait' && !args.text && !args.selector) {\n"
        "\t\treturn '✗ wait 需要 text 或 selector。';\n"
        "\t}\n\treturn '';",
        "\tif (args.action === 'wait' && !args.text && !args.selector) {\n"
        "\t\treturn '✗ wait 需要 text 或 selector。';\n"
        "\t}\n"
        "\tif ((args.action === 'device' || args.mode !== undefined) && !DEVICE_MODES.includes(args.mode ?? 'auto')) {\n"
        "\t\treturn \`✗ mode 必须是：\${DEVICE_MODES.join(', ')}\`;\n"
        "\t}\n"
        "\tif (args.action === 'device' && typeof args.mode !== 'string') {\n"
        "\t\treturn '✗ device 需要 mode。';\n"
        "\t}\n"
        "\treturn '';",
        "validation",
    )

    s = replace_once(
        s,
        "\t\tcase 'eval':",
        "\t\tcase 'device':\n"
        "\t\t\treturn \`✓ 已切换设备布局：\${args.mode ?? 'auto'}。网络请求 UA 仍由 Android WebView 决定。\`;\n"
        "\t\tcase 'eval':",
        "device render",
    )

    s = replace_once(s, "function browserTool(home) {", "function browserTool(home, ctx) {", "tool signature")
    s = replace_once(
        s,
        "\tlet seq = 0;\n\n\treturn {",
        "\tlet seq = 0;\n\tconst control = { until: 0, origin: '' };\n\n\treturn {",
        "control state",
    )

    url_block = (
        "\t\t\t\turl: {\n"
        "\t\t\t\t\ttype: 'string',\n"
        "\t\t\t\t\tdescription: 'For action:\"open\" and action:\"tabs\" with sub:\"new\". A full URL (https://…). Bare domains also work.',\n"
        "\t\t\t\t},\n"
    )
    s = replace_once(
        s,
        url_block,
        url_block
        + "\t\t\t\tmode: {\n"
          "\t\t\t\t\ttype: 'string',\n"
          "\t\t\t\t\tenum: DEVICE_MODES,\n"
          "\t\t\t\t\tdescription: 'For open/device: auto, desktop (1366 CSS px), iphone (390), ipad (820). Network UA is unchanged in this build.',\n"
          "\t\t\t\t},\n",
        "mode schema",
    )

    s = replace_once(
        s,
        "\t\tasync execute(args) {\n"
        "\t\t\tconst bad = validate(args ?? {});\n"
        "\t\t\tif (bad !== '') return { ok: false, message: bad };",
        "\t\tasync execute(args, exec) {\n"
        "\t\t\tconst bad = validate(args ?? {});\n"
        "\t\t\tif (bad !== '') return { ok: false, message: bad };\n\n"
        "\t\t\tconst permission = await requestControl(ctx, exec, args ?? {}, control);\n"
        "\t\t\tif (!permission.allowed) {\n"
        "\t\t\t\treturn { ok: false, message: '✗ 用户拒绝了本次 AI 浏览器控制。', details: { permission: 'rejected' } };\n"
        "\t\t\t}\n\n"
        "\t\t\tif (args.action === 'device') {\n"
        "\t\t\t\tconst reply = await sendCommand(home, ++seq, { action: 'eval', js: deviceScript(args.mode), describe: args.describe || \`切换到 \${args.mode} 网页布局\` });\n"
        "\t\t\t\tif (reply?.ok !== true) control.until = 0;\n"
        "\t\t\t\treturn { ok: reply?.ok === true, message: reply?.ok === true ? render(args, reply) : \`✗ \${reply?.error ?? '切换设备布局失败'}\`, details: { ...reply, mode: args.mode, permission: permission.reused ? 'lease' : 'approved' } };\n"
        "\t\t\t}",
        "execute permission",
    )

    s = replace_once(
        s,
        "\t\t\tconst reply = await sendCommand(home, ++seq, payload);\n\n"
        "\t\t\tif (args.action === 'read' && Array.isArray(reply?.elements)) {",
        "\t\t\tconst reply = await sendCommand(home, ++seq, payload);\n\n"
        "\t\t\tif (reply?.ok !== true && args.action !== 'read') control.until = 0;\n"
        "\t\t\tif (args.action === 'open' && reply?.ok === true) {\n"
        "\t\t\t\tconst nextOrigin = originOf(reply.url || args.url);\n"
        "\t\t\t\tif (control.origin && nextOrigin && control.origin !== nextOrigin) control.until = 0;\n"
        "\t\t\t\tcontrol.origin = nextOrigin || control.origin;\n"
        "\t\t\t\tif (args.mode) {\n"
        "\t\t\t\t\tconst modeReply = await sendCommand(home, ++seq, { action: 'eval', js: deviceScript(args.mode), describe: \`切换到 \${args.mode} 网页布局\` });\n"
        "\t\t\t\t\treply.deviceMode = normalizeMode(args.mode);\n"
        "\t\t\t\t\treply.deviceModeApplied = modeReply?.ok === true;\n"
        "\t\t\t\t\treply.networkUserAgentChanged = false;\n"
        "\t\t\t\t}\n"
        "\t\t\t}\n\n"
        "\t\t\tif (args.action === 'read' && Array.isArray(reply?.elements)) {",
        "open mode",
    )

    s = replace_once(
        s,
        "\t\t\t\tdetails: reply,",
        "\t\t\t\tdetails: { ...reply, permission: permission.reused ? 'lease' : 'approved' },",
        "permission metadata",
    )
    s = replace_once(
        s,
        "ctx.tools.register(browserTool(home));",
        "ctx.tools.register(browserTool(home, ctx));",
        "ctx",
    )
    return s

def patch_browser_tool(blob: bytes) -> bytes:
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        with zipfile.ZipFile(io.BytesIO(blob), "r") as zin:
            zin.extractall(root)

        index = root / "lib" / "index.js"
        package = root / "package.json"
        original = index.read_text(encoding="utf-8")
        patched = patch_index(original)
        index.write_text(patched, encoding="utf-8")

        meta = json.loads(package.read_text(encoding="utf-8"))
        meta["version"] = "1.1.0"
        meta["description"] = "DSH Android native AI browser with blocking control approval and device layout modes."
        package.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        out = io.BytesIO()
        with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zout:
            for path in sorted(root.rglob("*")):
                if path.is_file():
                    zout.write(path, path.relative_to(root).as_posix())
        return out.getvalue()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--allow-other-base", action="store_true")
    args = ap.parse_args()

    actual = sha256(args.base)
    if not args.allow_other_base and actual != BASE_SHA256:
        raise SystemExit(f"BASE_SHA256_MISMATCH expected={BASE_SHA256} actual={actual}")

    with zipfile.ZipFile(args.base, "r") as zin:
        if ASSET not in zin.namelist():
            raise SystemExit(f"missing {ASSET}")
        replacement = patch_browser_tool(zin.read(ASSET))

        with zipfile.ZipFile(args.out, "w") as zout:
            for info in zin.infolist():
                data = replacement if info.filename == ASSET else zin.read(info.filename)
                clone = zipfile.ZipInfo(info.filename, info.date_time)
                clone.compress_type = info.compress_type
                clone.comment = info.comment
                clone.extra = info.extra
                clone.internal_attr = info.internal_attr
                clone.external_attr = info.external_attr
                clone.create_system = info.create_system
                clone.flag_bits = info.flag_bits & ~0x08
                zout.writestr(clone, data)

    print(f"BASE_SHA256={actual}")
    print(f"OUTPUT={args.out}")
    print(f"OUTPUT_SHA256={sha256(args.out)}")
    print(f"CHANGED_ENTRY={ASSET}")

if __name__ == "__main__":
    main()
