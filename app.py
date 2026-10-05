"""AboutGenerator: a local Windows host for an editable iPhone About screen."""

from __future__ import annotations

import argparse
import base64
import ctypes
import json
import sys
from pathlib import Path

from PySide6.QtCore import QBuffer, QIODevice, QObject, QStandardPaths, Qt, QTimer, QUrl, Slot
from PySide6.QtGui import QColor, QIcon
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineCore import QWebEngineProfile
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication, QFileDialog, QMainWindow


BASE_DIR = Path(__file__).resolve().parent
EXPORT_WIDTH = 1320
EXPORT_HEIGHT = 2868
PHONE_CSS_WIDTH = 430


class WindowBridge(QObject):
    def __init__(self, window: QMainWindow, view: QWebEngineView) -> None:
        super().__init__()
        self.window = window
        self.view = view
        self.capture_pending = False
        self.drag_origin: tuple[int, int] | None = None
        self.window_origin: tuple[int, int] | None = None
        self.export_view: QWebEngineView | None = None
        self.test_export_path: Path | None = None
        self.phone_backdrop_view: QWebEngineView | None = None
        self.phone_backdrop_ready = False
        self.phone_backdrop_busy = False
        self.phone_backdrop_pending: dict | None = None
        self.phone_backdrop_attempts = 0

    @staticmethod
    def _capture_is_black(image) -> bool:
        if image.isNull():
            return True
        bitmap = image.toImage()
        for x, y in ((0.08, 0.08), (0.5, 0.5), (0.92, 0.92)):
            color = bitmap.pixelColor(int((bitmap.width() - 1) * x), int((bitmap.height() - 1) * y))
            if max(color.red(), color.green(), color.blue()) > 24:
                return False
        return True

    @Slot()
    def requestBackdrop(self) -> None:
        if self.capture_pending:
            return
        self.capture_pending = True
        self.view.page().runJavaScript(
            "document.documentElement.classList.add('capture-mode'); document.documentElement.offsetWidth",
            lambda _: QTimer.singleShot(180, self._capture_backdrop),
        )

    def _capture_backdrop(self) -> None:
        buffer = QBuffer()
        buffer.open(QIODevice.OpenModeFlag.WriteOnly)
        captured = self.view.grab()
        captured.save(buffer, "PNG")
        encoded = base64.b64encode(bytes(buffer.data())).decode("ascii")
        self.view.page().runJavaScript("document.documentElement.classList.remove('capture-mode')")
        self.view.page().runJavaScript(
            f"window.LiquidGlass.receiveBackdrop({json.dumps('data:image/png;base64,' + encoded)})"
        )
        self.capture_pending = False

    @Slot(str)
    def requestPhoneBackdrop(self, payload: str) -> None:
        try:
            state = json.loads(payload)
            if not isinstance(state, dict) or not isinstance(state.get("data"), dict):
                return
        except (TypeError, json.JSONDecodeError):
            return
        self.phone_backdrop_pending = state
        if self.phone_backdrop_view is None:
            backdrop_view = QWebEngineView()
            self.phone_backdrop_view = backdrop_view
            backdrop_view.setAttribute(Qt.WidgetAttribute.WA_DontShowOnScreen, True)
            backdrop_view.setAttribute(Qt.WidgetAttribute.WA_QuitOnClose, False)
            backdrop_view.resize(860, 1870)
            backdrop_view.setZoomFactor(2.0)
            backdrop_view.page().setBackgroundColor(QColor("#f2f2f7"))

            def loaded(ok: bool) -> None:
                self.phone_backdrop_ready = ok
                if ok:
                    self._start_phone_backdrop()

            backdrop_view.loadFinished.connect(loaded)
            backdrop_view.load(QUrl.fromLocalFile(str(BASE_DIR / "ui" / "phone.html")))
            backdrop_view.show()
        elif self.phone_backdrop_ready and not self.phone_backdrop_busy:
            self._start_phone_backdrop()

    def _start_phone_backdrop(self) -> None:
        if self.phone_backdrop_busy or self.phone_backdrop_pending is None or self.phone_backdrop_view is None:
            return
        state = self.phone_backdrop_pending
        self.phone_backdrop_pending = None
        self.phone_backdrop_busy = True
        self.phone_backdrop_attempts = 0
        script = (
            "document.documentElement.classList.add('glass-capture-mode');"
            f"window.AboutPhone.applyExportState({json.dumps(state, ensure_ascii=False)});"
        )
        self.phone_backdrop_view.page().runJavaScript(
            script, lambda _: QTimer.singleShot(240, self._capture_phone_backdrop)
        )

    def _capture_phone_backdrop(self) -> None:
        if self.phone_backdrop_view is None:
            self.phone_backdrop_busy = False
            return
        image = self.phone_backdrop_view.grab()
        if self._capture_is_black(image) and self.phone_backdrop_attempts < 8:
            self.phone_backdrop_attempts += 1
            QTimer.singleShot(140, self._capture_phone_backdrop)
            return
        if not self._capture_is_black(image):
            buffer = QBuffer()
            buffer.open(QIODevice.OpenModeFlag.WriteOnly)
            image.save(buffer, "PNG")
            encoded = base64.b64encode(bytes(buffer.data())).decode("ascii")
            self.view.page().runJavaScript(
                "document.querySelector('#phone-frame')?.contentWindow?.PhoneGlass?.receiveBackdrop("
                f"{json.dumps('data:image/png;base64,' + encoded)})"
            )
        self.phone_backdrop_busy = False
        if self.phone_backdrop_pending is not None:
            self._start_phone_backdrop()

    @Slot(str)
    def exportPhone(self, payload: str) -> None:
        if self.export_view is not None:
            return
        if self.test_export_path is None:
            pictures = Path(QStandardPaths.writableLocation(QStandardPaths.StandardLocation.PicturesLocation))
            suggested = pictures / "关于本机.png"
            selected, _ = QFileDialog.getSaveFileName(
                self.window, "保存 iPhone 截图", str(suggested), "PNG 图片 (*.png)"
            )
            if not selected:
                return
            destination = Path(selected).with_suffix(".png")
        else:
            destination = self.test_export_path
        try:
            state = json.loads(payload)
            if not isinstance(state, dict) or not isinstance(state.get("data"), dict):
                raise ValueError("Invalid export state")
        except (json.JSONDecodeError, ValueError):
            self._tell_page("截图数据无效")
            return
        destination.parent.mkdir(parents=True, exist_ok=True)
        self._render_phone(destination, state)

    def _render_phone(self, destination: Path, state: dict) -> None:
        export_view = QWebEngineView()
        self.export_view = export_view
        export_view.setAttribute(Qt.WidgetAttribute.WA_DontShowOnScreen, True)
        export_view.resize(EXPORT_WIDTH, EXPORT_HEIGHT)
        export_view.setZoomFactor(EXPORT_WIDTH / PHONE_CSS_WIDTH)
        export_view.page().setBackgroundColor(QColor("#f2f2f7"))
        attempts = {"backdrop": 0, "final": 0}

        def loaded(ok: bool) -> None:
            if not ok:
                self._finish_export(None)
                return
            script = (
                "document.documentElement.classList.add('glass-capture-mode');"
                f"window.AboutPhone.applyExportState({json.dumps(state, ensure_ascii=False)});"
            )
            export_view.page().runJavaScript(script, lambda _: QTimer.singleShot(300, capture_backdrop))

        def capture_backdrop() -> None:
            if self.export_view is None:
                return
            image = export_view.grab()
            if self._capture_is_black(image) and attempts["backdrop"] < 10:
                attempts["backdrop"] += 1
                QTimer.singleShot(150, capture_backdrop)
                return
            if self._capture_is_black(image):
                self._finish_export(None)
                return
            buffer = QBuffer()
            buffer.open(QIODevice.OpenModeFlag.WriteOnly)
            image.save(buffer, "PNG")
            encoded = base64.b64encode(bytes(buffer.data())).decode("ascii")
            export_view.page().runJavaScript(
                "document.documentElement.classList.remove('glass-capture-mode');"
                f"window.PhoneGlass.receiveBackdrop({json.dumps('data:image/png;base64,' + encoded)});",
                lambda _: QTimer.singleShot(320, capture),
            )

        def capture() -> None:
            if self.export_view is None:
                return
            image = export_view.grab()
            if self._capture_is_black(image) and attempts["final"] < 10:
                attempts["final"] += 1
                QTimer.singleShot(150, capture)
                return
            success = not self._capture_is_black(image) and image.save(str(destination), "PNG")
            self._finish_export(destination if success else None)

        export_view.loadFinished.connect(loaded)
        export_view.load(QUrl.fromLocalFile(str(BASE_DIR / "ui" / "phone.html")))
        export_view.show()

    def _finish_export(self, destination: Path | None) -> None:
        if self.export_view is not None:
            self.export_view.close()
            self.export_view.deleteLater()
            self.export_view = None
        if destination is None:
            self._tell_page("截图保存失败")
        else:
            self._tell_page(f"已保存：{destination}")
            if self.test_export_path is not None:
                QApplication.instance().quit()

    def _tell_page(self, message: str) -> None:
        self.view.page().runJavaScript(f"window.AboutStudio?.showToast({json.dumps(message)})")

    @Slot(str)
    def copyText(self, value: str) -> None:
        QApplication.clipboard().setText(value)

    @Slot()
    def minimize(self) -> None:
        self.window.showMinimized()

    @Slot()
    def maximize(self) -> None:
        self.window.showNormal() if self.window.isMaximized() else self.window.showMaximized()

    @Slot()
    def close(self) -> None:
        if self.phone_backdrop_view is not None:
            self.phone_backdrop_view.close()
        self.window.close()

    @Slot(int, int)
    def startDrag(self, x: int, y: int) -> None:
        self.drag_origin = (x, y)
        position = self.window.pos()
        self.window_origin = (position.x(), position.y())

    @Slot(int, int)
    def dragTo(self, x: int, y: int) -> None:
        if self.drag_origin is None or self.window_origin is None or self.window.isMaximized():
            return
        self.window.move(self.window_origin[0] + x - self.drag_origin[0],
                         self.window_origin[1] + y - self.drag_origin[1])

    @Slot()
    def endDrag(self) -> None:
        self.drag_origin = None
        self.window_origin = None


def use_rounded_corners(window: QMainWindow) -> None:
    if sys.platform != "win32":
        return
    try:
        preference = ctypes.c_int(2)
        ctypes.windll.dwmapi.DwmSetWindowAttribute(
            int(window.winId()), 33, ctypes.byref(preference), ctypes.sizeof(preference)
        )
    except (AttributeError, OSError):
        pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--screenshot", type=Path, help="Save a desktop preview and exit")
    parser.add_argument("--export-test", type=Path, help="Save the phone screen without opening a dialog")
    args = parser.parse_args()

    app = QApplication(sys.argv)
    app.setApplicationName("AboutGenerator")
    app.setOrganizationName("AboutGenerator")
    app.setWindowIcon(QIcon(str(BASE_DIR / "icon.png")))

    window = QMainWindow()
    window.setWindowTitle("AboutGenerator · 关于本机生成器")
    window.setWindowFlags(Qt.WindowType.Window | Qt.WindowType.FramelessWindowHint)
    window.setMinimumSize(1180, 740)
    window.resize(1510, 910)

    profile = QWebEngineProfile("AboutGenerator", window)
    storage = Path(QStandardPaths.writableLocation(QStandardPaths.StandardLocation.AppDataLocation)) / "web"
    profile.setPersistentStoragePath(str(storage))
    profile.setCachePath(str(storage / "cache"))
    view = QWebEngineView(profile, window)
    view.page().setBackgroundColor(QColor("#ffffff"))
    window.setCentralWidget(view)

    channel = QWebChannel(view.page())
    bridge = WindowBridge(window, view)
    channel.registerObject("windowBridge", bridge)
    view.page().setWebChannel(channel)
    view.load(QUrl.fromLocalFile(str(BASE_DIR / "ui" / "index.html")))
    window.show()
    use_rounded_corners(window)

    if args.screenshot:
        destination = args.screenshot.resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        preview_attempts = {"count": 0}

        def capture_preview() -> None:
            def save_when_ready(ready: bool) -> None:
                preview_attempts["count"] += 1
                if not ready and preview_attempts["count"] < 60:
                    QTimer.singleShot(150, capture_preview)
                    return
                view.grab().save(str(destination), "PNG")
                print(destination)
                app.quit()

            view.page().runJavaScript(
                "document.documentElement.classList.contains('shader-ready') && "
                "!document.documentElement.classList.contains('capture-mode')",
                save_when_ready,
            )

        QTimer.singleShot(4400, capture_preview)
    elif args.export_test:
        bridge.test_export_path = args.export_test.resolve()

        def start_export() -> None:
            view.page().runJavaScript(
                "window.AboutStudio?.getExportPayload()",
                lambda payload: bridge.exportPhone(payload) if payload else app.quit(),
            )

        QTimer.singleShot(3300, start_export)

    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
