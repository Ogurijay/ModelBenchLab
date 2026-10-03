# 任务索引

index.json 为 mission 到题面、task_id/version 与结构化单元的唯一映射。参与项目与端口读取 ../registry.json，题面不维护重复表。public/ 公开任务；private/ 私有题必须忽略并按季度轮换。现存 brawler/digimon 保留不同任务身份，未恢复原始 prompt 前不得直接横向排名。

门户分类由 registry 的 portalSections[].groups[] 维护，是展示导航，不是评测身份。brawler/digimon 同列“数码宝贝 · 竞技格斗”；kart/initiald/mini4wd 同属“赛车与竞速”的不同系列。各自任务版本、输入冻结要求与 rubric 继续独立。
