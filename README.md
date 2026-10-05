# AboutGenerator

AboutGenerator 是一款独立制作的 Windows「关于本机」界面生成器。你可以编辑预览中的设备信息、滚动页面，并将预览画面保存为 PNG。软件与 Apple Inc. 无隶属、合作或赞助关系，也不代表获得 Apple Inc. 认可。

## 运行

安装 Python 3.10 或更新版本，在 Windows 上双击 `run.bat`。首次运行会安装 `requirements.txt` 中的 PySide6；之后应用本身不需要联网。截屏按钮只保存预览框内的画面。

## 与原版演示的素材区别

这份公开版**不包含，也不依赖**下列原版演示所用素材：

| 原版演示素材 | 原版用途 | 公开版替代方式 |
| --- | --- | --- |
| `ui/fonts/SF-Pro-Text-*.otf`、`ui/fonts/PingFangSC-*.woff2` | 英文和中文字体 | Windows 系统字体 |
| `ui/assets/AppleStatusBar.svg`、`ui/assets/status-*.svg` | 从 Apple 设计资源取得的状态栏图形 | CSS 绘制的通用状态图标与文字 |
| `ui/assets/iphone-18-pro-max-silver.png` | 手机预览边框图片 | CSS 绘制的简化边框 |

要得到原版演示的视觉效果，需要上述素材；它们**未随本仓库提供**。请先确认你对相关素材具有适用于目标平台、用途及分发方式的授权。公开版无需这些文件也能运行，预览和导出功能均可使用。原版截图和个人设备信息也未包含在本仓库中。

素材使用限制请查阅 [Apple 字体资料](https://developer.apple.com/documentation/technologyoverviews/fonts)和 [Apple 设计资源许可](https://developer.apple.com/support/downloads/terms/apple-design-resources/Apple-Design-Resources-License-20230621-English.pdf)。README 中的说明不构成对这些素材的再授权。

公开版的版本详情页使用自行编写的演示说明，不代表真实系统更新日志。默认序列号是占位符；无线局域网地址、蓝牙地址、IMEI、ICCID 和 SEID 在本机随机生成。手动填写真实标识后，导出的图片会包含所填内容。

## 许可与商标

本仓库中的原创代码与自制图标按 [MIT License](LICENSE) 发布。Apple 和 iPhone 是 Apple Inc. 的商标；其他商标归各自权利人所有。本项目不提供 Apple 字体、官方设计资源或其再分发许可。
