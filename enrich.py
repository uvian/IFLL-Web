#!/usr/bin/env python3
"""Enrich IFLL word bank: add pos, pos_cn, example, example_cn to all entries."""

import re
import os

WORKBANK_PATH = os.path.join(os.path.dirname(__file__), 'src/lib/wordbank.js')

# ── POS tag mapping from cat field ──
POS_MAP = {
    'verb': ('verb', '动词'),
    'adj': ('adjective', '形容词'),
    'adverb': ('adverb', '副词'),
    'logic': ('conjunction', '连词'),
    # All others → noun
}

DEFAULT_POS = ('noun', '名词')

# ── Example sentences for selected entries (~350) ──
# Keyed by zh value: (example_en, example_cn_with_bold)
EXAMPLES = {
    # ── Emotion (35 entries) ──
    '喜悦': ("Her face was filled with pure joy when she saw the surprise.", "看到惊喜时，她的脸上洋溢着纯真的**喜悦**。"),
    '悲伤': ("The whole nation was filled with deep sorrow after the tragedy.", "悲剧过后，整个国家都沉浸在深深的**悲伤**之中。"),
    '愤怒': ("He struggled to control his anger during the heated argument.", "在那场激烈的争论中，他努力控制自己的**愤怒**。"),
    '恐惧': ("She felt a sudden fear when she heard footsteps behind her.", "听到身后的脚步声时，她感到一阵突如其来的**恐惧**。"),
    '焦虑': ("Many students experience anxiety before important exams.", "许多学生在重要考试前都会感到**焦虑**。"),
    '抑郁': ("Regular exercise can help alleviate symptoms of depression.", "定期锻炼有助于缓解**抑郁**的症状。"),
    '厌恶': ("He couldn't hide his disgust at the terrible food.", "面对糟糕的食物，他无法掩饰自己的**厌恶**。"),
    '羞愧': ("She felt a deep sense of shame after telling the lie.", "撒谎之后，她感到深深的**羞愧**。"),
    '自豪': ("The parents watched with pride as their daughter graduated.", "父母带着**自豪**看着女儿毕业。"),
    '遗憾': ("It is a great regret that we never got to say goodbye.", "我们没能好好道别，这真是莫大的**遗憾**。"),
    '感激': ("I want to express my gratitude for all your help.", "我想对所有帮助表达我的**感激**。"),
    '同情': ("He showed great sympathy for the families affected by the flood.", "他对受洪水影响的家庭表达了深切的**同情**。"),
    '怜悯': ("The doctor's compassion for her patients was truly remarkable.", "那位医生对病人的**怜悯**之心令人敬佩。"),
    '嫉妒': ("She felt a pang of jealousy when her friend got the promotion.", "朋友升职时，她感到一阵**嫉妒**。"),
    '憎恨': ("There was pure hatred in his eyes as he spoke of his enemy.", "当他谈起仇敌时，眼中充满了**憎恨**。"),
    '欣慰': ("It was a great relief to hear that everyone was safe.", "听到所有人都平安无事，真是莫大的**欣慰**。"),
    '烦躁': ("The constant noise from the construction site caused him great irritation.", "建筑工地不断的噪音让他非常**烦躁**。"),
    '震惊': ("The news of his sudden resignation came as a shock to everyone.", "他突然辞职的消息让所有人都感到**震惊**。"),
    '困惑': ("She stared at the map in bewilderment, completely lost.", "她带着**困惑**盯着地图，完全迷路了。"),
    '满足': ("There is a deep sense of satisfaction in finishing a difficult task.", "完成一项艰巨任务会带来深深的**满足**感。"),
    '憧憬': ("She spoke of her longing to travel the world and explore new cultures.", "她诉说着环游世界、探索新文化的**憧憬**。"),
    '忧郁': ("A feeling of melancholy settled over him on the rainy afternoon.", "那个雨天的下午，一种**忧郁**笼罩了他。"),
    '乐趣': ("The children shouted with delight when they saw the presents.", "孩子们看到礼物时，高兴地欢呼**乐趣**。"),
    '苦闷': ("He cried out in anguish when he heard the terrible news.", "听到那个可怕的消息时，他痛苦地**苦闷**呐喊。"),
    '疼爱': ("She looked at her grandson with great fondness in her eyes.", "她满眼**疼爱**地看着自己的孙子。"),
    '绝望': ("After months of searching, he sank into despair.", "经过数月的寻找，他陷入了**绝望**。"),
    '怨恨': ("Years later, he still held deep resentment toward his former partner.", "多年以后，他仍然对前合伙人怀有深深的**怨恨**。"),
    '惊喜': ("What a wonderful surprise to see you here today!", "今天在这里见到你，真是太**惊喜**了！"),
    '寂寞': ("Living alone in a big city can lead to feelings of loneliness.", "独自在大城市生活可能会产生**寂寞**感。"),
    '无聊': ("The long lecture was filled with boredom for most students.", "那场漫长的讲座让大多数学生感到**无聊**。"),
    '尴尬': ("He tried to hide his embarrassment after tripping on stage.", "在舞台上绊倒后，他努力掩饰自己的**尴尬**。"),
    '懊悔': ("He felt deep remorse for the harsh words he had spoken.", "他为说过的刻薄话感到深深的**懊悔**。"),
    '沮丧': ("After failing the test again, she cried in frustration.", "再次考试不及格后，她**沮丧**地哭了。"),
    '冷淡': ("His indifference towards the project frustrated the whole team.", "他对项目的**冷淡**态度让整个团队感到沮丧。"),
    '热情': ("Her passion for teaching inspired generations of students.", "她对教学的**热情**激励了一代又一代学生。"),
    '温情': ("She spoke with tenderness when recalling her childhood memories.", "回忆童年时，她的话语中充满了**温情**。"),
    '渴望': ("His eagerness to learn new skills impressed his boss.", "他学习新技能的**渴望**给老板留下了深刻印象。"),

    # ── Daily Life (35 entries) ──
    '时间': ("Time passes quickly when you are enjoying yourself.", "当你享受快乐时，**时间**过得飞快。"),
    '今天': ("What are you planning to do today after work?", "你**今天**下班后打算做什么？"),
    '明天': ("Tomorrow is another day, so don't worry too much.", "**明天**又是新的一天，别太担心。"),
    '工作': ("She found a new job that aligns with her passions.", "她找到了一份符合自己兴趣的**工作**。"),
    '朋友': ("A true friend is someone who supports you through difficult times.", "真正的**朋友**是在困难时期支持你的人。"),
    '家庭': ("Family is more important than anything else in life.", "**家庭**比生活中任何其他事情都重要。"),
    '学校': ("Children spend most of their youth at school learning and growing.", "孩子们的大部分青春时光都在**学校**学习和成长。"),
    '生活': ("Living a balanced life is essential for mental health.", "过平衡的**生活**对心理健康至关重要。"),
    '世界': ("Technology has made the world more connected than ever before.", "科技让**世界**比以往任何时候都更加紧密相连。"),
    '食物': ("Fresh food tastes much better than processed alternatives.", "新鲜的**食物**比加工食品好吃得多。"),
    '健康': ("Regular exercise and a good diet are key to maintaining health.", "定期锻炼和良好饮食是保持**健康**的关键。"),
    '身体': ("Listening to your body is important when exercising.", "锻炼时倾听**身体**的信号很重要。"),
    '孩子': ("Every child deserves access to quality education.", "每个**孩子**都应该获得优质教育。"),
    '父母': ("Her parents have always supported her career choices.", "她的**父母**一直支持她的职业选择。"),
    '城市': ("Shanghai is one of the most vibrant cities in the world.", "上海是世界上最充满活力的**城市**之一。"),
    '地方': ("This is the perfect place for a weekend getaway.", "这是一个周末度假的完美**地方**。"),
    '习惯': ("Reading before bed is a good habit to develop.", "睡前阅读是一个值得培养的好**习惯**。"),
    '语言': ("Learning a new language opens doors to different cultures.", "学习一门新的**语言**打开了通往不同文化的大门。"),
    '梦想': ("Never give up on your dreams, no matter how difficult the journey.", "无论路途多么艰难，永远不要放弃你的**梦想**。"),
    '音乐': ("Music has the power to lift your mood instantly.", "**音乐**有瞬间提升情绪的力量。"),
    '电影': ("We watched a fascinating movie about space exploration last night.", "昨晚我们看了一部关于太空探索的精彩**电影**。"),
    '天气': ("The weather today is perfect for a picnic in the park.", "今天的**天气**非常适合去公园野餐。"),
    '衣服': ("She bought some new clothes for the upcoming interview.", "她为即将到来的面试买了一些新**衣服**。"),
    '颜色': ("What color do you think would look best in this room?", "你觉得什么**颜色**在这个房间最好看？"),
    '电话': ("Could you answer the phone while I finish cooking dinner?", "我做晚饭的时候你能接一下**电话**吗？"),
    '消息': ("I received a message from an old friend this morning.", "今天早上我收到了一位老朋友的**消息**。"),
    '意思': ("Could you explain the meaning of this word to me?", "你能给我解释一下这个词的**意思**吗？"),
    '睡眠': ("Getting enough sleep is crucial for good health.", "充足的**睡眠**对健康至关重要。"),
    '游戏': ("This video game has won several international awards.", "这款**游戏**赢得了多项国际大奖。"),

    # ── Abstract Concepts (60 entries) ──
    '问题': ("We need to find a solution to this problem as soon as possible.", "我们需要尽快找到解决这个**问题**的办法。"),
    '方法': ("There is more than one method to approach this challenge.", "应对这个挑战不止一种**方法**。"),
    '结果': ("The result of the experiment exceeded all expectations.", "实验的**结果**超出了所有人的预期。"),
    '原因': ("The cause of the accident is still under investigation.", "事故的**原因**仍在调查中。"),
    '目的': ("The main purpose of this meeting is to discuss the budget.", "这次会议的主要**目的**是讨论预算。"),
    '过程': ("The learning process takes time and requires patience.", "学习的**过程**需要时间和耐心。"),
    '情况': ("Can you describe the situation as you saw it?", "你能描述一下你所看到的**情况**吗？"),
    '关系': ("Building good relationships with colleagues is important.", "与同事建立良好的**关系**很重要。"),
    '条件': ("The scholarship comes with certain conditions that must be met.", "这项奖学金带有必须满足的特定**条件**。"),
    '机会': ("This internship is a great opportunity to gain experience.", "这次实习是获得经验的绝佳**机会**。"),
    '能力': ("Her ability to solve complex problems impressed everyone.", "她解决复杂**问题**的**能力**给所有人留下了深刻印象。"),
    '态度': ("A positive attitude can make a huge difference in your work.", "积极的**态度**会对你的工作产生巨大影响。"),
    '价值': ("The historical value of this painting is immeasurable.", "这幅画的历史**价值**不可估量。"),
    '经验': ("She has years of experience in software development.", "她在软件开发方面有多年的**经验**。"),
    '知识': ("Knowledge is power, and learning never stops.", "**知识**就是力量，学习永无止境。"),
    '概念': ("Understanding basic concepts is the first step in learning any subject.", "理解基本**概念**是学习任何学科的第一步。"),
    '意识': ("Environmental awareness has grown significantly in recent years.", "环保**意识**近年来显著增强。"),
    '记忆': ("The smell of fresh bread brought back childhood memories.", "新鲜面包的味道唤起了童年的**记忆**。"),
    '印象': ("Her presentation left a lasting impression on the audience.", "她的演讲给观众留下了持久的**印象**。"),
    '想象': ("Use your imagination to picture a world without pollution.", "发挥你的**想象**力，描绘一个没有污染的世界。"),
    '现实': ("We must face reality and deal with the situation head-on.", "我们必须面对**现实**，直面应对这种情况。"),
    '未来': ("Investing in education is investing in the future.", "投资教育就是投资**未来**。"),
    '传统': ("It is important to preserve cultural traditions for future generations.", "为后代保护文化**传统**非常重要。"),
    '文化': ("Understanding local culture is essential when traveling abroad.", "出国旅行时了解当地**文化**至关重要。"),
    '社会': ("Technology has transformed every aspect of modern society.", "科技改变了现代**社会**的方方面面。"),
    '反应': ("His immediate reaction was to call for help.", "他的第一**反应**是打电话求助。"),
    '计划': ("We need a solid plan before we start this project.", "在开始这个项目之前，我们需要一个可靠的**计划**。"),
    '项目': ("This project requires collaboration across multiple departments.", "这个**项目**需要多个部门的协作。"),
    '任务': ("She completed the task ahead of schedule and under budget.", "她提前完成了**任务**，而且没有超出预算。"),
    '信任': ("Trust is the foundation of any strong relationship.", "**信任**是任何牢固关系的基石。"),
    '反馈': ("Please provide your feedback on the new product design.", "请对新产品的设计提供**反馈**。"),
    '责任': ("Taking responsibility for your actions is a sign of maturity.", "为自己的行为承担**责任**是成熟的表现。"),
    '自由': ("Freedom of speech is a fundamental right in many countries.", "言论**自由**是许多国家的基本权利。"),
    '压力': ("Learning to manage stress is an important life skill.", "学会管理**压力**是一项重要的生活技能。"),
    '动力': ("Finding your motivation is key to achieving long-term goals.", "找到你的**动力**是实现长期目标的关键。"),
    '灵感': ("The artist drew inspiration from nature for her latest work.", "这位艺术家从大自然中汲取**灵感**进行最新创作。"),
    '耐心': ("Patience is essential when learning a new language.", "学习一门新语言时，**耐心**必不可少。"),
    '勇气': ("It takes courage to admit when you are wrong.", "承认错误需要**勇气**。"),
    '自信': ("Building confidence takes time and practice.", "建立**自信**需要时间和练习。"),
    '挑战': ("Every challenge is an opportunity for growth and learning.", "每一个**挑战**都是成长和学习的机会。"),
    '平衡': ("Finding a balance between work and personal life is crucial.", "在工作和个人生活之间找到**平衡**至关重要。"),
    '矛盾': ("There is a conflict between what he says and what he does.", "他说的和做的之间存在**矛盾**。"),
    '危机': ("The company handled the crisis with professionalism and transparency.", "公司以专业和透明的方式应对了这场**危机**。"),
    '风险': ("Investing always involves some degree of risk.", "投资总是带有一定程度的**风险**。"),
    '效率': ("We need to improve our efficiency to meet the deadline.", "我们需要提高**效率**以赶上截止日期。"),
    '质量': ("Quality is more important than quantity in this business.", "在这个行业，**质量**比数量更重要。"),
    '趋势': ("The current trend shows a shift toward renewable energy.", "当前的**趋势**显示正在向可再生能源转变。"),
    '结构': ("The structure of the essay should be clear and logical.", "文章的**结构**应该清晰且合乎逻辑。"),
    '策略': ("The company developed a new strategy to enter the market.", "公司制定了一个进入市场的新**策略**。"),
    '目标': ("Setting clear goals helps you stay focused and motivated.", "设定明确的**目标**有助于保持专注和动力。"),
    '优势': ("Her fluency in three languages gives her a major advantage.", "精通三种语言给了她很大的**优势**。"),
    '弱势': ("We need to identify our weaknesses before we can improve.", "我们需要在改进之前先找出自己的**弱势**。"),
    '进展': ("The project has made significant progress this quarter.", "本季度该项目取得了显著的**进展**。"),
    '机遇': ("Economic reform brought new opportunities for small businesses.", "经济改革为小企业带来了新的**机遇**。"),
    '挑战': ("This job comes with many challenges but also great rewards.", "这份工作有很多**挑战**，但也有很大的回报。"),
    '潜力': ("She has great potential as a leader in the organization.", "她作为组织的领导者具有巨大的**潜力**。"),
    '财富': ("True wealth is measured by health and happiness, not money.", "真正的**财富**是由健康和幸福衡量的，而不是金钱。"),
    '价值': ("This experience has great educational value for students.", "这次经历对学生有很高的教育**价值**。"),

    # ── Action Verbs (100 entries) ──
    '需要': ("You will need a visa to travel to most foreign countries.", "去大多数国家旅行都**需要**签证。"),
    '包括': ("The price includes breakfast and dinner at the hotel.", "价格**包括**酒店早餐和晚餐。"),
    '提供': ("The company provides free training for all new employees.", "该公司为所有新员工**提供**免费培训。"),
    '使用': ("You can use this app to track your daily expenses.", "你可以**使用**这个应用来记录日常开支。"),
    '考虑': ("Please consider all options before making a decision.", "在做决定之前，请**考虑**所有选项。"),
    '表示': ("The survey results indicate a growing interest in green energy.", "调查结果**表示**人们对绿色能源的兴趣日益增长。"),
    '存在': ("The problem still exists despite our best efforts.", "尽管我们尽了最大努力，问题仍然**存在**。"),
    '产生': ("The new policy will generate more job opportunities.", "新政策将**产生**更多的就业机会。"),
    '影响': ("The weather can greatly affect your mood and energy levels.", "天气会极大**影响**你的情绪和精力水平。"),
    '支持': ("My family has always supported me in pursuing my dreams.", "我的家人一直**支持**我追求梦想。"),
    '发展': ("The company plans to develop new products for the Asian market.", "该公司计划为亚洲市场**发展**新产品。"),
    '改变': ("Learning a new language can change the way you think.", "学习一门新语言可以**改变**你的思维方式。"),
    '增加': ("Regular exercise can increase your energy levels significantly.", "定期锻炼可以显著**增加**你的精力水平。"),
    '减少': ("We need to reduce our carbon footprint to protect the environment.", "我们需要**减少**碳足迹以保护环境。"),
    '保持': ("It is important to maintain good communication with your team.", "与团队**保持**良好沟通很重要。"),
    '实现': ("She worked hard to achieve her goal of becoming a doctor.", "她努力工作以**实现**成为医生的目标。"),
    '选择': ("You can choose any book from the library to read.", "你可以从图书馆**选择**任何一本书来读。"),
    '决定': ("She decided to study abroad after graduating from college.", "大学毕业后，她**决定**出国留学。"),
    '开始': ("Let's start the meeting with a brief introduction.", "让我们**开始**会议，先做个简短的介绍。"),
    '完成': ("He completed the marathon in under four hours.", "他在四小时内**完成**了马拉松。"),
    '继续': ("Please continue with your presentation, we are listening.", "请**继续**你的演讲，我们都在听。"),
    '建立': ("They established a new company focusing on renewable energy.", "他们**建立**了一家专注于可再生能源的新公司。"),
    '提高': ("Reading regularly can improve your vocabulary significantly.", "定期阅读可以显著**提高**你的词汇量。"),
    '确认': ("Can you confirm your attendance by Friday?", "你能在周五前**确认**是否出席吗？"),
    '分析': ("The data analyst will analyze the results and prepare a report.", "数据分析师将**分析**结果并准备报告。"),
    '比较': ("When you compare the two products, the quality difference is clear.", "当你**比较**这两种产品时，质量差异很明显。"),
    '解释': ("The teacher explained the concept in a simple way.", "老师用简单的方式**解释**了这个概念。"),
    '讨论': ("We need to discuss the budget for next year's project.", "我们需要**讨论**明年项目的预算。"),
    '接受': ("She accepted the job offer without hesitation.", "她毫不犹豫地**接受**了那份工作邀请。"),
    '拒绝': ("He refused to compromise on his principles.", "他**拒绝**在自己的原则问题上妥协。"),
    '行动': ("It is time to take action rather than just talk about the problem.", "是时候采取**行动**而不是光谈论问题了。"),
    '建议': ("I suggest we take a different approach to this problem.", "我**建议**我们换一种方法来解决这个问题。"),
    '保护': ("We must protect endangered species from extinction.", "我们必须**保护**濒危物种免于灭绝。"),
    '连接': ("Please connect the printer to your computer via USB.", "请通过USB将打印机**连接**到你的电脑。"),
    '操作': ("The new machine is easy to operate even for beginners.", "这台新机器即使是新手也很容易**操作**。"),
    '控制': ("She learned to control her temper in difficult situations.", "她学会了在困难情况下**控制**自己的脾气。"),
    '检查': ("Please check your email for the confirmation message.", "请**检查**你的邮箱以获取确认信息。"),
    '处理': ("The customer service team will process your refund within three days.", "客服团队将在三天内**处理**你的退款。"),
    '收集': ("We need to collect more data before making a final decision.", "在做出最终决定之前，我们需要**收集**更多数据。"),
    '更新': ("Make sure to update your software regularly for security.", "为了安全，请确保定期**更新**你的软件。"),
    '限制': ("The speed limit on this road is sixty kilometers per hour.", "这条路的时速**限制**是六十公里。"),
    '申请': ("She applied for a scholarship to study at Harvard University.", "她**申请**了哈佛大学的奖学金。"),
    '搜索': ("You can search for information using keywords online.", "你可以在线使用关键词**搜索**信息。"),
    '编辑': ("She edited the article to make it more concise and clear.", "她**编辑**了文章，使其更加简洁清晰。"),
    '测试': ("We need to test the software before releasing it to users.", "在向用户发布之前，我们需要**测试**软件。"),
    '设计': ("The architect designed a beautiful and sustainable building.", "建筑师**设计**了一座美丽且可持续的建筑。"),
    '开发': ("The team is developing a new mobile application for travelers.", "该团队正在为旅行者**开发**一款新的移动应用。"),
    '调整': ("We need to adjust our strategy based on the market feedback.", "我们需要根据市场反馈**调整**策略。"),
    '恢复': ("It took him weeks to recover from the illness.", "他花了好几周才从疾病中**恢复**过来。"),
    '取消': ("The flight was cancelled due to bad weather conditions.", "由于恶劣的天气条件，航班被**取消**了。"),
    '参与': ("Students are encouraged to participate in extracurricular activities.", "鼓励学生**参与**课外活动。"),
    '沟通': ("Effective communication is key to a successful relationship.", "有效的**沟通**是成功关系的关键。"),
    '理解': ("I understand how you feel, and I am here to help.", "我**理解**你的感受，我在这里帮助你。"),
    '准备': ("She prepared thoroughly for the important presentation.", "她为重要的演讲做了充分的**准备**。"),
    '分享': ("Can you share your experience with the rest of the team?", "你能和团队其他成员**分享**你的经验吗？"),
    '推荐': ("Can you recommend a good restaurant in this area?", "你能**推荐**这个地区的一家好餐馆吗？"),
    '思考': ("Take some time to think before making a major decision.", "在做重大决定之前，花点时间**思考**。"),
    '相信': ("I believe that hard work always pays off in the end.", "我**相信**努力工作最终总会有回报。"),
    '感觉': ("I feel that we should wait before making any final decisions.", "我**感觉**在做出最终决定之前我们应该等等。"),
    '期望': ("We expect the project to be completed by next month.", "我们**期望**项目能在下个月完成。"),
    '避免': ("To avoid traffic jams, try leaving for work before seven.", "为避免交通堵塞，尽量在七点前出发去上班。"),
    '坚持': ("She persisted in her studies despite many difficulties.", "尽管困难重重，她仍然**坚持**学习。"),
    '放弃': ("Never give up on your dreams, no matter how hard it gets.", "无论多么艰难，永远不要**放弃**你的梦想。"),
    '获得': ("She gained valuable experience from her first job.", "她从第一份工作中**获得**了宝贵的经验。"),
    '表达': ("She expressed her opinions clearly during the meeting.", "她在会议上清晰地**表达**了自己的观点。"),
    '描述': ("Can you describe what happened in detail?", "你能详细**描述**一下发生了什么吗？"),
    '预测': ("It is difficult to predict what the economy will do next year.", "很难**预测**明年经济会如何发展。"),
    '证明': ("The evidence proved that he was innocent of the crime.", "证据**证明**他无罪。"),
    '观察': ("Scientists observe the behavior of animals in their natural habitats.", "科学家**观察**动物在自然栖息地的行为。"),
    '代表': ("She will represent our company at the international conference.", "她将**代表**公司出席国际会议。"),
    '反对': ("Many people oppose the construction of the new highway.", "许多人**反对**修建这条新高速公路。"),
    '尊重': ("We should respect other people's opinions even if we disagree.", "即使不同意，我们也应该**尊重**他人的意见。"),
    '合作': ("The two companies decided to cooperate on the research project.", "两家公司决定在研究项目上**合作**。"),
    '练习': ("Practice makes perfect when learning a musical instrument.", "学习乐器时，**练习**造就完美。"),
    '关注': ("Please follow the instructions carefully before proceeding.", "在进行之前，请仔细**关注**说明。"),
    '通知': ("Please notify all employees about the schedule change.", "请**通知**所有员工关于时间表的变化。"),
    '谈判': ("The union is negotiating with management for better wages.", "工会正在与资方**谈判**争取更高的工资。"),
    '创新': ("Companies must innovate constantly to stay competitive.", "公司必须不断**创新**以保持竞争力。"),
    '竞争': ("Small businesses find it hard to compete with large corporations.", "小企业发现很难与大公司**竞争**。"),
    '学习': ("Students should study regularly rather than cram before exams.", "学生应该定期**学习**，而不是考试前临时抱佛脚。"),
    '回忆': ("She recalled the happy memories of her childhood.", "她**回忆**起童年时代的快乐往事。"),
    '忽略': ("Don't ignore the early warning signs of health problems.", "不要**忽略**健康问题的早期预警信号。"),
    '承认': ("He admitted that he had made a mistake in the report.", "他**承认**报告里犯了一个错误。"),
    '反思': ("We should reflect on our failures to learn from them.", "我们应该**反思**失败，从中吸取教训。"),
    '支付': ("You can pay by credit card or mobile payment.", "你可以用信用卡或移动**支付**。"),
    '节省': ("We can save money by taking public transportation.", "我们可以通过乘坐公共交通来**节省**钱。"),
    '分享': ("She shared her lunch with her colleague who forgot hers.", "她把午餐**分享**给了忘记带饭的同事。"),
    '邀请': ("They invited us to their wedding ceremony next month.", "他们**邀请**我们参加下个月的婚礼。"),
    '报告': ("The manager will report the quarterly results to the board.", "经理将向董事会**报告**季度业绩。"),
    '记录': ("Please record the minutes of this meeting for future reference.", "请**记录**本次会议的纪要，以便日后参考。"),
    '核实': ("We need to verify the accuracy of the data before publishing.", "在发布之前，我们需要**核实**数据的准确性。"),
    '开始': ("The concert will start at seven thirty sharp.", "音乐会将在七点半准时**开始**。"),
    '保持': ("Please keep the room clean and tidy at all times.", "请始终**保持**房间干净整洁。"),
    '失败': ("Failure is often the first step toward success.", "**失败**往往是通向成功的第一步。"),
    '尝试': ("You should attempt the exam even if you feel unprepared.", "即使感觉没有准备好，你也应该**尝试**参加考试。"),

    # ── Adjectives (60 entries) ──
    '重要': ("This is an important decision that will affect our future.", "这是一个会影响到我们未来的**重要**决定。"),
    '主要': ("The main issue is that we don't have enough funding.", "**主要**问题是我们没有足够的资金。"),
    '基本': ("Learning basic math skills is essential for everyday life.", "学习**基本**的数学技能对日常生活至关重要。"),
    '完全': ("I have complete confidence in your ability to succeed.", "我对你成功的能力有**完全**的信心。"),
    '具体': ("Can you give me a specific example of what you mean?", "你能给我一个**具体**的例子来说明你的意思吗？"),
    '直接': ("Please give me a direct answer without beating around the bush.", "请给我一个**直接**的回答，不要拐弯抹角。"),
    '普遍': ("It is common for new employees to feel nervous at first.", "新员工刚开始感到紧张是很**普遍**的。"),
    '明显': ("There is an obvious difference in quality between the two products.", "这两种产品的质量有**明显**的差异。"),
    '复杂': ("The instructions were too complex for beginners to understand.", "这些说明太**复杂**了，初学者难以理解。"),
    '简单': ("The solution is actually quite simple once you think about it.", "仔细想想，这个解决方案其实很**简单**。"),
    '困难': ("Learning a new language can be difficult but rewarding.", "学习一门新语言可能很**困难**，但也很有收获。"),
    '容易': ("This recipe is easy to follow even for beginners.", "这个食谱即使对初学者来说也很**容易**操作。"),
    '安全': ("Make sure to keep your passwords safe and secure.", "确保你的密码**安全**可靠。"),
    '正确': ("Your answer is correct, well done on solving the problem.", "你的回答是**正确**的，解题做得很好。"),
    '可能': ("It is possible to finish the project on time if we work together.", "如果我们齐心协力，按时完成项目是**可能**的。"),
    '必要': ("It is necessary to get a visa before traveling abroad.", "出国旅行前**必要**先办理签证。"),
    '独立': ("She is very independent and makes her own decisions.", "她非常**独立**，自己做决定。"),
    '积极': ("She maintains an active lifestyle by exercising every day.", "她通过每天锻炼来保持**积极**的生活方式。"),
    '专业': ("Her professional attitude impressed all her colleagues.", "她的**专业**态度给所有同事留下了深刻印象。"),
    '全面': ("We need a comprehensive review of the current system.", "我们需要对当前系统进行**全面**的审查。"),
    '敏感': ("Some people are sensitive to caffeine and cannot drink coffee.", "有些人对咖啡因**敏感**，不能喝咖啡。"),
    '严格': ("The teacher is strict about deadlines and late submissions.", "老师对截止日期和迟交作业很**严格**。"),
    '可靠': ("She is a reliable person who always keeps her promises.", "她是一个**可靠**的人，总是信守承诺。"),
    '合理': ("The price seems reasonable for such high quality.", "对于如此高的质量来说，这个价格似乎是**合理**的。"),
    '明智': ("It is wise to save some money for emergencies.", "存一些钱以备不时之需是**明智**的。"),
    '优秀': ("She is an excellent student who always achieves high grades.", "她是一名**优秀**的学生，总是取得高分。"),
    '杰出': ("He made outstanding contributions to the field of medicine.", "他为医学领域做出了**杰出**的贡献。"),
    '友好': ("The local people were very friendly and helpful to tourists.", "当地人对游客非常**友好**和乐于助人。"),
    '善良': ("She is a kind person who always helps those in need.", "她是一个**善良**的人，总是帮助那些需要帮助的人。"),
    '勇敢': ("The brave firefighter rescued the child from the burning building.", "**勇敢**的消防员从燃烧的大楼里救出了孩子。"),
    '温柔': ("She spoke in a gentle voice that calmed everyone down.", "她用**温柔**的声音说话，让大家平静下来。"),
    '谨慎': ("Be cautious when crossing the street, especially at night.", "过马路时要**谨慎**，尤其是在晚上。"),
    '忠诚': ("The dog remained loyal to its owner until the very end.", "这只狗直到最后都对主人保持**忠诚**。"),
    '幽默': ("His humorous jokes always make everyone laugh.", "他**幽默**的笑话总是让每个人大笑。"),
    '严肃': ("The doctor had a serious expression when giving the diagnosis.", "医生在给出诊断时表情很**严肃**。"),
    '坚强': ("She remained strong despite all the difficulties she faced.", "尽管面临重重困难，她依然**坚强**。"),
    '乐观': ("An optimistic outlook can help you overcome many challenges.", "**乐观**的心态可以帮助你克服许多挑战。"),
    '悲观': ("A pessimistic attitude will only hold you back from progress.", "**悲观**的态度只会阻碍你的进步。"),
    '真诚': ("Her sincere apology was accepted by everyone in the room.", "她**真诚**的道歉被房间里的每个人接受了。"),
    '谦虚': ("Despite his success, he remains humble and modest.", "尽管取得了成功，他仍然**谦虚**。"),
    '固执': ("He is too stubborn to admit that he might be wrong.", "他太**固执**了，不肯承认自己可能错了。"),
    '慷慨': ("The generous donation helped build a new school in the village.", "这笔**慷慨**的捐赠帮助村里建了一所新学校。"),
    '自私': ("Being selfish will not help you build lasting relationships.", "**自私**不会帮助你建立持久的关系。"),
    '勤奋': ("She is a diligent student who always completes her homework.", "她是一个**勤奋**的学生，总是完成作业。"),
    '节俭': ("Living a frugal lifestyle helps you save for the future.", "**节俭**的生活方式有助于为未来存钱。"),
    '果断': ("A decisive leader can make quick decisions when needed.", "一个**果断**的领导者在需要时能迅速做出决定。"),
    '温柔': ("The gentle breeze felt refreshing on a hot summer day.", "炎热的夏日里，**温柔**的微风令人神清气爽。"),
    '诚实': ("An honest person is always respected by others.", "一个**诚实**的人总是受到他人的尊重。"),
    '聪明': ("The clever student solved the problem in just five minutes.", "那个**聪明**的学生只用了五分钟就解出了这道题。"),
    '自信': ("A confident speaker engages the audience more effectively.", "**自信**的演讲者能更有效地吸引观众。"),
    '安静': ("Please keep quiet while others are taking the exam.", "别人考试时请保持**安静**。"),
    '新鲜': ("The fresh vegetables from the market taste delicious.", "市场买来的**新鲜**蔬菜味道很好。"),
    '干净': ("Make sure your hands are clean before preparing food.", "准备食物前要确保双手**干净**。"),
    '温暖': ("There is nothing better than a warm cup of tea on a cold day.", "寒冷的天气里，没有什么比一杯**温暖**的茶更好了。"),
    '有趣': ("The documentary was so interesting that I watched it twice.", "这部纪录片太**有趣**了，我看了两遍。"),
    '紧急': ("This is an urgent matter that requires immediate attention.", "这是一件**紧急**的事情，需要立即处理。"),

    # ── Conjunction / Logic (15 entries) ──
    '因此': ("He missed the bus, therefore he arrived late for the meeting.", "他错过了公交车，**因此**开会迟到了。"),
    '然而': ("The weather was terrible; however, we still enjoyed the trip.", "天气很糟糕，**然而**我们仍然很享受这次旅行。"),
    '尽管': ("Although it was raining, they decided to go for a walk.", "**尽管**在下雨，他们还是决定去散步。"),
    '因为': ("She got the job because she had the right qualifications.", "她得到了这份工作，**因为**她具备合适的资质。"),
    '所以': ("I was tired, so I went to bed early last night.", "我累了，**所以**昨晚早早上床睡觉了。"),
    '但是': ("I wanted to go, but I had too much work to finish.", "我想去，**但是**我有太多工作要完成。"),
    '如果': ("If it rains tomorrow, we will cancel the picnic.", "**如果**明天下雨，我们就取消野餐。"),
    '而且': ("The apartment is spacious, and moreover it has a great view.", "这套公寓很宽敞，**而且**视野很好。"),
    '或者': ("You can choose tea or coffee, whichever you prefer.", "你可以选择茶**或者**咖啡，随你喜欢。"),
    '否则': ("You should leave now, otherwise you will miss the train.", "你现在就该出发了，**否则**会赶不上火车。"),
    '以便': ("She saved money so that she could travel around Europe.", "她存钱**以便**能环游欧洲。"),
    '无论': ("Whether you agree or not, the decision has already been made.", "**无论**你是否同意，决定已经做出了。"),
    '虽然': ("Though the task was difficult, she never complained.", "**虽然**任务艰巨，但她从未抱怨过。"),
    '不仅': ("She is not only talented but also extremely hardworking.", "她**不仅**有才华，而且非常勤奋。"),
    '总之': ("Overall, the conference was a great success this year.", "**总之**，今年的会议非常成功。"),

    # ── Time / Sequence (15 entries) ──
    '目前': ("We are currently working on improving our customer service.", "我们**目前**正在努力改善客户服务。"),
    '之前': ("Please finish the report before the deadline on Friday.", "请在周五截止日期**之前**完成报告。"),
    '之后': ("We can discuss the details after the meeting ends.", "会议结束**之后**我们可以讨论细节。"),
    '首先': ("First, let me introduce myself to the new team members.", "**首先**，让我向新团队成员介绍一下自己。"),
    '最后': ("Finally, I would like to thank everyone for their hard work.", "**最后**，我想感谢每个人的辛勤工作。"),
    '同时': ("She was studying for exams and working part-time simultaneously.", "她**同时**在备考和做兼职工作。"),
    '立即': ("Please respond to this email immediately as it is urgent.", "请**立即**回复这封邮件，因为事情很紧急。"),
    '逐渐': ("The weather gradually became warmer as spring arrived.", "随着春天到来，天气**逐渐**变暖了。"),
    '始终': ("She has always been there for me when I needed help.", "在我需要帮助时，她**始终**在我身边。"),
    '曾经': ("I once lived in Shanghai for three years during college.", "我**曾经**在大学期间在上海住了三年。"),
    '最近': ("Have you seen any good movies recently?", "你**最近**看过什么好电影吗？"),
    '期间': ("During the summer break, she traveled to several countries.", "暑假**期间**，她去了几个国家旅行。"),
    '最终': ("After months of hard work, she eventually passed the exam.", "经过几个月的努力，她**最终**通过了考试。"),
    '即将': ("The upcoming holiday has everyone excited and making plans.", "**即将**到来的假期让每个人都兴奋地做计划。"),
    '持续': ("The heavy rain continued for three days without stopping.", "大雨**持续**下了三天没有停。"),

    # ── Adverb / Degree (12 entries) ──
    '非常': ("I am very grateful for all the support you have given me.", "我非常感谢你给予我的所有支持。"),
    '特别': ("I love this city, especially during the spring festival.", "我爱这座城市，**特别**是春节期间。"),
    '相对': ("This method is relatively easy compared to the alternative.", "与替代方法相比，这个方法**相对**简单。"),
    '相当': ("The movie was quite good, better than I expected.", "这部电影**相当**不错，比我想象的要好。"),
    '几乎': ("She almost missed her flight because of the heavy traffic.", "由于交通拥堵，她**几乎**错过了航班。"),
    '大约': ("The meeting will last approximately two hours.", "会议将**大约**持续两个小时。"),
    '仍然': ("She still remembers the first day she started her job.", "她**仍然**记得开始工作的第一天。"),
    '已经': ("I have already finished reading the book you recommended.", "我**已经**读完了你推荐的那本书。"),
    '通常': ("I usually go for a run in the morning before breakfast.", "我**通常**在早餐前去跑步。"),
    '实际': ("The situation actually turned out better than we expected.", "情况**实际**上比我们预想的要好。"),
    '也许': ("Perhaps we should consider a different approach to this issue.", "**也许**我们应该考虑用不同的方法来解决这个问题。"),
    '至少': ("You should at least apologize for your mistake.", "你**至少**应该为你的错误道歉。"),

    # ── Academic (10 entries) ──
    '研究': ("The university conducts research on climate change impacts.", "这所大学正在进行气候变化影响的**研究**。"),
    '理论': ("The theory of evolution is widely accepted in the scientific community.", "进化**理论**在科学界被广泛接受。"),
    '分析': ("A detailed analysis of the market trends is needed.", "需要对市场趋势进行详细的**分析**。"),
    '标准': ("The product meets all international safety standards.", "该产品符合所有国际安全**标准**。"),
    '结论': ("The researchers reached a conclusion after years of study.", "经过多年研究，研究人员得出了**结论**。"),
    '管理': ("Good management is essential for any successful organization.", "良好的**管理**对任何成功的组织都至关重要。"),
    '投资': ("Investing in education yields long-term benefits for society.", "**投资**教育会为社会带来长期回报。"),
    '策略': ("The company needs a clear strategy to expand globally.", "公司需要一个清晰的**策略**来拓展全球市场。"),
    '效率': ("We must improve operational efficiency to reduce costs.", "我们必须提高运营**效率**以降低成本。"),
    '背景': ("Understanding the historical background is important for analysis.", "了解历史**背景**对分析很重要。"),

    # ── Technology (8 entries) ──
    '系统': ("The new operating system will be released next month.", "新的操作**系统**将于下个月发布。"),
    '网络': ("Make sure your network connection is stable before the call.", "通话前确保你的**网络**连接稳定。"),
    '数据': ("The company stores all customer data securely in the cloud.", "该公司将所有客户**数据**安全地存储在云端。"),
    '程序': ("This program helps users edit photos quickly and easily.", "这个**程序**帮助用户快速轻松地编辑照片。"),
    '功能': ("The new update adds several useful features to the app.", "这次新更新为应用增加了几个有用的**功能**。"),
    '密码': ("Please create a strong password for your online account.", "请为你的在线账户创建一个强**密码**。"),
    '应用': ("This mobile application helps you track your daily expenses.", "这个移动**应用**帮助你记录日常开支。"),
    '文件': ("Please save the file before closing the application.", "请在关闭应用之前保存**文件**。"),
}

def parse_entries(text):
    """Parse JS entries from the WORD_BANK array."""
    entries = []
    pattern = r"\{\s*zh:\s*'([^']*)',\s*en:\s*'([^']*)',\s*def:\s*'([^']*)',\s*level:\s*'([^']*)',\s*cat:\s*'([^']*)'\s*\}"
    for match in re.finditer(pattern, text):
        entries.append({
            'zh': match.group(1),
            'en': match.group(2),
            'def': match.group(3),
            'level': match.group(4),
            'cat': match.group(5),
            'match': match.group(0),
            'start': match.start(),
            'end': match.end(),
        })
    return entries

def build_rich_entry(entry):
    """Build the enriched JS object string for one entry."""
    zh = entry['zh']
    en = entry['en']
    defn = entry['def']
    level = entry['level']
    cat = entry['cat']

    # POS from cat
    if cat in POS_MAP:
        pos, pos_cn = POS_MAP[cat]
    else:
        pos, pos_cn = DEFAULT_POS

    # Build the entry string (no leading whitespace — preserved from original)
    base = f"{{ zh: '{zh}', en: '{en}', def: '{defn}', level: '{level}', cat: '{cat}', pos: '{pos}', pos_cn: '{pos_cn}'"

    # Example if available
    if zh in EXAMPLES:
        example_en, example_cn = EXAMPLES[zh]
        # Escape single quotes in examples
        example_en = example_en.replace("'", "\\'")
        example_cn = example_cn.replace("'", "\\'")
        base += f", example: '{example_en}', example_cn: '{example_cn}'"

    base += " }"
    return base

def main():
    with open(WORKBANK_PATH, 'r', encoding='utf-8') as f:
        content = f.read()

    entries = parse_entries(content)

    print(f"Found {len(entries)} entries")

    # Count categories
    cats = {}
    for e in entries:
        cats[e['cat']] = cats.get(e['cat'], 0) + 1
    for c, n in sorted(cats.items(), key=lambda x: -x[1]):
        print(f"  {c}: {n}")

    # Build enriched entries and replace in reverse order (so indices stay valid)
    modified = content
    offset_correction = 0

    # Sort by start position descending to replace from end to start
    sorted_entries = sorted(entries, key=lambda e: -e['start'])

    for entry in sorted_entries:
        start = entry['start']
        end = entry['end']
        old_text = entry['match']
        new_text = build_rich_entry(entry)

        # We need to find the exact position in the modified content
        # Since we're going backwards, we can use the original start/end
        # but need to account for previous replacements
        adjusted_start = start
        adjusted_end = end

        # For safety, find the exact match in the current modified content
        # at the expected position
        found_old = modified[adjusted_start:adjusted_end]

        if found_old != old_text:
            # Fallback: search for it nearby
            idx = modified.find(old_text)
            if idx >= 0:
                adjusted_start = idx
                adjusted_end = idx + len(old_text)
            else:
                print(f"WARNING: Could not find entry for '{entry['zh']}' ({entry['en']})")
                continue

        if new_text != old_text:
            modified = modified[:adjusted_start] + new_text + modified[adjusted_end:]

    with open(WORKBANK_PATH, 'w', encoding='utf-8') as f:
        f.write(modified)

    # Count how many got examples
    example_count = 0
    for e in entries:
        if e['zh'] in EXAMPLES:
            example_count += 1

    print(f"\nAdded examples to {example_count} entries")
    print(f"All {len(entries)} entries enriched with pos/pos_cn")
    print("\nDone! File written to:", WORKBANK_PATH)

if __name__ == '__main__':
    main()
