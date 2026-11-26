抽取创作灵感卡、转动带权选择转盘，或掷一组可复现的多面骰。

- 已验证 DeepSeek Harness 0.2.2-rc.2。
- 17 项自动化测试通过；三个趣味插件一起安装后，11 个原生工具均成功注册，代表性操作已在真实 Harness 中调用通过。
- 无需额外 API Key，无需 npm 账号。

桌面版先完全退出 Harness，再安装：

```sh
dsh plugin --profile desktop add "https://github.com/qinghuidaqzp/dsh-idea-dice/releases/download/v0.1.0/dsh-idea-dice-0.1.0.tgz"
```

Web 版将 `desktop` 改为 `web`。完整说明见 [README](https://github.com/qinghuidaqzp/dsh-idea-dice#readme)。

所有计算在本地完成。种子用于复现结果；随机选择不代表对选项优劣的评价。

附件包含预构建安装包和 SHA-256 校验文件。
