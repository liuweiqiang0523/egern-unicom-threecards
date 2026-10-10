# 联通单卡本地种子绑定实验（无主动续期）

这是独立的被动实验，不是自动登录／刷新／三卡保活修复。生产三卡脚本、slot、缓存、成功时间与 UI 未改变。**BOUND_READY 只证明本地精确会话关联，不证明 token 可续期、有效 TTL 或三卡长期并存。**

## 安装与一次验收

模块 URL（可直接添加，不是分享 YAML）：

`https://raw.githubusercontent.com/liuweiqiang0523/egern-unicom-threecards/main/UnicomLocalSeed-V1.yaml`

1. **先禁用旧「联通在线被动诊断」模块**（包括 V3/V3-1），再添加本模块。不要双开两个余额 response 诊断：Egern 未声明多个同阶段 hook 的叠加顺序。保留生产「中国联通」模块／生产 request 捕获，本实验没有余额 request hook。
2. 打开「联通单卡 · 本地种子」中号组件，确认 `BUILD LOCAL_SEED_V1`。
3. 仅对你选定的**当前一张卡**在联通 App 完成一次正常登录，然后正常查一次余额。**不用登录另两张卡，不反复切卡、不要求原始日志。** 本脚本不代你登录、不提交密码／验证码。
4. 只反馈这个实验组件的安全截图：BUILD、状态、seed/bound/token/appId 布尔。不要分享 storage、请求／响应正文、Cookie 或任何凭据。截图不含手机号／token。
5. 若 App 异常，立即禁用本实验。不要关闭 TLS、绕过证书锁定或继续重复登录。

## 实际读取范围与隐私

用户已授权这一次单卡实验的**本机 token/appId/session 存储**，不授权上传或保存密码／OTP。

- 仅精确 HTTPS `m.client.10010.com/mobileService/login.htm` 的 POST **响应上下文**解析：同一响应 code 必须为数字 0 或字符串 "0"、HTTP 200；仅选取顶层 `token_online`、`ecs_token`，对应同次请求仅选取 `appId`、`version`。不猜 appId、版本、设备 ID，不拼接不同登录字段。
- **不能声称完全不接触登录正文**：`ctx.request.text()` 必须将请求原文短暂读入内存以抽取允许字段。form 只解码 appId/version 的值，其他字段只扫描键；JSON 用限制深度的语法扫描器跳过其他值，不建立完整密码／手机号／OTP 对象。原文不会持久化、记录、显示或上传，异常不读取 message。response 也只选取允许字段。
- 官方 [JavaScript API](https://egernapp.com/docs/javascript-api/) 声明 response 脚本可有 `ctx.request`、text/body。**没有证明 body_required:true 在所有 iOS 版本都会保留关联请求正文**；本模块不额外加登录 request hook 收集私密正文。正文缺失／不可读会报 `REQUEST_BODY_UNAVAILABLE`／`PAYLOAD_INVALID`；没有 appId 报 `APPID_MISSING`，绝不猜值或尝试刷新。
- 随后的精确 `/mobileserviceimportant/home/queryUserInfoSeven` GET **响应 hook**只看该响应关联请求中的完整单一 `desmobiel` 和单一 Cookie `ecs_token`。同名重复／大小写歧义／多值头拒绝，号码必须是完整有效格式；与种子 ecs **全字符串相等**才可原子绑定，不用当前卡、尾四位、时间邻近、slot 顺序推断。
- **完全不读取余额响应正文、余额请求正文或余额响应头**。Cookie／URL仅在内存解析，不保存整个 Cookie、header、URL。没有 `ctx.http`、fetch、通知、日志、token 上传或主动续期代码。
- 独立键 `egern.unicom.local-seed.v1.state`，独立 JS URL；不读写生产 `egern.unicom3.v1.slot.N`，不假定能继承生产 storage。本实验三个入口复用同一个 pinned JS URL，**Node 共享 Map 不能证明新 URL 的 iPhone hook↔widget 存储可见性**。

## 本地状态与保守拒绝

唯一状态对象白名单：schema/status/seed/bound。seed 仅 token_online/ecs_token/appId/version/createdAt；bound 仅完整 phone 与同一 seed。credential 有长度和控制字符限制。组件二次验证 storage，不回显任意状态字符串或凭据；不显示任何手机号。

- `SEED_PENDING`：成功登录可用字段已读到，尚未精确绑定。
- `BOUND_READY`：同一 ecs 与完整号码已绑定（**未联网验证续期**）。
- `ECS_MISMATCH`／`BALANCE_INVALID`：关联失败，绝不拿当前会话套另一个号码。
- `CANDIDATE_COLLISION`：已有待绑定 seed 又遇到有效 seed，保留原 seed 并锁住绑定；后续错误也不会解除锁，直到 24 小时 pending 到期。不会任意挑一个登录。
- `SEED_EXPIRED`：pending 超过 24 小时或时钟倒退，下一次 hook／widget 时删除。没有后台定时器，**24 小时是接受上限，不是保证届时物理删除**；闲置 Egern 未执行时仍可在本机留存。24 小时不是联通 token 有效期。
- `BOUND_LOCKED`：已绑定后新的登录／其他身份会被拒绝；不会静默替换手机号、自动重置。没有 Env reset 开关。bound 凭据保留在本机直到用户明确手动清理实验存储；禁用／删除模块不保证删除 storage。
- `STATE_INVALID`：存储损坏或不可读，不继续读出凭据；写失败无法可靠在其他上下文报告。

请求解析结束后才同步读取状态、同步 setJSON，读→改→写间不 await；一次绑定用一个 setJSON，不拆分账号和 token。Egern 官方没有 storage CAS／跨运行时锁契约；并发独立运行时的强事务保证仍未知，本实验只安排一次登录＋一次余额查询，不宣称对任意跨进程竞态已证明安全。

## 回退及验证边界

禁用本实验、保留生产模块即可停用；不删除生产 slot、不改缓存。旧 diagnostic 要重启时先禁用本实验。若遇到请求正文／appId 缺失，停止这一轮，反馈安全状态即可；不再加泛域名抓包或猜接口。本交付仅为安全被动获取／绑定实验，**没有主动 renewal**。

仓库测试覆盖允许字段快照、重复 JSON/form、恶意 URL、重复 cookie/号码、跨账号拒绝、过期、并发解析隔离、无正文／无日志／无网络、未知 script.name generic/hook。CI 还执行原生产浏览器固定 frame 回归。测试／CI／raw 校验不代表手机登录 hook 或新存储作用域已实测；真机仍须上面一次安全验收。
