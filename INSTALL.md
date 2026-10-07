# Egern 联通三卡

模块链接（不变）：
https://raw.githubusercontent.com/liuweiqiang0523/egern-unicom-threecards/main/UnicomThreeCards.yaml

1. 在 Egern 刷新/更新此模块和脚本；开启模块及所需 MITM，证书须已安装并信任。
2. 打开联通 App，依次切换三个号码并查询余额。首次有效捕获顺序就是卡1、卡2、卡3。
3. 添加三个独立桌面组件：中国联通卡1、中国联通卡2、中国联通卡3。

不需要填写手机号、Cookie、模块 Env 或运行存储探针。CARD_SLOT 已在各组件内设为 1/2/3，不要在模块级设置它。每张卡分别显示话费、语音、流量，没有汇总组件。

重复查询同号只更新原卡；第四个号码忽略，不覆盖已有三卡。请求必须同时带有效号码和 Cookie 才捕获，Cookie-only 不会覆盖。凭据、缓存只保存在本机；显示号码已脱敏，不要上传 Cookie 或网络日志。

升级：旧版本模块 account.* 记录原样保留，但不自动推断卡槽；重新切换三个号码查询余额即可建立新卡槽。不会导入原单卡脚本的 unicom_cookie/unicom_phone，避免错绑账号。旧手机号/探针 Env 不再需要，可删除。

离线测试不等于 iPhone 验证：尚未真机验证联通 App MITM 和 Egern 请求脚本/桌面组件的存储共享。使用同一脚本 URL 捕获和渲染，按原版使用方式直接尝试，不设探针门槛。

实现参考 IBL3ND/module 的 API 字段契约（上游审阅 SHA：44871f7f8023db177a83e16117f3c11f6263b98a），未发布原作者代码或审计快照；独立实现，来源：https://github.com/IBL3ND/module 。
