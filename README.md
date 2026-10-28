# DSH Android Native Browser Patch

以 **DSH0.4.1-v70** 完整 APK 为基线的增量增强工程。

目标不是重做 DSH，也不是删除原功能；只增强 APK 已经存在的 Native AI Browser：

- 保留原有 `browser` 原生 WebView 工具链：`open/read/click/type/press/scroll/screenshot/back/forward/reload/tabs/wait/eval`。
- 增加 **User Questions 阻塞式权限确认**。即使全局 Approval prompts 被关闭，也不会静默 `rejected`。
- 首次写操作授权后获得短时控制租约，避免每个 click 都弹一次；失败后清除租约。
- 增加 `mode=auto|desktop|iphone|ipad`。
- 增加 `action=device`，可在当前页面切换布局模式。
- Desktop = 1366 CSS px，iPhone = 390 CSS px，iPad = 820 CSS px。
- 当前资产层版本会同时模拟 JS 可见的 `navigator.userAgent`，但**网络层 WebView UA 仍保持 Android**；仓库不会把这一点伪装成完整 UA 切换。
- 密码、OTP、支付确认仍要求用户在网页中处理；模型不得要求用户把这些值发到聊天。

## 基线

已审计的用户 APK：

- 文件：`DSH0.4.1-v70(1).apk`
- 大小：147,052,182 bytes
- SHA-256：`d12735f679bdac29bd4f3c17425c738e0340aeae376f71eb675ad28cb878a430`
- 内置浏览器模块：
  - `assets/browser-tool.zip`
  - `assets/browser-pane.zip`
- 原 APK 已存在：
  - `com.dsh.android.browser.AiBrowserView`
  - `com.dsh.android.browser.BrowserBridge`
  - `browser-cmd.json / browser-result.json`
  - 真正 Native WebView 的 read/click/type/eval/screenshot 等能力。

原 APK 约 147MB，超过 GitHub 普通 Git 单文件 100MB 限制，因此**不把 base.apk 提交进 Git 历史**。

## 目录

```text
patches/
  browser-tool/
    package.json
    lib/index.js
scripts/
  patch_apk.py
  verify_apk.py
.github/workflows/
  build-patched-apk.yml
docs/
  ACCEPTANCE.md
  BASELINE.md
```

## 本地构建

```bash
python3 scripts/patch_apk.py \
  --base /path/to/DSH0.4.1-v70.apk \
  --out DSH0.4.1-v70-browser-enhanced-unsigned.apk

python3 scripts/verify_apk.py \
  --base /path/to/DSH0.4.1-v70.apk \
  --candidate DSH0.4.1-v70-browser-enhanced-unsigned.apk
```

随后使用 Android SDK 的 `apksigner` 进行 v2/v3 签名。Android 11+ 对目标 API 30+ 的 APK 不能只用 v1/JAR 签名。

## GitHub Actions

手动运行 **Build patched APK**，传入可直接下载的 `base_apk_url`。

工作流会：

1. 下载 base APK；
2. 强制核对基线 SHA-256；
3. 运行 patcher；
4. 验证除允许变更项外的 ZIP entry 均保持一致；
5. 生成临时测试 keystore；
6. 使用 Android `apksigner` 进行 v2/v3 签名；
7. 上传最终 APK 和 SHA256SUMS 为 Actions artifact。

测试签名与原 APK 签名不同，因此第一次安装应先卸载原 DSH。当前用户已确认没有重要 App 数据，仅安装了几个插件，可接受重新安装。

## 当前能力边界

### 已实现 / 资产层

- Native browser AI 操作链继续使用现有 `BrowserBridge`。
- 阻塞式浏览器控制授权。
- Desktop/iPhone/iPad viewport 模式。
- JS-visible UA compatibility emulation。
- 公开反馈真实能力边界。

### 后续 Native DEX / 源码层

要做到**网络请求层**真正 Desktop/iOS UA，需要给 `AiBrowserView/WebView.settings.userAgentString` 增加可切换入口。这不能通过页面 JavaScript可靠完成。

因此当前版本必须报告：

```text
viewport_mode = REAL
js_user_agent_emulation = REAL
network_user_agent_changed = FALSE
native_read_click_type = REAL
```
