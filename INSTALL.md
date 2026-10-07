# Egern 联通三卡

模块：
https://raw.githubusercontent.com/liuweiqiang0523/egern-unicom-threecards/main/UnicomThreeCards.yaml

脚本：
https://raw.githubusercontent.com/liuweiqiang0523/egern-unicom-threecards/main/UnicomThreeCards.js

## 已安装用户升级

在 Egern 更新模块及其远程 JS 脚本，再刷新组件即可。不要删除模块、清空存储或重新添加组件。此次外观升级保留已有卡槽、手机号及 Cookie，**无需重新抓取**。旧格式缓存会主动查询升级；网络失败时保留有效期内的旧缓存并标记“旧缓存（查询失败）”，使用中性标题，不猜测已用/剩余。

## 首次安装

1. 导入并启用模块，开启所需 MITM，安装并信任证书。
2. 打开联通 App，依次切换三个号码并查询余额。首次有效捕获顺序就是卡1、卡2、卡3。
3. 添加三个独立桌面组件：中国联通卡1、中国联通卡2、中国联通卡3。

不需要填写手机号或 Cookie。各组件已独立设置 CARD_SLOT=1/2/3，不要在模块级设置 CARD_SLOT。重复捕获同号保留原槽位，第四号不覆盖已有三卡。

## 外观

中/大号：左侧红色卡图标、标题及卡序，右侧 HH:mm（北京时间），下方三枚浅灰圆角胶囊。小号：话费居中，下方语音/流量两枚胶囊。支持浅色/深色、锁屏精简布局；缓存提示在角落，无数据或登录失效单独显示。

标题直接使用 API 的 dynamicFeeTitle / dynamicVoiceTitle / dynamicFlowTitle；例如“剩余通用流量”或“已用流量”按接口原义显示。缺失/异常标题使用“话费/语音/流量”，不会按数值推断剩余。保留 GB 等原单位及负话费。

可选 Env（不填也可正常使用，在模块或单个组件的 Env 中设置）：

| 字段 | 默认 | 用途 |
| --- | --- | --- |
| TRANSLUCENT | false | true/on/1 开启半透明背景；false/off/0 关闭 |
| WIDGET_TITLE | 中国联通 | 自定义短标题（最多24字符）；单个组件可分别设置 |

半透明使用 Egern 官方支持的 #RRGGBBAA，**不等于调用 iOS 系统磨砂材质**，最终显示以 iPhone 为准。此联通接口契约没有可靠的定向流量/总量/独立已用字段，因此不照搬电信组件“定向流量”“显示已用”开关，也不把已用标题改成剩余。

## 隐私及验证

凭据、每卡缓存只保存在本机；界面只显示卡序，不显示完整号码。请求精确校验域名、路径与号码，手机号/Cookie 原子绑定，各卡独立缓存，Cookie-only 不覆盖，凭据轮换不会写入旧响应。不上传 Cookie 或网络日志。正常升级不改存储键；真正登录失效仍需在 App 查询以更新凭据。

用户已实机确认三个账号自动获取成功及抓取/组件存储共享。本次新布局有 Node DSL/回归测试，但仍需用户在 iPhone 检查最终排版，未生成或冒充真机效果图。更早的 account.* 和单卡 unicom_cookie/unicom_phone 记录仍原样保留，不自动混绑。

## 来源与开发

独立实现，参考 [IBL3ND/module](https://github.com/IBL3ND/module) 的联通 API 契约与布局（审阅 SHA：44871f7f8023db177a83e16117f3c11f6263b98a），不发布上游代码或审计快照。

DSL：[Egern Widgets 官方文档](https://egernapp.com/docs/configuration/widgets/)。本地验证：`npm run check && npm test`；YAML 用 Ruby 标准库解析。GitHub Actions 自动执行相同检查。
