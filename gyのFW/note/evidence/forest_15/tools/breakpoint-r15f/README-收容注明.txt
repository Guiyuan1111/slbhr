breakpoint-r15f——TEMP/r15f 收容（2026-10-27 TEMP 清库，用户批准"按建议办"）
来源：TEMP/r15f（2026-10-15，forest_15 路线槽 r15f 全部工作态）。
状态：MC 94.0%（141/150）挂起路线的接力载体（01 号档〔2026-10-15 用户裁决〕
"TEMP/r15f 断点与工具保留作接力载体"）。
内容：seq1-4.json 路线工作态（含 .bak）+ base40 基准快照 + cand1/posbest 候选
+ mcany/mcanalyze/mcfix/insclear/landingscan/gridscan/poscan/posopt/seqclear/
batchclear/wallwalk/wallshift 工具链 + 全部运行日志。
引用档卷：note/evidence/forest_15/01号档-挂起裁决与终态.md（批量期重设计入口）、
note/evidence/forest_15/logs/r15f-01-verify.txt。路线本体已入库不计绿
（routes/forest_15.json）。
注（2026-10-27）：各工具头部"用法"注释已改指本目录；mcany.mjs 注释中
$PWD/TEMP/node 前缀为历史环境残留（该 node 构建目录已不在），当前直接以
node --import tsx 运行即可。
