module ict/server

go 1.23

// 依赖策略（tasks 0.5 / design 2.7.2）：
// 运行环境无法访问 Go 模块代理，故本期服务端仅使用标准库实现，
// 保持 handler→service→port←adapter 分层与仓储接口不变，
// 后续可平滑替换为 chi / modernc.org/sqlite / gobreaker。