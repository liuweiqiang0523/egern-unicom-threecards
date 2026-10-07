# Egern 联通三卡

模块链接：
https://raw.githubusercontent.com/liuweiqiang0523/egern-unicom-threecards/main/UnicomThreeCards.yaml

存储验证模块：
https://raw.githubusercontent.com/liuweiqiang0523/egern-unicom-threecards/main/StorageProbe.yaml

先在测试配置中添加探针，访问 https://example.com/egern-storage-probe?write=1，检查两个探针桌面组件读取同一新时间。确认共享后再在正式模块设置 STORAGE_CONFIRMED=true，填写三个 CARDn_PHONE（仅本机填写），依次打开联通App切换号码查询余额。添加三个独立组件：中国联通卡1/2/3。尚无iPhone真机验证，不保证App MITM兼容。不要上传Cookie或网络日志。

实现参考 IBL3ND/module 的API字段契约，未发布原作者代码或审计快照；独立实现，保留来源：https://github.com/IBL3ND/module 。
