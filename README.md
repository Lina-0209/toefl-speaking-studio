# 声分 · TOEFL Speaking Studio

一个用于新托福口语自学的开源练习平台：上传题目截图与回答录音，核对后逐题评分、回听复盘，并生成基于原回答优化的 Interview 推荐回答。

> 本仓库是独立的公开源码版本，不包含作者私人站点的密钥、练习历史或回答录音。当前尚未提供公共在线实例。每位用户使用自己的 ztoken API 密钥并承担调用费用。

## 功能

- 7 道 Listen and Repeat + 4 道 Take an Interview；每题 0–5 分。
- 直接将实际音频交给音频模型评分，随请求提供同题型 ETS 3、4、5 分参考录音。报告中的听写仅供参考。
- 题目截图上传或剪贴板粘贴；可编辑识别结果并核对录音对应关系。
- 自定义练习名称，保存录音、报告与历史记录，支持回听、删除和失败重试。
- 全部 11 题完成后显示原始分（满分 55）及 1–6 分、每 0.5 分一档的练习预估分。
- Interview 推荐回答优先保留原回答中切题的观点和例子，优化语言与展开，选用两个核心短语。复述题不生成推荐回答。
- **无需上传背诵素材**：默认使用作者共享的 12 个核心短语和故事。也可在「我的素材」导入 DOCX / TXT、识别核对并保存自己的素材；个人素材仅对该用户生效，删除后恢复共享库。
- 用户数据、API 密钥和个人素材按登录用户隔离；工作台内置新手教程。

## 重要说明

这是学习工具，不隶属于 ETS。模型评分及总分都是练习估计，不是 ETS 官方评分、换算或正式成绩。模型输出可能有误。

共享故事是回答练习素材，不代表使用者的真实经历。推荐回答会优先使用原答案中明确的个人事实；共享故事用作第三人称或假设性例子。

## 技术与运行边界

- React / TypeScript / Vinext（Next.js API 兼容），Cloudflare Workers 运行时。
- Cloudflare D1 保存结构化记录，R2 保存截图和回答录音。
- Sites 托管环境提供 Sign in with ChatGPT 与可信的用户身份头。
- 模型调用走服务端 `https://api.ztoken.pro/v1`，API 密钥以 AES-GCM 加密后保存。

**GitHub 存放源码，不承担本项目的后端运行。GitHub Pages 无法单独运行完整平台。** 当前支持的托管方案是 Sites。普通 Cloudflare Workers 不会自动提供 Sites 的身份认证；不可直接把仅信任身份头的代码作为未经保护的公网 Worker 部署。

## 本地启动

需要 Node.js 22.13+（建议 Node.js 24）、npm、Git。

```bash
git clone https://github.com/Lina-0209/toefl-speaking-studio.git
cd toefl-speaking-studio
npm ci
```

1. 复制 `.env.example` 为 `.dev.vars`。
2. 运行 `node scripts/generate-encryption-key.mjs` 生成 32 字节加密密钥，在自己的 `.dev.vars` 中填写 `ZTOKEN_ENCRYPTION_KEY`；不要提交该文件。
3. 构建并初始化本地数据库：

```bash
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_broken_sharon_ventura.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_cheerful_layla_miller.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_overjoyed_molecule_man.sql
npm run dev
```

打开终端输出的本地 URL，通过 `/signin-with-chatgpt?return_to=/` 进入本地测试身份。在「API 设置」保存自己的 ztoken 密钥及账户可用的模型名称。仅本地回环开发环境会模拟登录；生产构建不包含模拟登录。

## 检查

```bash
npm run typecheck
npm test
npm run build
npm run verify:public
```

测试使用真实应用路由、SQLite 内存数据库及内存文件存储，验证匿名访问拒绝、跨用户练习访问拒绝、密钥加密与隔离、个人素材隔离和共享库回退、跨站写入拒绝、推荐回答的素材选择。测试替代了托管平台的身份注入，并模拟模型响应；不等同于生产登录或真实模型调用的端到端验证。

## 部署与使用

- [Sites 部署说明](docs/DEPLOYMENT.md)
- [用户操作说明](docs/USER_GUIDE.md)
- [数据处理说明](docs/PRIVACY.md)
- [安全问题反馈](SECURITY.md)

需要把 `.openai/hosting.json` 注册为**你自己的新站点**。仓库故意不带作者私人站点的 project ID，也不携带任何运行时密钥。

## 目录

```text
app/                  工作台、教程、素材编辑器及 API 路由
lib/evaluate.ts       图像识别、直接音频评分、总分练习估计
lib/recommend.ts      基于原回答和当前素材库的推荐回答
lib/study-material.json  作者共享素材（非用户上传内容）
lib/material-store.ts 按用户保存的个人素材与共享库回退
db/、drizzle/         数据库 schema 和迁移
tests/                权限、密钥和素材流程测试
```

## 参考资源

- [ETS 口语评分细则](https://www.ets.org/content/dam/ets-org/pdfs/toefl/speaking-rubrics.pdf)
- [ETS 口语能力等级及评分样例](https://www.ets.org/content/dam/ets-org/pdfs/toefl/speaking-performance-levels.pdf)
- [ETS 成绩说明](https://www.ets.org/toefl/test-takers/ibt/scores/understand-scores.html)

ETS 参考录音运行时从 ETS 的公开地址获取，不随本仓库分发。下载可用性由该上游服务决定。

## 许可证

本项目原创代码与作者明确共享的背诵素材按 [MIT License](LICENSE) 提供。第三方依赖、附带的第三方代码以及 ETS 资源遵循各自的许可与权利声明；保留的第三方许可见相应目录。
