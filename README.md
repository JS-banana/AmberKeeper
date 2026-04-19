# AmberKeeper

<p align="center">
  <strong>让 AI 的灵光，凝成琥珀</strong>
</p>

<p align="center">
  一个只为「留住你和 AI 的每一次对话」而生的桌面工作台。
</p>

---

## 为什么是 AmberKeeper

AI 时代每天都在发生这样的事：你深夜和 ChatGPT 聊通了一个想法，第二天想找回那段对话，却被淹没在几百个标题雷同的会话里；你在 Claude 里让它帮你梳理过一份思考框架，半年后只记得「好像有过」；你换了台电脑、换了个账号，几百小时的对话就这样散落在各家厂商的服务器深处，搜不到，也带不走。

这些对话，其实是你这几年思想的真实切片。

AmberKeeper 做的事很简单——**让这些对话变成你自己的资产**。

- **你还是用官方网页聊天**：用你自己的账号、自己的订阅，ChatGPT Plus 就是 Plus，Claude Pro 就是 Pro，该有的模型、该有的能力一个都不少。
- **不走 API、不计费**：你不会因为「多开一个客户端」而多花一分钱，AmberKeeper 不是 API 代理，它就是个加了记忆的浏览器外壳。
- **对话自动沉淀到本地**：在你聊天的同时，AmberKeeper 默默把每一轮问答抓下来，存在你自己的电脑上，按人、按主题、按时间整理好。
- **未来你可以回看、检索、总结**：这些沉淀下来的对话不是死文件——它是未来做统计、做总结、做个人知识库的原料。

## 名字的由来

**Amber（琥珀）** 是树脂的结晶。一滴松脂偶然落下，裹住一只虫子、一片叶子、一缕空气，然后在地底沉睡上千万年，再被挖出来时依然晶莹剔透，连被封存那一刻的光都还在。

**Keeper** 是留存的人，守住那些本来会流走的东西。

把这两个词放在一起——我们想做的事就很清楚了：把你和 AI 之间那些转瞬即逝的灵光，凝成可以跨越很多年的琥珀。

## 现在支持哪些 AI

打开 AmberKeeper，你可以在同一个窗口里自由切换：

- ChatGPT
- Claude
- Gemini
- DeepSeek
- Grok
- Kimi
- 通义千问
- 豆包
- 小米 AI Studio

这些对话都会被自动归档。

如果你还有其他常用的 AI 服务，也可以把它作为「自定义服务」添加进来——不参与自动采集，但可以作为你日常聊天的统一入口。

## 设计上的几个坚持

- **本地优先**：你的对话留在你自己的硬盘上，不上传、不同步到我们这边。AmberKeeper 没有后端服务器会知道你今天和 AI 聊了什么。
- **官方环境**：不做改造、不注入花哨功能，AI 站点在 AmberKeeper 里的样子，和你在 Chrome 里打开它的样子一致。我们只是安静地在旁边做记录。
- **克制**：AmberKeeper 不会试图成为「更好的 ChatGPT UI」。让官方的归官方，我们做好留存这一件事。

## 现在能用吗

可以。当前版本已经可以：

- 同时管理多个 AI 站点的登录状态
- 自动抓取并持久化你的对话
- 在本地工作台里浏览、筛选已归档的数据

后续会持续打磨：更顺手的检索、更细粒度的标签、对长对话的摘要与可视化，以及——随着沉淀的对话越来越多——让这些历史真正开始为你「工作」起来的能力。

---

## 给开发者

如果你是想参与开发或者想本地跑起来看看的朋友：

```bash
pnpm install
pnpm desktop:dev
```

架构、代码边界、provider 扩展方式、持久化契约等工程细节，都收在 `docs/` 里：

- 架构总览：[`docs/architecture/amberkeeper-overview.md`](docs/architecture/amberkeeper-overview.md)
- 领域模型：[`docs/architecture/domain-model.md`](docs/architecture/domain-model.md)
- 持久化契约：[`docs/architecture/persistence-contracts.md`](docs/architecture/persistence-contracts.md)
- 运行时生命周期：[`docs/architecture/runtime-lifecycle.md`](docs/architecture/runtime-lifecycle.md)
- 工程边界规则：[`docs/engineering/boundary-rules.md`](docs/engineering/boundary-rules.md)

项目当前由 `anyChat` 的 Electron 主线拆分独立而来，作为 AmberKeeper 的正式主仓继续演进。

---

<p align="center">
  <sub>每一抹灵光，皆有所归。</sub>
</p>
