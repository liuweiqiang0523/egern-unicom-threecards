# 联通在线被动诊断（第一阶段）

添加地址：

https://raw.githubusercontent.com/liuweiqiang0523/egern-unicom-threecards/main/UnicomOnlineDiagnostic.yaml

## 现在只做这三步

1. Egern → 工具 → 模块 → ＋，**额外添加**上面的测试模块。原中国联通模块保持安装、启用，别替换它。
2. 打开联通 App，依次切换三个已有账号，分别进入首页查余额；每次切卡后正常操作即可，不必退出登录或重新登录。
3. Egern → 分析 → 左上角小组件画廊，打开「联通在线 · 被动诊断」（建议中号），刷新后只发这个测试组件截图。不要发日志、原始请求/响应、Cookie、token 或手机号。

此测试不改变原余额组件、成功时间、缓存或已存账号，也不发送任何额外在线刷新请求。若 App 自己不触发 onLine.htm，请求/响应可能仍为 0；查询余额并不保证触发该端点，不需要为了测试强制登录。

## 结果怎么读

- 请求/响应：测试脚本所在存储范围内累计观察次数，各自封顶 9999，不是账号数；不是成功刷新次数。并发写入不保证精确计数。
- appId/token 有无：曾在允许的请求字段中观察到非空字段，**不表示已保存凭据或已可刷新**。
- 请求字段 x/8：appId、token_online、version、deviceId、deviceCode、deviceModel、step、isFirstInstall 的累计存在标记。
- 响应字段 x/3：顶层 token_online、invalidat、code 的累计存在标记；不解释 code 值，不证明登录成功。
- Set-Cookie 有无：只检查响应头是否存在，不读取或保存内容。
- 绑定 false / UNBOUND_IDENTITY：这是本阶段预期结果。尚无经验证的 onLine 全账号身份契约；即使出现 mobile/phone 也不据此绑定，不按当前卡、尾号、时间先后或相邻余额请求猜账号。

## 隐私及隔离边界

仅拦截 HTTPS `m.client.10010.com/mobileService/onLine.htm` 的 POST，请求与响应均读取有限大小（64 KiB）的正文。只保留固定字段存在布尔、观察次数和固定未绑定码；原始正文、token、appId 值、设备值、号码、密码、Cookie **均不持久化、输出或上传**。不拦截 login.htm，不读取登录密码正文。无网络 API 调用、通知、日志或自动跳转；返回空值保持流量不改写。

三个测试脚本使用同一个独立 JS URL，只有专用 storage 键 `egern.unicom.online-diag.v1`。它不读取生产 slot/Cookie，也不承诺继承生产脚本的存储。新的测试抓取与测试组件能否在 iPhone 共享该存储仍须真机验证：若正常操作后一直 0，不能直接断言 App 没发请求，可能还有 MITM、脚本加载或测试存储作用域问题。

模块仅追加同一 host 的 MITM 声明，沿用已安装且受信任的 Egern 证书；不扩大到其他域名。不关闭 TLS 验证、不绕过证书锁定。若安装测试后 App 连接异常，立即禁用/删除这个测试模块，保留原模块，停止测试。

## 回退与后续

禁用/删除测试模块即可停止观察，原模块无需调整。删除模块不保证删除此前固定安全诊断记录；此阶段没有保存 token，因而无 token 留存清理问题。

发布与 Node 测试只证明脚本逻辑及配置结构；不证明手机已有 onLine 证据或三卡独立在线刷新可行。下一阶段需先解决可信完整账号绑定和真实 iOS 协议证据，再单独授权手机内刷新实验；本模块不会自动升级成主动刷新器。

官方依据：[脚本配置](https://egernapp.com/docs/configuration/scriptings)、[JavaScript API](https://egernapp.com/docs/javascript-api/)、[组件](https://egernapp.com/docs/configuration/widgets)。
