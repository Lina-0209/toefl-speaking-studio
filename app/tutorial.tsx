import { AudioLines, BookOpenText, CheckCircle2, ChevronRight, FileImage, Settings2, Sparkles } from "lucide-react";

type TutorialProps = { configured: boolean; onPractice: () => void; onSettings: () => void; onHistory: () => void };

const steps = [
  { title: "连接 API", icon: Settings2, text: "在「API 设置」粘贴你的 ztoken API 密钥并保存。模型名称需与你的 ztoken 账户支持的型号一致。", tip: "密钥已保存不代表模型已验证可用；首次实际调用时才会验证。" },
  { title: "命名练习，上传材料", icon: FileImage, text: "在「新建评分」填写练习名称，上传题目表格截图及回答录音。可附上场景图片，再点击「上传并识别题目」。", tip: "截图支持 PNG、JPG、WEBP，最多 4 张；录音支持 WAV、MP3、M4A，共 11 段。" },
  { title: "逐题核对后开始评分", icon: CheckCircle2, text: "检查识别出的 11 道英文题目，可直接修改。第 1–7 题填复述原句，第 8–11 题填面试问题；为每题选择对应的回答录音，再点击「确认并开始评分」。", tip: "同一段录音不能分配给多道题；题目或录音缺失时需先补齐。" },
  { title: "回听报告，针对性练习", icon: AudioLines, text: "查看每题 0–5 分、评分依据和改进建议，回听自己的录音。11 题全部完成后，查看原始分合计与 1–6 分的口语练习预估分。", tip: "在「历史记录」可重新打开练习、继续未完成的评分，也可删除该次练习及材料。" },
];

const faqs = [
  { question: "可以直接粘贴题目截图吗？", answer: "可以。在「新建评分」的上传材料页面，点击输入框以外的空白处，按 ⌘V（Mac）或 Ctrl+V（Windows）粘贴剪贴板中的截图。添加后会显示文件列表，可移除多余图片。" },
  { question: "录音怎样与题号对应？", answer: "文件名如 speaking-repeat-q1.wav 会匹配第 1 题，speaking-interview-q1.wav 会匹配第 8 题。没有匹配到的文件会依次分配，所以请始终在核对页面检查每道题的录音下拉选项。上传的是你的回答录音，复述题的原句则填写在题目框中。" },
  { question: "评分是先转写再打分吗？", answer: "逐题评分会将你的实际录音与 ETS 同题型的 3、4、5 分参考音频提交给音频模型，直接分析语音表现并依据细则评分。报告中的「音频模型听写」仅供参考，可能有识别误差。" },
  { question: "Interview 推荐回答怎样使用我的素材？", answer: "推荐回答会优先优化你的原回答，保留切题的观点和例子，改善表达与展开；再从当前使用的 12 个核心短语中选择两个，必要时用背诵素材补充例子。默认使用作者共享素材，也可在「我的素材」导入并保存自己的清单。报告会列出所选短语和优化说明。听写不可靠或原回答偏题时，会说明必要的调整。复述题不生成推荐回答。" },
  { question: "某道题失败，或者推荐回答没有生成怎么办？", answer: "已完成的评分会保留。可在报告中点击未完成题目的「重试本题」；Interview 评分已完成但推荐回答缺失时，点击「生成推荐回答」单独重试。要更新已有推荐回答，点击「重新生成」。未完成 11 题时不显示口语总分。" },
  { question: "API 报错或总分生成失败怎么办？", answer: "先查看页面的具体错误提示，再到「API 设置」核对密钥、模型名称及 ztoken 账户的额度和权限。上游服务暂时不可用时可稍后重试。11 题评分均完成但没有总分时，在报告底部点击「重新生成口语预估分」。" },
  { question: "练习预估分是官方成绩吗？", answer: "不是。逐题评分参考 ETS 细则与样例，原始分满分 55；1–6 分、每 0.5 分一档的总分是平台给出的练习预估，不是 ETS 官方换算或正式成绩。" },
];

export default function Tutorial({ configured, onPractice, onSettings, onHistory }: TutorialProps) {
  return <div className="tutorial">
    <section className="tutorial-welcome" aria-labelledby="tutorial-start-title">
      <span className="tutorial-badge"><BookOpenText size={15}/> FIRST PRACTICE</span>
      <h2 id="tutorial-start-title">从第一次上传，到看懂你的报告</h2>
      <p>准备好题目截图和 11 段回答录音，按下面四步完成一次练习。</p>
      <div className="tutorial-start-actions"><button className="primary-button" onClick={onPractice}>前往练习 <ChevronRight size={16}/></button><button className="tutorial-link" onClick={onSettings}>{configured ? "查看 API 设置" : "先设置 API"} <ChevronRight size={15}/></button></div>
    </section>

    <section className="tutorial-checklist" aria-labelledby="tutorial-materials-title">
      <h2 id="tutorial-materials-title">开始前，准备这三项</h2>
      <ul><li><CheckCircle2 size={17}/><span>一组完整题目：7 道 Listen and Repeat + 4 道 Take an Interview。</span></li><li><CheckCircle2 size={17}/><span>每题一段你自己的回答录音，建议在文件名中标明题型和题号。</span></li><li><CheckCircle2 size={17}/><span>可用的 ztoken API 密钥，以及支持相应输入的模型与调用额度。</span></li></ul>
    </section>

    <section aria-labelledby="tutorial-steps-title"><div className="tutorial-section-heading"><h2 id="tutorial-steps-title">完成第一次评分</h2><span>按顺序操作即可</span></div><ol className="tutorial-steps">{steps.map(({ title, icon: Icon, text, tip }, index) => <li className="tutorial-step" key={title}><div className="tutorial-step-top"><span className="tutorial-step-number">0{index + 1}</span><Icon size={20}/></div><h3>{title}</h3><p>{text}</p><p className="tutorial-tip">{tip}</p></li>)}</ol></section>

    <section className="tutorial-reading" aria-labelledby="tutorial-reading-title"><span className="icon-tile mint"><Sparkles size={21}/></span><div><h2 id="tutorial-reading-title">每次练习后，先改进一个问题</h2><p>先回听录音，再对照评分依据和建议。Interview 题可比较原回答与优化后的推荐回答，练习所选的两个核心短语，然后重新录音检验改进。</p><button className="tutorial-link" onClick={onHistory}>查看历史练习 <ChevronRight size={15}/></button></div></section>

    <section aria-labelledby="tutorial-faq-title"><div className="tutorial-section-heading"><h2 id="tutorial-faq-title">常见问题</h2><span>点击展开说明</span></div><div className="tutorial-faq">{faqs.map(({ question, answer }) => <details key={question}><summary>{question}<ChevronRight size={16}/></summary><p>{answer}</p></details>)}</div></section>
  </div>;
}
