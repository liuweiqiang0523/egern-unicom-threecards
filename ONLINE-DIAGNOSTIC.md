# 联通在线被动诊断 v2：只查入口与存储

模块地址（不变）：

https://raw.githubusercontent.com/liuweiqiang0523/egern-unicom-threecards/main/UnicomOnlineDiagnostic.yaml

## 手机只做这三步

1. 在 Egern 更新**已有「联通在线被动诊断」模块**，不要重复添加第二份；保留原中国联通生产模块，继续启用。若尚未安装诊断模块才额外添加一次。诊断组件名称仍为「联通在线 · 被动诊断」。
2. 打开诊断组件（建议中号）刷新，先确认出现 **BUILD ONLINE_ENTRANCE_V2**。若未出现，说明当前组件还未运行这版 JS，先更新原诊断模块和脚本，不通过重复安装解决。
3. 联通 App **正常启动一次或正常刷新首页一次**即可，再刷新诊断组件，只发该组件安全截图。无需继续切三卡、反复杀进程、退出登录或重新登录；不要开启抓包日志，不要发原始请求/响应、头、Cookie、token、设备信息或手机号。

这不是手机问题已修复，而是把原来混成 0/0 的情况拆开。正常操作也不保证 App 会发送 onLine；本轮不加余额接口阳性对照、不执行登录或主动刷新。

## 结果怎么读

- `BUILD ONLINE_ENTRANCE_V2`：仅证明当前 generic 组件运行了 v2，不证明 request/response hook 已更新或执行。
- `LOCAL WRITE_OK/WRITE_FAILED` 与 `READ_OK/READ_FAILED/MISSING/INVALID`：generic 对固定 `{probe:true}` 做同次本地写读。**本地自检≠hook共享证明**；写失败时即使读到旧探针也不能称写入成功。
- `HOOK READ_OK`：当前组件能读到格式版本匹配的 v2 记录。`MISSING` 是没有记录，`READ_FAILED` 是读取抛错，`INVALID` 是记录版本不匹配。没有可用记录时不再显示误导性的 0/0；这些状态仍不能区分 hook 未执行、URL/request 上下文缺失、hook 写失败、加载/MITM 或存储作用域不同。
- 只有可读记录才显示请求/响应入口累计数、`POST/OTHER` 分类累计数、最近一次 `request/response` 存在布尔及最近方法（只有 POST 或 OTHER）。先记录精确端点入口，不再因不是 POST 就跳过。入口计数不是账号数、登录成功数或成功刷新次数；各计数封顶 9999，并发写入不保证精确。
- `上次读取 READ_OK/MISSING/READ_FAILED/INVALID`：最近一次 hook 在保存前读取旧记录的固定状态。hook 写失败时不能可靠把失败码交给另一个上下文，因此不会假装能够从组件判断每次 hook 写入结果。
- explicit response hook 缺少 request URL 时不能确认属于审查过的端点，不记入口，也不运行 generic 探针。`response false` 可显示已知 response hook 缺少 response 的情况，但不能因此归因运行时问题。

## 安全和隔离

仅匹配 HTTPS `m.client.10010.com/mobileService/onLine.htm` 的既有精确 origin/path；不新增其他域名或路径。两类 hook 的 `body_required: false`，JS **不读取任何正文、头值、Cookie、token、appId、设备或号码字段**，不保存或打印原 URL/查询参数，不主动联网、不日志、不通知、不改写流量。

三个 script_url 保持完全相同。固定 v2 记录键 `egern.unicom.online-diag.v2`，generic 布尔探针键 `egern.unicom.online-diag.v2.local-probe`；读入记录再按白名单重建，计数安全有界，状态仅固定枚举。原 `egern.unicom.online-diag.v1` 字段存在记录完整保留但不读取、不展示为当前证据；不读取/改写生产 slot 或凭据。此新诊断 URL 的 hook 与组件存储是否共享仍须 iPhone 验证，Node 共享 Map 不是证明。

保持既有 MITM host，不更改证书、不关闭 TLS 验证、不绕过证书锁定。App 异常时立即禁用该诊断模块，保留原生产模块并停止测试。

## 回退与验证边界

禁用/删除诊断模块即可停止观察，不保证删除固定安全记录。发布前已建立 v1 备份分支；旧记录没有凭据值，v2 也不收集凭据。测试、CI 和远程文件校验只证明逻辑/配置/发布一致性，不能证明真机端点已经触发、0/0 根因已定位或三卡长期并存已恢复。

官方依据：[脚本配置](https://egernapp.com/docs/configuration/scriptings)、[JavaScript API](https://egernapp.com/docs/javascript-api/)、[组件](https://egernapp.com/docs/configuration/widgets)。
