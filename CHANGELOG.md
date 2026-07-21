# IFLL — 更新日志

## v0.2 — 2026-07-21

### 新功能
- **Tooltip 亮暗自动切换**：根据页面背景颜色和系统主题自动适配，支持 Auto/Light/Dark 手动覆写
- **词库统计面板**：弹出窗实时显示收录词语数、IPA 覆盖率、已掌握/复习中词汇数
- **词库批量预处理**：可自定义数量（10-1000），随机选词预生成深度解析，进度条实时反馈，可随时停止
- **深度解析重新生成**：环形箭头按钮，一键清缓存重新获取深度解析结果
- **Model 预置列表恢复**：API 配置支持 DeepSeek/OpenAI/OpenRouter/OpenCodeGo 四选一，刷新按钮拉取可用模型列表

### AI 功能优化
- 深度解析/AI 例句 **提示词全面重写**：准确度优先，宁可少给不准杜撰，例句要求中英自然地道
- 推理模型兼容：支持 `reasoning_content` 字段，不再因 deepseek-v4-pro 输出空 content 而失败
- JSON 解析增强：处理 AI 输出中的 markdown fence、尾随逗号、嵌套引号
- 空结果**不入缓存**，避免"暂无数据"永久缓存

### UI 重新设计
- 弹出窗 + page tooltip 统一为**文学极简风格**：暖白底色 #FAF9F7，深学术蓝 #2E5090，消除 Emoji 装饰
- Tooltip 底部自适应翻转：空间不够自动翻到文字上方弹出
- AI 按钮内边距修复，不再贴边
- 弹出窗宽度从 320px 扩到 380px

### Bug 修复（30+ 项）
- `onInstalled` 不再每回重载覆写全部用户配置（API Key、模型、词库数据不再丢失）
- Tooltip `position:fixed` 坐标不再错误叠加 scroll 偏移
- 模型列表解析 `m.id` 静态字符串 Bug
- Aho-Corasick 搜索缺失 `cat` 字段导致场景自适应匹配永不生效
- `markKnown` 竞态合并为单次 `set()` 调用
- CSS 重复声明冲突清除
- `popup.html` 漏加载 `wordbank.js` 导致词库统计全为 0
- `now is not defined` 修复

### 工程
- `prepush-check.sh` 自动检查：语法、引用顺序、CSS 重复、功能在场、默认模型名