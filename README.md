# AboutGenerator

AboutGenerator 是一款iOS关于本机界面生成器。你可以编辑预览中的设备信息、滚动页面，并将预览画面保存为 PNG。

## 运行

安装 Python 3.10 或更新版本，在 Windows 上双击 `run.bat`。首次运行会安装 `requirements.txt` 中的 PySide6；之后应用本身不需要联网。截屏按钮只保存预览框内的画面。

## 与原版演示的素材区别

这份公开版不包含下列原版演示所用素材：

| 原版演示素材 | 原版用途 | 替代方式 |
| --- | --- | --- |
| `ui/fonts/SF-Pro-Text-*.otf`、`ui/fonts/PingFangSC-*.woff2` | 英文和中文字体 | Windows 系统字体 |
| `ui/assets/AppleStatusBar.svg`、`ui/assets/status-*.svg` | 从 Apple 设计资源取得的状态栏图形 | CSS 绘制的通用状态图标与文字 |
| `ui/assets/iphone-18-pro-max-silver.png` | 手机预览边框图片 | CSS 绘制的简化边框 |

要得到原版演示的视觉效果，需要上述素材（含素材的版本可在发行页面获取）。请先确认你对相关素材具有适用于目标平台、用途及分发方式的授权。公开版无需这些文件也能运行，预览和导出功能均可使用。原版截图和个人设备信息也未包含在本仓库中。

## 效果

<img width="990" height="2151" alt="Snapshot-iPhone-18-Pro-Max" src="https://github.com/user-attachments/assets/7746574f-1e2f-427d-92ae-f391c39659db" />
