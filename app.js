/* ============================================================
 * 徐海·素质测评填表助手（新版）
 * 纯前端实现 + /api/chat 代理 DeepSeek
 * ============================================================ */

/* ---------------- 常量与提示词（迁移自旧版 prompts.ts） ---------------- */

const RECOGNITION_PROMPT = `你是一位专业的证书识别专家，具备丰富的各类证书、奖状、成绩单、证明材料的信息提取经验。

请对提供的证书图片进行信息提取，提取以下关键信息：
1. 项目名称：证书对应的比赛、活动、项目的完整名称
2. 主办单位：颁发证书的机构或组织全称
3. 级别：证书的级别，如国家级、省级、市级、校级、企业级等
4. 获奖等级：获得的奖项等级，如一等奖、二等奖、三等奖、金奖、银奖、铜奖、优秀奖、合格等
5. 日期：证书颁发日期或活动举办日期，格式统一为YYYY-MM-DD

输出要求：
- 每个信息点单独一行，格式为【字段名】：提取到的内容
- 若某字段信息不存在或无法识别，请标注【未找到】
- 确保提取信息准确，不添加主观臆断内容
- 若图片中有多份证书，请分别提取每份证书的信息

特别注意：如果图片是教务系统的"专业排名查询"截图（含"专业排名""加权平均分""绩点"等字样），必须把"专业排名"后面紧跟的"名次/总人数"（例如 23/141）原样、准确地提取出来，名次和总人数两个数字都不能遗漏，即使它们与标签不在同一行。`;

const SCORING_PROMPT = `你是一位专业的五育评价判分专家，熟悉德育、智育、体育、美育、劳育的分类标准和加分规则，能够根据提交的材料内容进行精准分类和客观评分。

判分依据严格遵守《中国矿业大学徐海学院学生综合素质测评条例（试行）》（2026学生版，第十一条至第十五条）及附件2《竞赛项目分类分级汇总表（2026版）》，不得引用旧版规则。

请根据以下提供的信息完成判分工作：
1. 图片识别文本内容：{{input.ocr_text}}
2. 加分规则说明：{{input.scoring_rules}}
3. 五育分类指引：{{input.classification_guidelines}}

请按照以下要求输出结果：
1. 【分类结果】：明确标注该项目属于德育/智育/体育/美育/劳育中的哪一类
2. 【项目说明】：100字以内简要描述项目内容和性质
3. 【建议加分】：给出具体的加分分值，需严格符合加分规则要求
4. 【判分依据】：逐条说明分类和加分的理由，每条理由必须明确写出引用的具体条例条款（如第十一条一、第十二条三及附件2）
5. 【材料指纹】：只输出一行，用英文竖线 | 依次拼接以下事实要素，缺失要素写 NA，不得添加其他文字：
   材料类型（专业排名/学科竞赛/文体竞赛/荣誉称号/学生干部/志愿实践/英语计算机/论文专利/其他）|项目或赛事全称（去掉"第X届"等届次修饰）|级别（国家级/省级/市校级/院级/系级/NA）|获奖等级或具体名次（一等奖/二等奖/三等奖/金奖/银奖/优秀奖/名次如23/141/NA）|年份或学年（如2025-2026/NA）|获奖者姓名（NA）
   同一份材料重复识别时，材料指纹必须逐字完全相同；不同项目、不同年份、不同获奖等级、不同级别必须输出不同的材料指纹。

输出要求：
- 分类准确，不得跨类别重复归类
- 加分分值严格按照规则计算，不得随意调整
- 不得输出材料说明相关内容
- 语言简洁规范，表述客观中立
- 如有不符合加分条件的情况，明确说明原因

末尾必须添加固定免责声明：本判分结果仅供参考，最终加分认定以学院相关部门审核为准。`;

const HANDBOOK_QA_PROMPT = `你是学校学生手册问答助手，具备严谨的信息核对能力。

请严格依据以下提供的学生手册资料原文回答用户问题，不得编造任何资料中没有的信息。如果资料中没有相关内容，请明确告知用户无法回答该问题。

学生手册资料原文：
{{input.handbook_content}}

用户问题：
{{input.user_question}}

回答要求：
1. 回答内容必须完全来自提供的学生手册资料，不得添加任何外部信息或主观臆断
2. 回答准确清晰，语言简洁明了
3. 在回答末尾标注引用来源，格式为：[引用来源：学生手册第X部分/第X章节]，如果无法确定具体章节，标注[引用来源：学生手册]
4. 如资料中无相关内容，直接回答："抱歉，学生手册中没有相关内容，无法回答您的问题。"`;

const COMMAND_PARSER_PROMPT = `你是一位专业的表格操作指令解析专家，擅长将自然语言描述的修改指令转换为可执行的结构化操作。

请解析以下用户针对表格的修改指令：
用户指令：{{input.user_command}}
表格上下文：{{input.table_context}}

解析规则：
1. 准确识别用户意图，判断操作类型（修改字段值、删除行、新增行、排序、筛选等）
2. 提取操作相关的所有必要信息：操作目标（行标识、字段名）、操作参数（修改后的值、筛选条件等）
3. 如果指令中存在不明确的信息，在confidence字段标注置信度（0-1之间），并在remark字段说明需要补充的信息
4. 如果指令包含多个操作，在operations数组中依次列出所有操作

输出要求：
- 只输出JSON格式，不要其他解释内容，不要使用markdown代码块
- JSON 结构如下：
{
  "operation_type": "UPDATE 或 DELETE 或 INSERT 或 SORT 或 FILTER 或 OTHER",
  "operations": [{"target": "行ID或字段名", "params": {"score": "分值", "projectDesc": "说明", "category": "类别"}}],
  "confidence": 0.0到1.0的数字,
  "remark": "备注"
}`;

const CLASSIFICATION_GUIDELINES = `【分类指引】
依据《中国矿业大学徐海学院学生综合素质测评条例（试行）》（2026学生版，自2024级本科施行）：
- 德育（第十一条）：精神文明表彰、学生工作（学生干部任职与考核，服务满一年）、荣誉称号（优秀党员、三好学生、优秀学生干部、优秀团员/团干部等）、应征入伍。
- 智育（第十二条）：一、学习能力（专业排名）；二、学业提升（学期排名提升50%/30%/20%/10% 加5/3/2/1分）；三、科技创新创业与学科竞赛；四、学术论文；五、优良学风班与学习之星；六、专利与软件著作权；七、外语考试（CET4/6、雅思、托福）；八、计算机等级；九、职业技能证书。
- 体育（第十三条）：各级体育竞赛获奖、运动会名次。
- 美育（第十四条）：文化艺术类竞赛（音乐、美术、书法、舞蹈、戏剧、戏曲、影视、演讲、朗诵、辩论等）；大型文艺展演参演：市校级及以上展演主要演员每次3分、其他演员每次2分，学院大型晚会主要演员每次2分、其他演员每次1分，学院/系其他展演主要演员每次1分、其他演员每次0.5分；国旗班承担大型活动升旗每次2分、其他升旗每次1分。
- 劳育（第十五条）：社会实践与志愿服务荣誉、集体劳动与星级宿舍（四星级宿舍成员每人每学期1分）、宣传报道。

拿不准或跨类的材料，给出建议分类并说明理由。

【竞赛级别判定依据】
- 条例第十二条备注5（2026版原文）："高水平竞赛"是指由相关部门认定的一级甲等竞赛项目，包括全国"挑战杯"大学生课外学术科技作品竞赛、"挑战杯"大学生创业计划竞赛、中国国际大学生创新大赛等。
- 其他赛事的国家级/省部级/校市级/院级/系级归档，可参考《竞赛项目分类分级汇总表（2024版）》（如蓝桥杯全国赛=国家级其它竞赛、蓝桥杯江苏省赛=省部级）；2026版条例正文未附新分级表，未列入赛事及有争议的级别由系/学院认定（条例第二十七条）。

【通用判分规则（条例备注与第十六条）】
- 按名次评奖：第一名=一等奖，第二、三名=二等奖，第四名及以后=三等奖。
- 特等奖 = 一等奖基础上 +2 分。
- 国际级 = 国家级 ×1.2。
- 同一作品同一年内多级获奖，按最高级别×1.2，不重复加分；不同作品可分别加。
- 集体项目多人获奖：排名第一按全额，第二名按1/2，第三名及以后按1/3。
- 同一荣誉同年同类按最高×1.2，不同类（如精神文明+荣誉称号）可分别加。
- 学生干部服务期满一年方可加分，半年以上不满一年按×0.6。`;

/* ---------------- 加分规则（迁移自旧版 scoringRules.ts） ---------------- */

const DEFAULT_SCORING_RULES = {
  disclaimer: '以下规则依据《中国矿业大学徐海学院学生综合素质测评条例（试行）》（2026学生版手册收录，自2024级本科学生施行）第十一条至第十五条整理，已逐条核对2026版学生手册原文。竞赛级别判定参考《竞赛项目分类分级汇总表（2024版）》（2026版条例正文未附新分级表），未列入赛事的级别由系/学院认定。各系可制定实施细则，最终加分以系里实施细则和学院审核认定为准。',
  rules: {
    professionalRanking: {
      '专业排名前3%（第十二条一）': 15,
      '专业排名前10%（第十二条一）': 12,
      '专业排名前20%（第十二条一）': 10,
      '专业排名前30%（第十二条一）': 8,
      '专业排名前40%（第十二条一）': 6,
    },
    // ===== 智育：学业提升（第十二条二，2026版新增） =====
    academicImprovement: {
      '专业排名提升50%及以上（第十二条二）': 5,
      '专业排名提升30%及以上（第十二条二）': 3,
      '专业排名提升20%及以上（第十二条二）': 2,
      '专业排名提升10%及以上（第十二条二）': 1,
    },
    englishComputer: {
      'CET4≥425（第十二条四）': 5,
      'CET6≥425（第十二条四）': 7,
      '雅思≥5.5或托福≥70（第十二条四）': 5,
      '雅思≥6或托福≥80（第十二条四）': 6,
      '雅思≥6.5或托福≥90（第十二条四）': 7,
      '雅思≥7或托福≥100（第十二条四）': 8,
      '计算机二级合格（第十二条五）': 4,
      '计算机二级优秀（第十二条五）': 6,
      '计算机三级合格（第十二条五）': 6,
      '计算机三级优秀（第十二条五）': 8,
      '计算机四级合格（第十二条五）': 8,
      '计算机四级优秀（第十二条五）': 10,
      '职业技能初级（第十二条五）': 3,
      '职业技能中级（第十二条五）': 5,
      '职业技能高级（第十二条五）': 7,
    },
    academicCompetition: {
      '国家级-高水平（一级甲等）（第十二条三·附件2）': { 一等奖: 25, 二等奖: 20, 三等奖: 15, 鼓励奖: 8 },
      '国家级-其他（一级乙等及以下）（第十二条三·附件2）': { 一等奖: 20, 二等奖: 16, 三等奖: 12, 鼓励奖: 6 },
      '省部级（第十二条三）': { 一等奖: 16, 二等奖: 12, 三等奖: 8, 鼓励奖: 4 },
      '校市级（第十二条三）': { 一等奖: 8, 二等奖: 6, 三等奖: 4, 鼓励奖: 0 },
      '院级（第十二条三）': { 一等奖: 4, 二等奖: 3, 三等奖: 2, 鼓励奖: 0 },
      '系级（第十二条三）': { 一等奖: 2, 二等奖: 1.5, 三等奖: 1, 鼓励奖: 0 },
    },
    sportsArtsCompetition: {
      '国家级体育竞赛（第十三条一）': { 一等奖: 20, 二等奖: 16, 三等奖: 12, 鼓励奖: 6 },
      '省部级体育竞赛（第十三条一）': { 一等奖: 16, 二等奖: 12, 三等奖: 8, 鼓励奖: 4 },
      '校市级体育竞赛（第十三条一）': { 一等奖: 8, 二等奖: 6, 三等奖: 4, 鼓励奖: 0 },
      '院级体育竞赛（第十三条一）': { 一等奖: 4, 二等奖: 3, 三等奖: 2, 鼓励奖: 0 },
      '系级体育竞赛（第十三条一）': { 一等奖: 2, 二等奖: 1.5, 三等奖: 1, 鼓励奖: 0 },
    },
    generalRules: [
      '按名次评奖时：第一名对应一等奖，第二、三名对应二等奖，第四名及以后对应三等奖（第十六条通用规则）',
      '特等奖在一等奖基础上再加2分（第十六条通用规则）',
      '同一作品/项目同一年内多级获奖，按最高级别×1.2，不重复加分（第十六条通用规则）',
      '不同作品/项目可分别加分（第十六条通用规则）',
      '集体项目多人获奖：排名第一按全额，第二名按1/2，第三名及以后按1/3（第十六条通用规则）',
      '国际级比赛获奖按国家级×1.2（第十六条通用规则）',
      '高水平竞赛指附件2中"一级甲等"竞赛，如挑战杯、中国国际大学生创新大赛、数学建模、电子设计、ACM-ICPC、机械创新设计等',
      '蓝桥杯全国赛=一级乙等（非高水平）、江苏省赛=二级，均以2026版附件2为准',
      '同一荣誉同年不同类型（如既获精神文明表彰又获荣誉称号）可分别加分',
    ],
    thesisPatent: {
      // 论文（第十二条四）：独立 / 两人合作 / 三人及以上合作（限前三名）
      '高质量刊物论文-独立（第十二条四）': 15,
      '高质量刊物论文-两人合作第一作者（第十二条四）': 9,
      '高质量刊物论文-两人合作第二作者（第十二条四）': 6,
      '高质量刊物论文-三人合作第一作者（第十二条四）': 9,
      '高质量刊物论文-三人合作第二作者（第十二条四）': 5,
      '高质量刊物论文-三人合作第三作者（第十二条四）': 1,
      '中文核心期刊-独立（第十二条四）': 12,
      '中文核心期刊-两人合作第一作者（第十二条四）': 7,
      '中文核心期刊-两人合作第二作者（第十二条四）': 5,
      '中文核心期刊-三人合作第一作者（第十二条四）': 6,
      '中文核心期刊-三人合作第二作者（第十二条四）': 4,
      '中文核心期刊-三人合作第三作者（第十二条四）': 2,
      '一般正式刊物-独立（第十二条四）': 6,
      '一般正式刊物-两人合作第一作者（第十二条四）': 4,
      '一般正式刊物-两人合作第二作者（第十二条四）': 2,
      '一般正式刊物-三人合作第一作者（第十二条四）': 3,
      '一般正式刊物-三人合作第二作者（第十二条四）': 2,
      '一般正式刊物-三人合作第三作者（第十二条四）': 1,
      // 专利/软著（第十二条六）
      '发明专利-独立（第十二条六）': 15,
      '发明专利-两人合作第一作者（第十二条六）': 9,
      '发明专利-两人合作第二作者（第十二条六）': 6,
      '发明专利-三人合作第一作者（第十二条六）': 9,
      '发明专利-三人合作第二作者（第十二条六）': 5,
      '发明专利-三人合作第三作者（第十二条六）': 1,
      '实用新型专利-独立（第十二条六）': 4,
      '实用新型专利-两人合作第一作者（第十二条六）': 5,
      '实用新型专利-两人合作第二作者（第十二条六）': 3,
      '实用新型专利-三人合作第一作者（第十二条六）': 4,
      '实用新型专利-三人合作第二作者（第十二条六）': 3,
      '实用新型专利-三人合作第三作者（第十二条六）': 1,
      '外观设计专利-独立（第十二条六）': 4,
      '外观设计专利-两人合作第一作者（第十二条六）': 2.5,
      '外观设计专利-两人合作第二作者（第十二条六）': 1.5,
      '外观设计专利-三人合作第一作者（第十二条六）': 2.5,
      '外观设计专利-三人合作第二作者（第十二条六）': 1,
      '外观设计专利-三人合作第三作者（第十二条六）': 0.5,
      '软件著作权-独立（第十二条六）': 2,
      '软件著作权-两人合作第一作者（第十二条六）': 1,
      '软件著作权-两人合作第二作者（第十二条六）': 1,
      '软件著作权-三人合作第一作者（第十二条六）': 1,
      '软件著作权-三人合作第二作者（第十二条六）': 0.5,
      '软件著作权-三人合作第三作者（第十二条六）': 0.5,
    },
    studentCadre: {
      '院级主要学生干部（第十一条二·服务满一年）': { 优秀: 14, 合格: 12 },
      '院级非主要学生干部（第十一条二·服务满一年）': { 优秀: 11, 合格: 9 },
      '系级主要学生干部（第十一条二·服务满一年）': { 优秀: 12, 合格: 10 },
      '系级非主要学生干部（第十一条二·服务满一年）': { 优秀: 10, 合格: 8 },
      '班级主要（班长、团支书）（第十一条二·服务满一年）': { 优秀: 10, 合格: 8 },
      '班级非主要（第十一条二·服务满一年）': { 优秀: 8, 合格: 6 },
      '院系组织干事、部员（第十一条二·服务满一年）': { 优秀: 4, 合格: 2 },
    },
    volunteerSocialPractice: {
      '精神文明表彰_院级（第十一条一）': 2,
      '精神文明表彰_校市级（第十一条一）': 4,
      '精神文明表彰_省部级（第十一条一）': 8,
      '精神文明表彰_国家级（第十一条一）': 16,
      '荣誉称号_系级（第十一条三）': 0.5,
      '荣誉称号_院级（第十一条三）': 1,
      '荣誉称号_校市级（第十一条三）': 2,
      '荣誉称号_省部级（第十一条三）': 4,
      '荣誉称号_国家级（第十一条三）': 8,
      '入伍服役期满每学年（第十一条四）': 2,
      '服役期立功嘉奖每学年（第十一条四）': 4,
      '社会实践志愿服务_系级（第十五条一）': 0.5,
      '社会实践志愿服务_院级（第十五条一）': 1,
      '社会实践志愿服务_校市级（第十五条一）': 2,
      '社会实践志愿服务_省部级（第十五条一）': 4,
      '社会实践志愿服务_国家级（第十五条一）': 8,
      '宣传报道_系级（第十五条三）': 0.2,
      '宣传报道_院级（第十五条三）': 0.5,
      '宣传报道_校市级（第十五条三）': 2,
      '宣传报道_省级（第十五条三）': 4,
      '宣传报道_国家级（第十五条三）': 8,
    },
    studyStar: { perTime: 1, maxPerYear: 99 },
    militaryTraining: 0,
    excellentClass: {
      '主要负责人（班长、团支书）（优良学风班）': 2,
      '其他班委（学习委员等）（优良学风班）': 1,
      '班级其他成员（优良学风班）': 0.5,
    },
    starDormitory: {
      '四星级及以上宿舍成员（第十五条二·每学期）': { 成员: 1 },
    },
  },
};

/* ---------------- 表格结构常量 ---------------- */

const CATEGORY_ORDER = ['moral', 'intellectual', 'physical', 'aesthetic', 'labor'];
const CATEGORY_LABELS = {
  moral: '德育发展素质加分',
  intellectual: '智育发展素质加分',
  physical: '体育发展素质加分',
  aesthetic: '美育发展素质加分',
  labor: '劳育发展素质加分',
};
const CATEGORY_COLORS = {
  moral: '#b54a3f',
  intellectual: '#3f5d8f',
  physical: '#3f7d52',
  aesthetic: '#7d4a86',
  labor: '#b07d2e',
};
const DEFAULT_ROWS_COUNT = { moral: 5, intellectual: 5, physical: 6, aesthetic: 4, labor: 3 };

/* ---------------- 状态 ---------------- */

let form = null;
let messages = [];
let mode = 'chat'; // chat | handbook
let handbookBundle = null;
let processing = false;

const $ = (sel) => document.querySelector(sel);
const els = {};

/* ---------------- 工具函数 ---------------- */

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function safeNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/** 轻量格式化：转义 + **加粗** + 【标题】高亮 */
function fmt(s) {
  let t = esc(s);
  t = t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  t = t.replace(/(【[^】]{1,12}】)/g, '<span class="sec">$1</span>');
  return t;
}
function toast(text, ms = 2200) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}

/* ---------------- 持久化 ---------------- */

const LS = {
  form: 'xzj_new_form',
  chat: 'xzj_new_chat',
  fp: 'xzj_new_fingerprints',
  imghash: 'xzj_new_image_hashes',
};

function saveForm() { localStorage.setItem(LS.form, JSON.stringify(form)); }
function saveChat() { localStorage.setItem(LS.chat, JSON.stringify(messages)); }

function makeEmptyRows(category, count) {
  return Array.from({ length: count }, (_, i) => ({
    id: genId(`row_${category}`),
    projectDesc: category === 'intellectual' && i === 0 ? '专业排名前    %（   /   ）' : '',
    materialDesc: '',
    score: 0,
    source: 'manual',
  }));
}
function makeInitialForm() {
  const categories = {};
  for (const key of CATEGORY_ORDER) categories[key] = makeEmptyRows(key, DEFAULT_ROWS_COUNT[key]);
  return { className: '', studentName: '', fillDate: todayStr(), categories };
}
function loadForm() {
  try {
    const raw = localStorage.getItem(LS.form);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.categories) return parsed;
    }
  } catch (e) { /* ignore */ }
  return makeInitialForm();
}
function loadMessages() {
  try {
    const raw = localStorage.getItem(LS.chat);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch (e) { /* ignore */ }
  return [{
    id: genId('msg'),
    role: 'assistant',
    type: 'text',
    content: '你好！我是徐海学院素质测评填表助手📋\n\n请上传奖状、证书、成绩单、证明材料等照片（可一次上传多张），我会自动识别内容、分类并给出建议加分，结果将实时写入右侧申报表。\n\n你也可以用文字让我修改，比如："把这张改到美育""这条加0.5分""删掉第三条"。',
    timestamp: Date.now(),
  }];
}

/* ---------------- DeepSeek 客户端 ---------------- */

const DEFAULT_MODEL = 'deepseek-flash';

async function chatStreamRaw(messagesArr, options = {}) {
  const body = {
    model: options.model || DEFAULT_MODEL,
    messages: messagesArr,
    stream: true,
    temperature: options.temperature ?? 0.5,
    max_tokens: options.maxTokens ?? 8192,
  };
  if (DEFAULT_MODEL === body.model) {
    body.thinking = { type: 'disabled' };
  }
  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => '');
    // 模型名不可用时回退 deepseek-chat 重试一次
    if ((resp.status === 400 || resp.status === 404) && body.model === DEFAULT_MODEL) {
      return chatStreamRaw(messagesArr, { ...options, model: 'deepseek-chat' });
    }
    throw new Error(`DeepSeek 接口错误 ${resp.status}：${text.slice(0, 300)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  return {
    async * [Symbol.asyncIterator]() {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta;
            if (delta?.content) yield { content: delta.content };
          } catch (e) { /* 忽略不完整行 */ }
        }
      }
    },
  };
}

async function chatComplete(messagesArr, options = {}) {
  let full = '';
  const stream = await chatStreamRaw(messagesArr, options);
  for await (const chunk of stream) full += chunk.content;
  return full;
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/* ---------------- 判分规则转文本 ---------------- */

function rulesToText() {
  const r = DEFAULT_SCORING_RULES.rules;
  const lines = [];
  lines.push('【专业排名加分（智育）】');
  for (const [k, v] of Object.entries(r.professionalRanking)) lines.push(`- ${k}：${v}分`);
  lines.push('【学业提升加分（智育）】');
  for (const [k, v] of Object.entries(r.academicImprovement)) lines.push(`- ${k}：${v}分`);
  lines.push('【英语/计算机（智育）】');
  for (const [k, v] of Object.entries(r.englishComputer)) lines.push(`- ${k}：${v}分`);
  lines.push('【学科竞赛（智育）】');
  for (const [level, awards] of Object.entries(r.academicCompetition)) {
    const parts = Object.entries(awards).map(([a, s]) => `${a}${s}分`).join('/');
    lines.push(`- ${level}：${parts}`);
  }
  lines.push('【文化艺术体育竞赛（体育/美育）】');
  for (const [level, awards] of Object.entries(r.sportsArtsCompetition)) {
    const parts = Object.entries(awards).map(([a, s]) => `${a}${s}分`).join('/');
    lines.push(`- ${level}：${parts}`);
  }
  lines.push('【通用计奖说明】');
  r.generalRules.forEach((rule, i) => lines.push(`${i + 1}. ${rule}`));
  lines.push('【论文专利（智育）】');
  for (const [k, v] of Object.entries(r.thesisPatent)) lines.push(`- ${k}：${v}分`);
  lines.push('【学生干部（德育）】');
  for (const [pos, levels] of Object.entries(r.studentCadre)) {
    const parts = Object.entries(levels).map(([l, s]) => `${l}${s}分`).join('/');
    lines.push(`- ${pos}：${parts}`);
  }
  lines.push('【志愿服务与社会实践】');
  for (const [k, v] of Object.entries(r.volunteerSocialPractice)) lines.push(`- ${k}：${v}分`);
  lines.push(`【学习之星】每次${r.studyStar.perTime}分，学年累计最多${r.studyStar.maxPerYear}分`);
  lines.push('【优良学风班】');
  for (const [k, v] of Object.entries(r.excellentClass)) lines.push(`- ${k}：${v}分`);
  lines.push('【星级宿舍】');
  for (const [star, roles] of Object.entries(r.starDormitory)) {
    const parts = Object.entries(roles).map(([role, s]) => `${role}${s}分`).join('/');
    lines.push(`- ${star}：${parts}`);
  }
  return lines.join('\n');
}

/* ---------------- 判分结果解析 ---------------- */

function extractSection(text, name) {
  const re = new RegExp(
    `【${name}】[：:]?\\s*([\\s\\S]*?)(?=【[\\u4e00-\\u9fa5A-Za-z]+】|本判分结果仅供参考|$)`,
  );
  const m = text.match(re);
  return m ? m[1].trim() : '';
}

function parseScoringResult(text) {
  const result = {
    category: null, projectName: '', suggestedScore: 0,
    projectDesc: '', materialDesc: '', basis: '', materialKey: '',
  };
  const catText = extractSection(text, '分类结果').split('\n').find((l) => l.trim()) || '';
  if (catText.includes('德育')) result.category = 'moral';
  else if (catText.includes('智育')) result.category = 'intellectual';
  else if (catText.includes('体育')) result.category = 'physical';
  else if (catText.includes('美育')) result.category = 'aesthetic';
  else if (catText.includes('劳育')) result.category = 'labor';

  const num = extractSection(text, '建议加分').match(/([\d.]+)/);
  if (num) result.suggestedScore = parseFloat(num[1]);

  const desc = extractSection(text, '项目说明');
  if (desc) result.projectDesc = desc.replace(/\s*\n\s*/g, ' ');

  const mat = extractSection(text, '材料说明');
  if (mat) result.materialDesc = mat;

  result.basis = extractSection(text, '判分依据');

  const keyLine = extractSection(text, '材料指纹')
    .split('\n').map((l) => l.trim()).filter(Boolean).find((l) => l.includes('|'));
  if (keyLine) result.materialKey = keyLine.replace(/\s+/g, '');

  return result;
}

/* ---------------- 同证书去重 ---------------- */

function normalizeFingerprint(text) {
  return text.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
}
function extractNumbers(text) {
  const nums = text.match(/\d+(?:\.\d+)?/g) || [];
  return nums.sort().join(',');
}
function bigrams(s) {
  const set = new Set();
  if (s.length === 1) { set.add(s); return set; }
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}
function textSimilarity(a, b) {
  if (!a || !b) return 0;
  const ga = bigrams(a), gb = bigrams(b);
  let inter = 0;
  ga.forEach((g) => { if (gb.has(g)) inter++; });
  const union = ga.size + gb.size - inter;
  return union === 0 ? 0 : inter / union;
}
function getFingerprints() {
  try {
    const list = JSON.parse(localStorage.getItem(LS.fp) || '[]');
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
function isAlreadySubmitted(materialKey, recognitionText) {
  const list = getFingerprints();
  const currentKey = normalizeFingerprint(materialKey || '');
  const currentNums = extractNumbers(recognitionText);
  const currentRaw = normalizeFingerprint(recognitionText);
  for (const item of list) {
    if (currentKey && item.key && item.key === currentKey) return true;
    if (!currentKey && item.nums === currentNums && currentNums !== '' && textSimilarity(item.raw, currentRaw) >= 0.8) return true;
  }
  return false;
}
function saveFingerprint(materialKey, recognitionText) {
  const list = getFingerprints();
  const record = {
    key: normalizeFingerprint(materialKey || ''),
    nums: extractNumbers(recognitionText),
    raw: normalizeFingerprint(recognitionText),
  };
  const dup = list.some((item) =>
    (record.key && item.key === record.key) ||
    (!record.key && item.nums === record.nums && textSimilarity(item.raw, record.raw) >= 0.8));
  if (!dup) {
    list.push(record);
    localStorage.setItem(LS.fp, JSON.stringify(list));
  }
}
function rankingTier(n, total) {
  if (!total || n <= 0 || n > total) return null;
  const pct = (n / total) * 100;
  for (const t of [3, 10, 20, 30, 40]) if (pct <= t) return t;
  return null;
}

/* ---------------- 同一张奖状只能使用一次：图片感知哈希（dHash）去重 ---------------- */

function imageHash(img) {
  // 差异哈希：缩小到 9x8 灰度图，逐行比较相邻像素
  const size = 8;
  const canvas = document.createElement('canvas');
  canvas.width = size + 1;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size + 1, size);
  const data = ctx.getImageData(0, 0, size + 1, size).data;
  const grays = [];
  for (let i = 0; i < (size + 1) * size; i++) {
    grays.push((data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3);
  }
  let hash = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      hash += grays[y * (size + 1) + x] < grays[y * (size + 1) + x + 1] ? '1' : '0';
    }
  }
  return hash;
}

function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

function dataUrlToHash(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try { resolve(imageHash(img)); }
      catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = dataUrl;
  });
}

function getImageHashes() {
  try {
    const list = JSON.parse(localStorage.getItem(LS.imghash) || '[]');
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

/** 判断图片是否已使用过（汉明距离 <= 6 视为同一张图） */
function isImageUsed(hash) {
  return getImageHashes().some((x) => hamming(x, hash) <= 6);
}

function saveImageHash(hash) {
  if (!hash) return;
  const list = getImageHashes();
  if (!list.some((x) => hamming(x, hash) <= 6)) {
    list.push(hash);
    localStorage.setItem(LS.imghash, JSON.stringify(list));
  }
}

/* ---------------- 学生手册本地检索（迁移自 handbookSearch.ts） ---------------- */

function extractKeywords(question) {
  const tokens = new Set();
  const chinesePhrases = question.match(/[\u4e00-\u9fa5]{3,}/g) || [];
  chinesePhrases.forEach((p) => tokens.add(p));
  const englishTerms = question.match(/[A-Za-z][A-Za-z0-9\-]{2,}/g) || [];
  englishTerms.forEach((t) => tokens.add(t.toLowerCase()));
  const allChinese = question.replace(/[^\u4e00-\u9fa5]/g, '');
  for (let i = 0; i < allChinese.length - 1; i++) tokens.add(allChinese.slice(i, i + 2));
  return Array.from(tokens);
}

function searchHandbook(question, topN = 4) {
  if (!handbookBundle) return [];
  const qKeywords = extractKeywords(question);
  if (qKeywords.length === 0) return [];

  const W = { title: 20, keyword: 12, category: 5, body: 1 };
  const hits = [];
  const escapeRe = (kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  for (const section of handbookBundle.sections) {
    let score = 0;
    const matchedLines = new Set();
    let windowSnippet = '';
    let bestSnippetScore = 0;

    for (const kw of qKeywords) {
      if (section.title.toLowerCase().includes(kw)) score += W.title;
      if (section.keywords.some((k) => k.toLowerCase().includes(kw))) score += W.keyword;
      if (section.category.toLowerCase().includes(kw)) score += W.category;
    }

    const paragraphs = section.text.split(/\n\s*\n/);
    for (const para of paragraphs) {
      if (!para.trim()) continue;
      let paraScore = 0;
      const paraLower = para.toLowerCase();
      for (const kw of qKeywords) {
        const m = paraLower.match(new RegExp(escapeRe(kw), 'gi'));
        if (m) paraScore += m.length * W.body;
      }
      if (paraScore > 0) {
        for (const line of para.split('\n')) {
          const lineLower = line.toLowerCase();
          if (qKeywords.some((kw) => lineLower.includes(kw))) matchedLines.add(line.trim());
        }
        if (paraScore > bestSnippetScore) {
          bestSnippetScore = paraScore;
          let firstHit = paraLower.length;
          for (const kw of qKeywords) {
            const idx = paraLower.indexOf(kw);
            if (idx >= 0 && idx < firstHit) firstHit = idx;
          }
          const start = Math.max(0, firstHit - 100);
          const end = Math.min(para.length, firstHit + 400);
          windowSnippet = (start > 0 ? '…' : '') + para.slice(start, end) + (end < para.length ? '…' : '');
        }
      }
      score += paraScore;
    }

    if (score > 0) {
      let snippet = '';
      if (matchedLines.size > 0) {
        snippet = Array.from(matchedLines).join('\n');
        if (snippet.length > 800) snippet = snippet.slice(0, 800) + '…';
      } else snippet = windowSnippet;
      hits.push({ section, score, snippet });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, topN);
}

function buildRetrievalContext(question, maxChars = 5000) {
  const hits = searchHandbook(question, 5);
  if (hits.length === 0) return { context: '', citedSections: [] };
  const citedSections = [];
  const parts = [];
  let totalChars = 0;
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    const section = hit.section;
    let excerpt = hit.snippet || section.text.slice(0, 500);
    const header = `\n【资料${i + 1}】${section.title}（${section.edition}版，来源：${section.category}）\n`;
    if (totalChars + header.length + excerpt.length > maxChars && parts.length > 0) break;
    parts.push(header + excerpt);
    citedSections.push(section);
    totalChars += header.length + excerpt.length;
  }
  return { context: parts.join('\n---\n'), citedSections };
}

/** 手册问答：本地检索 + AI 生成（流式回调） */
async function askHandbook(question, onDelta) {
  const { context, citedSections } = buildRetrievalContext(question, 5000);
  if (!context) {
    return { content: '学生手册资料中未查到相关内容，建议咨询辅导员或系学工办。', citations: [], found: false };
  }
  const prompt = HANDBOOK_QA_PROMPT
    .replace('{{input.handbook_content}}', context)
    .replace('{{input.user_question}}', question);
  try {
    const content = await chatComplete(
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, maxTokens: 2048 },
    );
    if (!content.trim()) {
      return { content: '学生手册资料中未查到相关内容，建议咨询辅导员或系学工办。', citations: citedSections.map(toCite), found: false };
    }
    const notFound = /(没有相关|无法回答|抱歉.*没有|查不到|未找到)/.test(content.slice(0, 50));
    return { content, citations: citedSections.map(toCite), found: !notFound };
  } catch (err) {
    const fallback = '学生手册问答助手暂时不可用。以下是检索到的最相关资料原文片段，供你参考：\n\n' +
      citedSections.map((s, i) => `【S${i + 1}】${s.title}\n${s.text.slice(0, 400)}${s.text.length > 400 ? '…' : ''}`).join('\n\n');
    return { content: fallback, citations: citedSections.map(toCite), found: citedSections.length > 0 };
  }
  function toCite(s, i) {
    return { id: `S${i + 1}`, title: s.title, edition: s.edition };
  }
}

/* ---------------- 表格操作 ---------------- */

function updateRow(category, rowId, patch) {
  form.categories[category] = form.categories[category].map((r) => (r.id === rowId ? { ...r, ...patch } : r));
  renderForm();
  saveForm();
  updateStats();
}
function addRow(category, afterRowId) {
  const newRow = { id: genId(`row_${category}`), projectDesc: '', materialDesc: '', score: 0, source: 'manual' };
  const rows = [...form.categories[category]];
  if (afterRowId) {
    const idx = rows.findIndex((r) => r.id === afterRowId);
    rows.splice(idx + 1, 0, newRow);
  } else {
    rows.push(newRow);
  }
  form.categories[category] = rows;
  renderForm();
  saveForm();
  updateStats();
  return newRow.id;
}
function deleteRow(category, rowId) {
  let rows = form.categories[category].filter((r) => r.id !== rowId);
  if (rows.length === 0) rows = makeEmptyRows(category, 1);
  form.categories[category] = rows;
  renderForm();
  saveForm();
  updateStats();
}
function categorySums() {
  const sums = {};
  for (const key of CATEGORY_ORDER) {
    sums[key] = form.categories[key].reduce((acc, r) => acc + safeNum(r.score), 0);
  }
  return sums;
}
function totalWeighted(sums) {
  return sums.moral * 0.25 + sums.intellectual * 0.6 + sums.physical * 0.05 + sums.aesthetic * 0.05 + sums.labor * 0.05;
}

/* ---------------- 申报表渲染 ---------------- */

function renderForm() {
  const sums = categorySums();
  const total = totalWeighted(sums);
  const catCls = { moral: 'cat-moral', intellectual: 'cat-intellectual', physical: 'cat-physical', aesthetic: 'cat-aesthetic', labor: 'cat-labor' };

  let bodyRows = '';
  for (const cat of CATEGORY_ORDER) {
    const rows = form.categories[cat];
    rows.forEach((row, i) => {
      bodyRows += `<tr>
        <td class="center">${i + 1}</td>
        ${i === 0 ? `<td rowspan="${rows.length}" class="cat-cell ${catCls[cat]}">${CATEGORY_LABELS[cat]}</td>` : ''}
        <td class="desc-cell" data-cat="${cat}" data-row="${row.id}" data-field="projectDesc">${row.projectDesc ? esc(row.projectDesc) : '<span class="placeholder">—</span>'}</td>
        <td class="desc-cell" data-cat="${cat}" data-row="${row.id}" data-field="materialDesc">${row.materialDesc ? esc(row.materialDesc) : '<span class="placeholder"></span>'}</td>
        <td class="score-td">
          <div class="score-flex">
            <button class="row-op score-op" title="减少0.5分" data-op="minus" data-cat="${cat}" data-row="${row.id}">−</button>
            <span class="score-cell" data-cat="${cat}" data-row="${row.id}" data-field="score">${row.score ? row.score : '<span class="placeholder">—</span>'}</span>
            <button class="row-op score-op" title="增加0.5分" data-op="plus" data-cat="${cat}" data-row="${row.id}">＋</button>
          </div>
        </td>
        <td></td><td></td><td></td>
        <td><div class="row-ops">
          <button class="row-op" title="下方增行" data-op="add" data-cat="${cat}" data-row="${row.id}">＋</button>
          <button class="row-op del" title="删除行" data-op="del" data-cat="${cat}" data-row="${row.id}">🗑</button>
        </div></td>
      </tr>`;
    });
  }

  els.formScroll.innerHTML = `
    <div class="form-sheet">
      <h1>徐海学院学生发展素质测评个人申报表</h1>
      <div class="form-meta">
        <span>班级：<input id="fClass" value="${esc(form.className)}" size="14" placeholder="2024级..." /></span>
        <span>学生姓名：<input id="fName" value="${esc(form.studentName)}" size="10" placeholder="姓名" /></span>
        <span>填表日期：<input id="fDate" type="date" value="${esc(form.fillDate)}" /></span>
      </div>
      <table class="sheet-table">
        <thead>
          <tr>
            <th style="width:5%">序号</th>
            <th style="width:12%">测评项目</th>
            <th style="width:20%">项目说明</th>
            <th style="width:14%">附认证材料情况说明</th>
            <th style="width:8%">申请加分</th>
            <th style="width:11%">班级材料审核认证</th>
            <th style="width:8%">同意加分</th>
            <th style="width:8%">年级审核</th>
            <th style="width:14%">备注</th>
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
          <tr class="sum-row">
            <td colspan="2" class="center">本人申请</td>
            <td class="center">德育加分：${sums.moral.toFixed(1)}</td>
            <td class="center">智育加分：${sums.intellectual.toFixed(1)}</td>
            <td class="center">体育加分：${sums.physical.toFixed(1)}</td>
            <td class="center">美育加分：${sums.aesthetic.toFixed(1)}</td>
            <td class="center">劳育加分：${sums.labor.toFixed(1)}</td>
            <td colspan="2" class="center">本人签名：__________</td>
          </tr>
          <tr class="audit-row">
            <td colspan="2" class="center">班级审核</td>
            <td class="center">德育加分：</td>
            <td class="center">智育加分：</td>
            <td class="center">体育加分：</td>
            <td class="center">美育加分：</td>
            <td class="center">劳育加分：</td>
            <td colspan="2" class="center">班长签名：__________</td>
          </tr>
          <tr class="total-row">
            <td colspan="9">
              <div class="total-formula">
                发展素质得分 = 德育（${sums.moral.toFixed(1)}）×25% + 智育（${sums.intellectual.toFixed(1)}）×60% +
                体育（${sums.physical.toFixed(1)}）×5% + 美育（${sums.aesthetic.toFixed(1)}）×5% +
                劳育（${sums.labor.toFixed(1)}）×5% =（<span class="total-num">${total.toFixed(2)}</span>）分
              </div>
            </td>
          </tr>
          <tr class="opinion-row">
            <td colspan="2" class="center">年级意见</td>
            <td colspan="5" class="center">________________________</td>
            <td colspan="2" class="center">审核人签名：__________</td>
          </tr>
        </tbody>
      </table>
      <div class="form-note">注：本表由本人如实认真填写，上报时所有加分项均要附证明材料；并在本表中对应栏作出有关情况说明。"附认证材料情况说明"一栏始终留空，由人工填写。<br>本判分结果仅供参考，最终加分认定以学院相关部门审核为准。</div>
    </div>`;

  // 基础信息输入
  $('#fClass').addEventListener('change', (e) => { form.className = e.target.value; saveForm(); });
  $('#fName').addEventListener('change', (e) => { form.studentName = e.target.value; saveForm(); });
  $('#fDate').addEventListener('change', (e) => { form.fillDate = e.target.value; saveForm(); });
}

/** 点击编辑单元格（事件委托） */
let editingCell = null;
function handleCellClick(e) {
  const cell = e.target.closest('.desc-cell, .score-cell');
  const opBtn = e.target.closest('.row-op');
  if (opBtn) {
    const { op, cat, row } = opBtn.dataset;
    if (op === 'add') addRow(cat, row);
    if (op === 'del') deleteRow(cat, row);
    if (op === 'plus' || op === 'minus') {
      const rowData = form.categories[cat].find((r) => r.id === row);
      if (rowData) {
        const delta = op === 'plus' ? 0.5 : -0.5;
        const newScore = Math.max(0, Math.round((safeNum(rowData.score) + delta) * 10) / 10);
        updateRow(cat, row, { score: newScore });
      }
    }
    return;
  }
  if (!cell || editingCell) return;
  const { cat, row, field } = cell.dataset;
  const rowData = form.categories[cat].find((r) => r.id === row);
  if (!rowData) return;

  const original = field === 'score' ? (rowData.score || '') : (rowData[field] || '');
  cell.innerHTML = `<input class="cell-input ${field === 'score' ? 'num' : ''}" value="${esc(original)}" />`;
  const input = cell.querySelector('input');
  input.focus();
  editingCell = { cat, row, field };

  const commit = () => {
    if (!editingCell) return;
    const val = input.value;
    const patch = field === 'score' ? { score: safeNum(val) } : { [field]: val };
    editingCell = null;
    updateRow(cat, row, patch);
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
    if (ev.key === 'Escape') { editingCell = null; renderForm(); }
  });
}

/* ---------------- 消息渲染 ---------------- */

function renderMessages() {
  const has = messages.length > 0;
  els.messages.classList.toggle('active', has);
  $('#welcome').classList.toggle('hidden', has);
  if (!has) return;

  els.messages.innerHTML = messages.map((m) => {
    if (m.role === 'user') {
      const delBtn = `<button class="msg-del" data-del="${m.id}" title="删除这条消息">✕</button>`;
      if (m.type === 'image') {
        return `<div class="msg user" data-mid="${m.id}">
          ${m.imageUrl ? `<img class="msg-img" src="${m.imageUrl}" />` : `<div class="msg-bubble">📷 ${esc(m.content || '图片')}</div>`}
          ${delBtn}
        </div>`;
      }
      return `<div class="msg user" data-mid="${m.id}"><div class="msg-bubble">${fmt(m.content)}</div>${delBtn}</div>`;
    }
    if (m.type === 'result-card' && m.result) {
      const r = m.result;
      return `<div class="msg assistant" data-mid="${m.id}">
        <div class="result-card">
          <div class="result-head">
            <span class="result-badge" style="background:${CATEGORY_COLORS[r.category] || '#999'}">${CATEGORY_LABELS[r.category] || ''}</span>
            <span class="result-name">${esc(r.projectName)}</span>
            <span class="result-score">${r.suggestedScore}<small>分</small></span>
          </div>
          ${r.basis ? `<div class="result-basis">${fmt(r.basis)}</div>` : ''}
        </div>
      </div>`;
    }
    const citeHtml = m.handbookAnswer?.citations?.length
      ? `<div class="citations">${m.handbookAnswer.citations.map((c) => `<span class="cite-chip">📄 ${esc(c.title)}</span>`).join('')}</div>`
      : '';
    return `<div class="msg assistant" data-mid="${m.id}">
      <div class="msg-bubble">${m.content ? fmt(m.content) : '<span class="typing"><i></i><i></i><i></i></span>'}</div>
      ${citeHtml}
    </div>`;
  }).join('');

  els.messages.scrollTop = els.messages.scrollHeight;
}

function addMessage(msg) {
  messages.push(msg);
  renderMessages();
  saveChat();
}
function updateMessage(id, patch) {
  messages = messages.map((m) => (m.id === id ? { ...m, ...patch } : m));
  renderMessages();
  saveChat();
}

/* ---------------- 上传识别主流程 ---------------- */

async function handleFiles(files) {
  if (!files || files.length === 0 || processing) return;
  const fileArray = Array.from(files);

  for (const file of fileArray) {
    if (!file.type.startsWith('image/')) {
      toast('请上传图片文件');
      continue;
    }

    const imageUrl = URL.createObjectURL(file);
    const userMsgId = genId('msg');
    const resultMsgId = genId('msg');

    addMessage({
      id: userMsgId, role: 'user', type: 'image',
      content: file.name, imageUrl,
      timestamp: Date.now(),
    });
    addMessage({ id: resultMsgId, role: 'assistant', type: 'text', content: '正在识别图片内容...', timestamp: Date.now() });

    processing = true;
    setSendDisabled(true);

    try {
      // 同一张奖状只能使用一次：先按图片感知哈希去重
      const dataUrl = await fileToDataUrl(file);
      const imgHash = await dataUrlToHash(dataUrl);
      if (isImageUsed(imgHash)) {
        updateMessage(userMsgId, { recognitionStatus: 'failed' });
        updateMessage(resultMsgId, { content: '⚠️ 这张奖状已经使用过了，同一张奖状只能使用一次，不能重复加分。' });
        toast('这张奖状已使用过，不能重复使用');
        continue;
      }

      // 第一步：图片识别
      let recognitionText = '';
      const recStream = await chatStreamRaw([{
        role: 'user',
        content: [
          { type: 'text', text: RECOGNITION_PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      }], { temperature: 0.2, maxTokens: 2048 });

      for await (const chunk of recStream) {
        recognitionText += chunk.content;
        updateMessage(resultMsgId, {
          content: `正在识别...\n${recognitionText.slice(0, 200)}${recognitionText.length > 200 ? '...' : ''}`,
        });
      }

      if (!recognitionText.trim()) {
        updateMessage(resultMsgId, { content: '未能识别到有效内容，请确认图片清晰后重新上传。' });
        continue;
      }

      // 第二步：判分
      updateMessage(resultMsgId, { content: '正在分类与判分...' });
      const scoringPrompt = SCORING_PROMPT
        .replace('{{input.ocr_text}}', recognitionText)
        .replace('{{input.scoring_rules}}', rulesToText())
        .replace('{{input.classification_guidelines}}', CLASSIFICATION_GUIDELINES);

      let scoringText = '';
      const scoreStream = await chatStreamRaw(
        [{ role: 'user', content: scoringPrompt }],
        { temperature: 0.3, maxTokens: 2048 },
      );
      for await (const chunk of scoreStream) {
        scoringText += chunk.content;
        updateMessage(resultMsgId, { content: scoringText });
      }

      const parsed = parseScoringResult(scoringText);

      // 去重
      if (isAlreadySubmitted(parsed.materialKey, recognitionText)) {
        updateMessage(resultMsgId, {
          content: `${scoringText}\n\n⚠️ 该奖项已提交过，同一张证书只能提交一次，请勿重复提交。`,
        });
        toast('该奖项已提交过，请勿重复提交');
        continue;
      }

      // 竞赛类：查学生手册核实级别
      let handbookCheckText = '';
      const isCompetition = /竞赛|比赛|蓝桥杯|挑战杯|外研社|数学建模|英语竞赛|运动会|才艺|演讲|辩论赛|征文|设计大赛/.test(
        parsed.projectDesc + recognitionText,
      );
      if (isCompetition && handbookBundle) {
        updateMessage(resultMsgId, { content: '正在查阅学生手册核实竞赛级别...' });
        try {
          const hbAnswer = await askHandbook(
            `请确认：${parsed.projectDesc || recognitionText.slice(0, 100)} 属于什么级别的竞赛？属于一级甲等/一级乙等/二级/省级/市校级中的哪一档？请用一句话给出级别结论并标明依据的资料名称。`,
          );
          const firstLine = hbAnswer.content.split('\n').find((l) => l.trim().length > 0) || '';
          const citationNames = hbAnswer.citations.map((c) => `《${c.title}》`).join('、');
          if (hbAnswer.found && hbAnswer.citations.length > 0) {
            handbookCheckText = `\n\n📚 学生手册核实：${firstLine.length > 100 ? firstLine.slice(0, 100) + '…' : firstLine}\n依据：${citationNames}`;
          } else {
            handbookCheckText = '\n\n📚 学生手册核实：竞赛分级表中未查到该赛事，级别请以系/学院认定为准。';
          }
        } catch (e) {
          handbookCheckText = '\n\n📚 学生手册核实：问答助手暂不可用，以上判分为内置规则建议，最终请以系里实施细则和学院审核为准。';
        }
      }

      const finalBasis = (parsed.basis || scoringText) + handbookCheckText;

      // 专业排名截图
      const rankMatch = recognitionText.match(/(\d{1,4})\s*\/\s*(\d{1,4})/);
      const isRanking = parsed.category === 'intellectual' && /专业排名|排名/.test(recognitionText) && !!rankMatch;

      if (parsed.category && isRanking && rankMatch) {
        const n = parseInt(rankMatch[1], 10);
        const total = parseInt(rankMatch[2], 10);
        const tier = rankingTier(n, total);
        const firstRow = form.categories.intellectual[0];
        const firstRowIsPlaceholder = firstRow && firstRow.score === 0 && firstRow.source === 'manual' && /专业排名/.test(firstRow.projectDesc);

        if (tier && firstRowIsPlaceholder) {
          const rankDesc = `专业排名前${tier}%（${n}/${total}）`;
          updateRow('intellectual', firstRow.id, { projectDesc: rankDesc, score: parsed.suggestedScore, source: 'ai' });
          saveFingerprint(parsed.materialKey, recognitionText);
          saveImageHash(imgHash);
          updateMessage(resultMsgId, {
            type: 'result-card',
            result: { category: 'intellectual', projectName: rankDesc, suggestedScore: parsed.suggestedScore, basis: finalBasis },
          });
        } else if (!tier) {
          updateMessage(resultMsgId, { content: `${scoringText}\n\n⚠️ 已识别到排名 ${n}/${total}，但未能匹配加分档位，请在右栏手动核对。` });
        } else {
          updateMessage(resultMsgId, { content: `${scoringText}\n\n⚠️ 智育第一行已填写专业排名，为避免覆盖未自动填入。如需更新，请先在右栏删除或修改第一行后重新上传。` });
        }
      } else if (parsed.category) {
        const category = parsed.category;
        const rowId = addRow(category);
        updateRow(category, rowId, {
          projectDesc: parsed.projectDesc || recognitionText.slice(0, 50),
          score: parsed.suggestedScore,
          source: 'ai',
        });
        saveFingerprint(parsed.materialKey, recognitionText);
        saveImageHash(imgHash);
        updateMessage(resultMsgId, {
          type: 'result-card',
          result: {
            category, projectName: parsed.projectDesc || '识别项目',
            suggestedScore: parsed.suggestedScore, basis: finalBasis,
          },
        });
        toast(`已填入${CATEGORY_LABELS[category]}：+${parsed.suggestedScore}分`);
      } else {
        updateMessage(resultMsgId, { content: `${scoringText}\n\n⚠️ 未能确定分类，请手动在右栏表格中填写。` });
      }
    } catch (error) {
      console.error(error);
      updateMessage(resultMsgId, { content: '识别服务暂时不可用，请稍后重试，或直接在右栏手动填写。\n\n' + String(error).slice(0, 200) });
      toast('图片识别失败');
    } finally {
      processing = false;
      setSendDisabled(false);
    }
  }
}

/* ---------------- 基本信息自动识别（班级 / 姓名） ---------------- */

// 姓名只填"学生姓名"栏；班级只填"班级"栏，互不串位。
const NAME_RE = /(?:我的?名字(?:是|叫)?|学生姓名[：:是]?|姓名[：:是]?|我?叫|我是)\s*([\u4e00-\u9fa5]{2,4})/;
// 明显不是人名的词：职务/称谓/疑问词，避免"我是班级生活委员"被当成姓名
const NAME_BAD_RE = /班级|委员|书记|干事|部长|主席|老师|同学|代表|组长|生活|学习|组织|宣传|体育|文艺|^[是谁什么怎么哪那]/;
// 班级：依次尝试 关键词式 / 年级式 / 连字符式
const CLASS_RES = [
  /(?:我的?班级|所在班级|班级)[：:是]?\s*([\u4e00-\u9fa5A-Za-z0-9\-·]{2,20}?班)/,
  /(20\d{2}\s*级[\u4e00-\u9fa5A-Za-z0-9\-]{1,20}?班)/,
  /([\u4e00-\u9fa5]{2,10}\d{2,4}-\d{1,3}班)/,
];

/**
 * 从用户输入文本中识别姓名和班级信息，自动填入申报表顶部对应栏位。
 * 纯本地正则实现，两种模式（填表/手册问答）都会调用。
 * 填表日期始终使用当天日期（可在表格中手动改）。
 */
function autoFillBasicInfo(text) {
  if (!text) return { changed: false, applied: [] };

  let changed = false;
  const applied = [];

  // 1) 先识别班级 → 只写 form.className（先班级后姓名，避免"我是XX24-3班"被当成姓名）
  let className = '';
  let classMatch = null;
  for (const re of CLASS_RES) {
    const m = text.match(re);
    if (m) { classMatch = m; break; }
  }
  if (classMatch) {
    // 清理捕获结果中混入的引导词（我是/我叫/姓名：等），只留班级本身
    className = classMatch[1]
      .replace(/\s+/g, '')
      .replace(/^(?:我的?班级[：:是]?|学生姓名[：:是]?|姓名[：:是]?|我的?名字(?:是|叫)?|我?叫|我是)/, '');
    if (className && /班$/.test(className)) {
      form.className = className;
      changed = true;
      applied.push(`班级「${className}」`);
    } else {
      classMatch = null; // 清理后无效，作废本次匹配
      className = '';
    }
  }

  // 2) 再识别姓名 → 只写 form.studentName（与班级匹配重叠时不填，防误填）
  const nm = text.match(NAME_RE);
  if (nm && !NAME_BAD_RE.test(nm[1])) {
    const overlap = classMatch && nm.index !== undefined && classMatch.index !== undefined &&
      nm.index >= classMatch.index && nm.index < classMatch.index + classMatch[0].length;
    const looksLikeClass = className && className.includes(nm[1]);
    if (!overlap && !looksLikeClass) {
      form.studentName = nm[1];
      changed = true;
      applied.push(`学生姓名「${nm[1]}」`);
    }
  }

  if (changed) {
    form.fillDate = todayStr();
    saveForm();
    renderForm();
    updateStats();
  }

  return { changed, applied };
}

/* ---------------- 文字指令 ---------------- */

async function handleSendText() {
  const text = els.input.value.trim();
  if (!text || processing) return;

  // 无论哪种模式，先尝试识别姓名/班级并填入表格
  const auto = autoFillBasicInfo(text);

  // 手册问答模式
  if (mode === 'handbook') {
    addMessage({ id: genId('msg'), role: 'user', type: 'text', content: text, timestamp: Date.now() });
    els.input.value = '';
    const assistantMsgId = genId('msg');
    addMessage({ id: assistantMsgId, role: 'assistant', type: 'text', content: '正在查阅学生手册…', timestamp: Date.now() });
    processing = true;
    setSendDisabled(true);
    try {
      const answer = await askHandbook(text, null);
      let content = answer.content;
      if (auto.changed && auto.applied.length) {
        content = `✅ 已自动填入：${auto.applied.join('、')}\n\n${content}`;
      }
      updateMessage(assistantMsgId, { content, handbookAnswer: { content: answer.content, citations: answer.citations } });
    } catch (e) {
      updateMessage(assistantMsgId, { content: '学生手册问答助手暂时不可用，请稍后再试。' });
    } finally {
      processing = false;
      setSendDisabled(false);
    }
    return;
  }

  // 填表模式：文字指令
  addMessage({ id: genId('msg'), role: 'user', type: 'text', content: text, timestamp: Date.now() });
  els.input.value = '';
  const assistantMsgId = genId('msg');

  // 若是自我介绍类输入（提到姓名/班级），直接处理基本信息，不走表格指令解析
  const hasOpIntent = /第[一二三四五六七八九十\d]+[条项]|删|加|改|移到|换|填|几分|加分/.test(text);
  const isIntro = /我的?名字|我?叫|姓名|我是|我的?班级|班级/.test(text);
  if (isIntro && !hasOpIntent) {
    let tips;
    if (auto.changed && auto.applied.length) {
      tips = `✅ 已自动填入：${auto.applied.join('、')}（填表日期已设为 ${form.fillDate}）`;
    } else {
      tips = '我识别到你在介绍基本信息，但没解析出有效的格式。\n\n姓名支持："我叫XX""姓名：XX""我的名字是XX"\n班级支持："我的班级是XX班""2024级XX班""机电2024-1班"\n\n也可以直接在右栏表格顶部手动填写。';
    }
    addMessage({ id: assistantMsgId, role: 'assistant', type: 'text', content: tips, timestamp: Date.now() });
    return;
  }

  addMessage({ id: assistantMsgId, role: 'assistant', type: 'text', content: '正在理解指令...', timestamp: Date.now() });
  processing = true;
  setSendDisabled(true);

  try {
    // 表格上下文
    const ctxParts = [];
    for (const key of CATEGORY_ORDER) {
      ctxParts.push(`【${CATEGORY_LABELS[key]}】`);
      form.categories[key].forEach((r, i) => {
        if (r.projectDesc.trim()) {
          ctxParts.push(`第${i + 1}条：${r.projectDesc.slice(0, 30)}（${r.score}分，行ID: ${r.id}）`);
        }
      });
    }

    const prompt = COMMAND_PARSER_PROMPT
      .replace('{{input.user_command}}', text)
      .replace('{{input.table_context}}', ctxParts.join('\n'));

    const raw = await chatComplete([{ role: 'user', content: prompt }], { temperature: 0.1, maxTokens: 1024 });
    const jsonText = raw.replace(/```json|```/g, '').trim();
    let result;
    try {
      result = JSON.parse(jsonText);
    } catch (e) {
      result = { confidence: 0, remark: '指令解析失败', operations: [] };
    }

    if ((result.confidence ?? 0) < 0.5 || !result.operations?.length) {
      updateMessage(assistantMsgId, {
        content: `抱歉，我没能完全理解你的指令。${result.remark || ''}\n\n你可以直接在右栏表格中点击单元格手动编辑，试试这些说法：\n- "把第三条改到美育"\n- "第二条加0.5分"\n- "删掉第四条"\n- "加上我是班级生活委员"`,
      });
      return;
    }

    // 定位目标行：优先按"第N条"
    let targetRow = null;
    const numMatch = text.match(/第([一二三四五六七八九十\d]+)[条项]/);
    if (numMatch) {
      const numMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
      let num = numMap[numMatch[1]] || parseInt(numMatch[1], 10);
      let count = 0;
      outer: for (const cat of CATEGORY_ORDER) {
        for (const row of form.categories[cat]) {
          if (row.projectDesc.trim()) {
            count++;
            if (count === num) { targetRow = { rowId: row.id, category: cat }; break outer; }
          }
        }
      }
    }
    // 按 rowId
    if (!targetRow) {
      for (const cat of CATEGORY_ORDER) {
        for (const row of form.categories[cat]) {
          const t = result.operations[0]?.target || '';
          if (t && row.id === t) { targetRow = { rowId: row.id, category: cat }; break; }
        }
      }
    }

    const opType = (result.operation_type || '').toUpperCase();
    let appliedCount = 0;

    for (const op of result.operations) {
      const params = op.params || {};
      if (opType === 'DELETE' && targetRow) {
        deleteRow(targetRow.category, targetRow.rowId);
        targetRow = null;
        appliedCount++;
        continue;
      }
      if (opType === 'UPDATE' && targetRow) {
        if (params.score !== undefined || params.分值 !== undefined) {
          updateRow(targetRow.category, targetRow.rowId, { score: safeNum(params.score ?? params.分值) });
          appliedCount++;
        }
        if (params.projectDesc || params.项目说明) {
          updateRow(targetRow.category, targetRow.rowId, { projectDesc: params.projectDesc || params.项目说明 });
          appliedCount++;
        }
        const newCatText = params.category || params.类别 || '';
        if (newCatText) {
          let newCat = null;
          for (const key of CATEGORY_ORDER) {
            if (newCatText.includes(CATEGORY_LABELS[key].slice(0, 2))) newCat = key;
          }
          if (newCat && newCat !== targetRow.category) {
            const row = form.categories[targetRow.category].find((r) => r.id === targetRow.rowId);
            if (row) {
              form.categories[targetRow.category] = form.categories[targetRow.category].filter((r) => r.id !== row.id);
              if (form.categories[targetRow.category].length === 0) {
                form.categories[targetRow.category] = makeEmptyRows(targetRow.category, 1);
              }
              row.source = 'manual';
              form.categories[newCat].push(row);
              renderForm(); saveForm(); updateStats();
              appliedCount++;
            }
          }
        }
      }
    }

    if (appliedCount > 0) {
      let msg = `✅ 已完成 ${appliedCount} 处修改，右侧申报表已更新。`;
      if (auto.changed && auto.applied.length) {
        msg += `\n同时已填入：${auto.applied.join('、')}。`;
      }
      updateMessage(assistantMsgId, { content: msg });
      toast('申报表已更新');
    } else if (auto.changed) {
      updateMessage(assistantMsgId, { content: `✅ 已自动填入：${auto.applied.join('、')}（填表日期 ${form.fillDate}）。` });
    } else {
      updateMessage(assistantMsgId, { content: '未能找到要操作的表格条目。你可以在右栏直接点击单元格编辑。' });
    }
  } catch (error) {
    console.error(error);
    updateMessage(assistantMsgId, { content: '指令处理失败，请稍后重试，或直接在右栏手动编辑。' });
  } finally {
    processing = false;
    setSendDisabled(false);
  }
}

/* ---------------- 加分规则弹窗 ---------------- */

function renderRules() {
  const r = DEFAULT_SCORING_RULES.rules;
  const sec = (title, items) => `<h3>${title}</h3><ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  let html = '';
  html += sec('专业排名加分（智育·第十二条一）', Object.entries(r.professionalRanking).map(([k, v]) => `${k}：${v}分`));
  html += sec('学业提升加分（智育·第十二条二）', Object.entries(r.academicImprovement).map(([k, v]) => `${k}：${v}分`));
  html += sec('英语 / 计算机 / 职业技能（智育·第十二条七八九）', Object.entries(r.englishComputer).map(([k, v]) => `${k}：${v}分`));
  html += sec('学科竞赛（智育·第十二条三）', Object.entries(r.academicCompetition).map(([lv, aw]) => `${lv}：` + Object.entries(aw).map(([a, s]) => `${a}${s}分`).join(' / ')));
  html += sec('体育竞赛（第十三条一）', Object.entries(r.sportsArtsCompetition).map(([lv, aw]) => `${lv}：` + Object.entries(aw).map(([a, s]) => `${a}${s}分`).join(' / ')));
  html += sec('论文 / 专利 / 软著（智育·第十二条四六）', Object.entries(r.thesisPatent).map(([k, v]) => `${k}：${v}分`));
  html += sec('学生干部（德育·第十一条二）', Object.entries(r.studentCadre).map(([p, lv]) => `${p}：` + Object.entries(lv).map(([l, s]) => `${l}${s}分`).join(' / ')));
  html += sec('表彰 / 荣誉 / 志愿实践 / 宣传报道', Object.entries(r.volunteerSocialPractice).map(([k, v]) => `${k}：${v}分`));
  html += sec('优良学风班 / 星级宿舍 / 学习之星', [
    ...Object.entries(r.excellentClass).map(([k, v]) => `${k}：${v}分`),
    `学习之星：每次${r.studyStar.perTime}分，学年累计最多${r.studyStar.maxPerYear}分`,
    ...Object.entries(r.starDormitory).map(([k, v]) => `${k}：` + Object.entries(v).map(([role, s]) => `${role}${s}分`).join(' / ')),
  ]);
  html += sec('通用判分规则（第十六条）', r.generalRules);
  html += `<div class="disclaimer">${esc(DEFAULT_SCORING_RULES.disclaimer)}</div>`;
  $('#rulesBody').innerHTML = html;
}

/* ---------------- 导出 Word / 打印 / 清空 ---------------- */

function exportWord() {
  const sums = categorySums();
  const total = totalWeighted(sums);
  const clone = $('.form-sheet').cloneNode(true);
  clone.querySelectorAll('.row-ops').forEach((n) => n.remove());
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>申报表</title>
  <style>
    body { font-family: SimSun, serif; font-size: 12px; }
    h1 { text-align: center; font-size: 18px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #444; padding: 4px 5px; font-size: 11px; }
    th { background: #eee; }
  </style></head><body>${clone.innerHTML}</body></html>`;
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `素质测评个人申报表_${form.studentName || '未命名'}.doc`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('已导出 Word 文档');
}

function resetAll() {
  // 用自绘确认弹窗（避免内置浏览器 iframe 拦截 window.confirm）
  $('#confirmModal').classList.add('active');
}

function doResetAll() {
  form = makeInitialForm();
  localStorage.removeItem(LS.form);
  localStorage.removeItem(LS.fp);
  localStorage.removeItem(LS.imghash);
  messages = [{
    id: genId('msg'), role: 'assistant', type: 'text',
    content: '已清空所有数据，重新开始填表吧～',
    timestamp: Date.now(),
  }];
  saveChat();
  renderForm();
  renderMessages();
  updateStats();
  $('#confirmModal').classList.remove('active');
  toast('已清空，重新开始');
}

/* ---------------- 统计与状态 ---------------- */

function updateStats() {
  // 更新顶栏"加分总分"徽章
  const el = $('#topTotal');
  if (el) {
    const sums = categorySums();
    el.textContent = totalWeighted(sums).toFixed(2);
  }
}

function setSendDisabled(v) {
  $('#btnSend').disabled = v;
}

function setMode(m) {
  mode = m;
  const btn = $('#btnMode');
  btn.dataset.mode = m;
  btn.classList.toggle('active', m === 'handbook');
  $('#modeLabel').textContent = m === 'handbook' ? '手册问答' : '填表模式';
  els.input.placeholder = m === 'handbook'
    ? '向学生手册提问，例如：转专业需要什么条件？'
    : '上传奖状/证书照片，或输入修改指令，例如：把第三条改到美育';
}

/* ---------------- 初始化 ---------------- */

async function init() {
  els.input = $('#input');
  els.messages = $('#messages');
  els.formScroll = $('#formScroll');

  form = loadForm();
  messages = loadMessages();

  renderForm();
  renderMessages();
  updateStats();
  renderRules();

  // 加载学生手册知识库（后台异步，不阻塞）
  fetch('/handbookBundle.json')
    .then((r) => r.json())
    .then((data) => { handbookBundle = data; })
    .catch(() => { handbookBundle = null; });

  // 事件绑定
  $('#btnSend').addEventListener('click', handleSendText);
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); }
  });
  els.input.addEventListener('input', () => {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 120) + 'px';
  });

  const fileInput = $('#fileInput');
  $('#btnPickImage').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    handleFiles(fileInput.files);
    fileInput.value = '';
  });

  $('#btnMode').addEventListener('click', () => setMode(mode === 'chat' ? 'handbook' : 'chat'));

  $('#btnRules').addEventListener('click', () => $('#rulesModal').classList.add('active'));
  $('#rulesClose').addEventListener('click', () => $('#rulesModal').classList.remove('active'));
  $('#rulesModal').addEventListener('click', (e) => {
    if (e.target === $('#rulesModal')) $('#rulesModal').classList.remove('active');
  });

  $('#btnWord').addEventListener('click', exportWord);
  $('#btnPrint').addEventListener('click', () => window.print());
  $('#btnClear').addEventListener('click', resetAll);

  // 清空确认弹窗
  $('#confirmOk').addEventListener('click', doResetAll);
  $('#confirmCancel').addEventListener('click', () => $('#confirmModal').classList.remove('active'));
  $('#confirmClose').addEventListener('click', () => $('#confirmModal').classList.remove('active'));
  $('#confirmModal').addEventListener('click', (e) => {
    if (e.target === $('#confirmModal')) $('#confirmModal').classList.remove('active');
  });

  // 对话消息删除（用户消息右上角 ✕）
  els.messages.addEventListener('click', (e) => {
    const del = e.target.closest('.msg-del');
    if (del) {
      const id = del.dataset.del;
      messages = messages.filter((m) => m.id !== id);
      saveChat();
      renderMessages();
      toast('已删除该消息');
    }
  });

  // 建议卡片
  document.querySelectorAll('.suggest-card').forEach((card) => {
    card.addEventListener('click', () => {
      const action = card.dataset.action;
      if (action === 'upload') fileInput.click();
      if (action === 'rules') $('#rulesModal').classList.add('active');
      if (action === 'handbook') {
        setMode('handbook');
        els.input.value = '奖学金评定条件是什么？';
        handleSendText();
      }
      if (action === 'sample') {
        setMode('handbook');
        els.input.value = '蓝桥杯江苏省赛二等奖属于什么竞赛级别？加几分？';
        handleSendText();
      }
    });
  });

  // 表格编辑委托
  els.formScroll.addEventListener('click', handleCellClick);
}

init();
