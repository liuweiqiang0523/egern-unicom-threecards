# 联通在线被动诊断 v3.1：generic 入口兼容与余额响应对照

最新可直接添加的模块地址（仅替换已有诊断 URL，不与旧诊断重复启用）：

https://raw.githubusercontent.com/liuweiqiang0523/egern-unicom-threecards/main/UnicomOnlineDiagnostic-V3-1.yaml

## 先验收可见 BUILD

v3 截图只有组件标题、没有 BUILD/LOCAL，手机实际根因尚未确认。已在 Node 复现：generic 的 script.name 带模块前缀、不同或缺失时，旧分派返回 undefined。v3.1 只增加官方 generic-only widgetFamily 的独立识别，并要求 request/response 均不存在；不放宽三个 hook 固定名字、不保存实际脚本名或任何凭据/URL 值。

将已有测试模块 URL 换成上面的 V3-1 地址，保留原生产模块。新文件名与新的 pinned JS URL 用于区分加载版本，不保证绕过全部手机缓存。**现在先只确认诊断组件出现 BUILD ONLINE_CONTROL_V3_1 和 LOCAL 状态并回传安全截图；未看到 BUILD 前不要求 App 登录、切卡或查询。** Node/CI 修复不等于 iPhone 空白已解决。

## BUILD 可见后只做一次正常查询

1. 更新**已有「联通在线被动诊断」模块**，不要重复添加或替换生产模块，生产中国联通模块继续保留。
2. 同时更新该诊断的远程脚本，打开诊断组件确认 **BUILD ONLINE_CONTROL_V3_1**。官方模块和脚本配置分别有 `update_interval`（默认一天），更新模块不证明所有 hook 的 JS 已更新；generic 的 BUILD 也不证明各 hook 已运行新版。使用当前 Egern 提供的模块/脚本更新入口；不同版本 UI 位置可能不同，本说明不臆造按钮或开关。未见 BUILD 时先处理加载，不重复安装。
3. 只等待联通 App **正常查一次余额/正常刷新首页余额**，再查看诊断组件，分享安全截图即可。无需重登、反复切三卡或杀进程，不开启日志，不发送原始 URL、请求/响应、头、手机号、Cookie、token 或设备信息。

v2 的 LOCAL WRITE_OK READ_OK / HOOK MISSING 以及重登后仍缺记录，均未证明根因。本轮只新增生产已知余额端点的一个 **http_response** 对照，不增加余额 request hook，避免与生产 request 捕获重叠；没有主动登录/刷新调用。

## 固定状态含义

- `BUILD ONLINE_CONTROL_V3_1`：当前 generic 脚本版本；不是手机修复证明。
- `LOCAL WRITE_OK/WRITE_FAILED` 和 `READ_OK/READ_FAILED/MISSING/INVALID`：generic 的固定 `{probe:true}` 同次本地自检。**本地自检≠hook共享证明**，读到旧探针也不能覆盖写失败。
- 三条路径各自显示 `online-request`、`online-response`、`balance-response` 的 `READ_OK/MISSING/READ_FAILED/INVALID`。`MISSING` 只表示组件未读到该独立记录；`READ_FAILED` 是读取抛错；`INVALID` 是版本不匹配；缺记录不显示误导性 0 次。
- 可读记录显示 `入口`（累计调用次数，封顶9999，不是账号数/成功数，并发不保证精确）和 `CONTEXT_OK/CONTEXT_INVALID`。入口由官方 **ctx.script.name** 的三个固定名字先分类，立即保存安全计数，再做 URL/context 检查。因而缺 request、错误 URL 或缺 response 也能留下 `CONTEXT_INVALID`，不再与缺记录混为一谈。没有/未知 script.name 不登记 hook 命中；generic 仅在无 request 且无 response、并有官方已识别 widgetFamily 时独立识别，不依赖脚本名精确相等。原固定 generic 名仍支持无 widgetFamily 的手动运行。
- `requestPresent/responsePresent`（组件简写 request/response）只表示对象是否存在；`urlMatch` 只表示内存中精确 HTTPS origin/path 匹配；响应 hook 还需 response 存在才 `CONTEXT_OK`。均不说明认证、响应成功或凭据可用。
- `writeReadbackOK` 表示该 hook 在同次调用中对前一安全写入成功读回且白名单字段一致；不是最后一次状态保存成功保证、不是跨 hook/组件共享证明。最终写失败无法可靠由另一个上下文报告，可能只看到较早的安全记录，false 不单独证明 storage 故障。

## 下一步分支（不猜新端点）

- 对照 READ_OK + CONTEXT_OK，在线 MISSING：只支持“组件可见余额响应 hook 证据，而在线 hook 暂无可见记录”；不证明 App 没有 onLine，也不排除在线脚本单独缓存、加载/匹配/存储差异。
- 任一路径 READ_OK + CONTEXT_INVALID：该固定脚本已产生可见入口记录，但上下文未满足检查；不要把它当作余额或 onLine 成功。
- **余额对照与两个在线路径均 MISSING：停止猜端点、停止重登/反复切卡。** 下一步需要安全的脚本注册/加载证据：仅诊断模块是否启用、三个固定脚本名/类型是否注册、它们是否使用本诊断 JS、组件 BUILD。截图先遮住其他脚本私人 URL/参数及账号信息；不要原始网络日志。
- READ_FAILED/INVALID：先确认读取/版本与加载状态，不据此修改生产凭据。

## 安全隔离与响应重叠限制

仅观察同一既有域名 `m.client.10010.com`，精确路径 `/mobileService/onLine.htm` 与生产已用 `/mobileserviceimportant/home/queryUserInfoSeven`。保留既有 MITM host；不改证书、不关闭 TLS、不绕过锁定。App 异常时立即禁用诊断模块并停止。

三个 hook 均 `body_required:false`。JS 不读正文、头、方法、手机号或凭据值；只为精确 origin/path 检查在内存读取 URL，绝不保存或输出 URL/查询参数。没有联网、日志、通知、流量修改。四个脚本复用同一个固定提交 SHA 的诊断 JS URL。旧 UnicomOnlineDiagnostic-V3.yaml 保留原 SHA，不覆盖；旧 UnicomOnlineDiagnostic.yaml 兼容地址保留，但本轮只交付新 V3-1 URL。

官方说明启用模块会合并到主配置，未在所引用文档中保证多模块相同 URL 响应脚本的运行顺序、叠加或优先级。生产本项目只有余额 request 捕获，本次对照是 response，但**用户其他模块未知**，仍可能有余额 response 重叠。不能承诺所有响应 hook 同时执行，不能以对照缺记录推断网络端点不存在。不要为测试擅自关掉其他生产模块。

固定独立键为 `egern.unicom.online-diag.v3.online-request`、`.online-response`、`.balance-response`，探针为 `egern.unicom.online-diag.v3.local-probe`。记录只含 schema=3、entrySeen、四个布尔及固定 contextStatus；读入后按白名单重建。v1/v2 记录保留但不读取、不作为本轮证据，不读取/改写生产 slot。可见安全记录不是已捕获刷新凭据，本轮没有账号绑定或主动刷新实现。

## 回退与验证边界

修改前保留备份分支 `backup/online-diagnostic-before-v3-cac8cba`。禁用诊断即可停止观察，安全记录不保证被删除。生产 JS/YAML、UI、缓存与凭据均未改动。Node mock、浏览器生产回归、YAML 解析、同 SHA CI 和远程字节核对不证明 iPhone hook 已触发、根因已定位或三卡会话长期恢复。

官方依据：[JavaScript API（ctx.script.name、storage、pass-through）](https://egernapp.com/docs/javascript-api/)、[脚本（body_required、独立 update_interval）](https://egernapp.com/docs/configuration/scriptings)、[模块（合并与独立更新周期）](https://egernapp.com/docs/configuration/modules)。
