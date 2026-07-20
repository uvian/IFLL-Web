# IFLL 项目需求与规范摘要

## 项目概述
IFLL（Immersive Foreign Language Learning）是一个 Chrome MV3 浏览器扩展，通过在网页中将中文词汇替换为英文等效词，实现沉浸式中英语言学习。项目根目录：/home/hermes/IFLL-Web，GitHub: uvian/IFLL-Web，GPL v3，纯 Vanilla JS。

## 关键文件
- src/lib/injector.js — 核心注入引擎（Aho-Corasick 多模式匹配 + 4 种学习模式 + tooltip + 发音 + 逐日新词 + 搭配替换 + 碎片检测 + 整句翻译回退）
- src/lib/storage.js — 设置封装，SM-2 间隔重复评分，每日统计，每日选词，搭配映射，AI 缓存
- src/lib/wordbank.js — 3,626 条词库，3,252 条含 IPA 音标（通过 CMU 发音词典离线填充）
- src/background/background.js — AI 代理（例句、深度解析、翻译、PDF 翻译、连接测试、模型列表）
- src/content/content.js — 欢迎提示栏（4 模式选择，8 秒超时默认不启用）+ IFLL_MODE_CHANGED 监听器
- src/content/content.css — 全部样式（tooltip、提示栏、标注、翻译面板、流畅替换、PDF 浮动按钮）
- src/popup/ — 弹出窗口（模式选择器、API 配置、发音选择、统计、排除站点、导入/导出 19 字段、PDF 翻译入口）
- src/pdf/ — PDF 查看器（pdf.js CDN 加载，AI 驱动的左右双语对照面板）

## 四种学习模式（按域名持久化）
1. 替换模式：中文 → 英文逐词替换（Aho-Corasick，O(n)）
2. 标注模式：英文页面中英文词标注虚线下划线 + 中文释义
3. 翻译模式：整段翻译（需 AI API）
4. 关闭模式：不注入

## 用户的核心需求和要求

### 功能需求
1. **逐日新词系统**：软限设计（页面不会因缺少今日新词而空白），新词仅加粗标记（不改变颜色或下划线样式）
2. **搭配优先替换**：phraseMap 中的词组优先于单字替换，避免碎片化的中英混杂
3. **A+C 碎片检测**：当逐词替换会产生 "today的 weather很好" 这种碎片时，自动升级为整句 AI 翻译
4. **SM-2 间隔重复**：tooltip 内嵌复习评分按钮（轻松/正确/模糊/忘记），自动调节复习间隔
5. **AI 深度解析**：同义词、反义词、搭配、用法说明（永久缓存于 chrome.storage.local）
6. **AI 例句生成**：7 天缓存，过期自动刷新
7. **学习进度导出/导入**：knownWords、reviewQueue、userWords、dailyStats、siteModes、dailyWords、phraseMap 等 19 个字段一键打包
8. **PDF 全文翻译**：通过 pdf.js 加载 PDF，逐页 AI 翻译，左右分屏对照

### 交互要求
9. **Tooltip 智能定位**：靠近视口底部时自动向上翻转
10. **Tooltip 不阻断链接跳转**：点替换词显示 tooltip（不跳转），点链接其余文字正常导航
11. **Tooltip 亮暗自动适配**：自动检测页面背景亮度 + prefers-color-scheme，亮页用亮 tooltip，暗页用暗 tooltip。弹出窗可手动覆盖（自动/明亮/暗黑）
12. **扩展重载不丢失数据**：onInstalled 只补填缺失键，绝不复写用户已有的 API 配置和词汇数据

### UI 设计规范
13. **文学极简风格**：暖白纸色（#FAF9F7）+ 深学术蓝强调色（#2E5090），无装饰性 Emoji
14. **弹出窗宽度 380px**：避免内容区域出现滚动条
15. **Ghost 按钮主导**：透明底 + 细边框，hover 微变色，只有「保存」用 primary 填充色
16. **统计数字优先**：16px 粗体数字 + 10px 灰度标签
17. **所有工具提示内按钮**：✓ ✗ 作为功能性标记保留，无其他 Emoji

### 开发铁律
18. **每次推送前必须自审**：node --check 全 JS + git diff --stat + 功能完好性 grep + 确认无不必要的删除

## 当前已知问题（需要 Codex 审查优化）

1. **代码组织**：injector.js 已膨胀到 806 行，包含 AC 匹配器、4 种注入模式、tooltip 渲染、AI 按钮处理、观察器、发音、主题检测——是否需要拆分为模块？
2. **性能**：injectReplace 每次循环遍历全部 phraseMap 条目做 text.includes()，对于 500 短语 × 100 文本节点 = 50,000 次操作，是否有更优方案？
3. **错误处理**：AI API 调用链中的错误处理是否健壮？网络超时、JSON 解析失败、API 格式变更等边界情况是否覆盖？
4. **状态一致性**：storage.js 中 knownWords 和 reviewQueue 之间的状态迁移是否正确？markKnown 是否真的从 reviewQueue 中移除了？
5. **内存泄漏风险**：MutationObserver、事件监听器、闭包引用——是否存在潜在的内存泄漏？
6. **CSS 冗余**：content.css 中 tooltip 亮/暗两套样式是否有更好的组织方式（CSS 变量 + .ifll-dark 覆盖）？
7. **代码重复**：injectReplace 和 injectAnnotate 共享了相似的 text node walker 逻辑——是否可以抽取？
8. **错误提示**：用户看到 "HTTP 400" 而不清楚具体哪里错了——错误信息的粒度是否足够友好？
9. **onInstalled vs DEFAULTS**：现在有两套默认值（background.js onInstalled 中的 defaults 和 storage.js 中的 DEFAULTS），是否应该统一？
10. **弹出窗状态管理**：popup.js 中 settings 通过多次 chrome.storage.sync.get() 分散读取——能否集中管理以减少异步竞态？

请在审查完毕后给出：
- 最严重的 3 个问题及修复方案（代码级）
- 架构层面的 3 条改进建议
- 如果有任何可以立即实施的优化（只改一个文件、不改 API、不破坏现有功能），请直接实施
