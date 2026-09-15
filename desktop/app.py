"""
Desktop Weather Map Translator (Tkinter, offline).

Wraps the pure Pillow logic in backend/map_translator.remaster_map with a
native window: pick a weather map image, choose the target month/year,
preview before/after, and save the translated JPEG.

No FastAPI, Streamlit, or network connection is required — the processing
function is imported directly. Only stdlib (tkinter) + Pillow are used.

Run:            python desktop/app.py      (or desktop\\run.bat)
Package .exe:   pyinstaller --onefile --noconsole desktop/app.py
"""

from __future__ import annotations

import io
import os
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from PIL import Image, ImageTk

# Import the shared Pillow logic no matter where this script is launched from.
BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend")
sys.path.insert(0, BACKEND_DIR)

from map_translator import remaster_map  # noqa: E402

MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
          "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"]
FILETYPES = [("Image files", "*.jpg *.jpeg *.png *.bmp *.webp"), ("All files", "*.*")]
PREVIEW_MAX = (600, 540)  # thumbnails are scaled down to fit inside this box


class WeatherMapTranslatorApp:
    """Tkinter window around remaster_map()."""

    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        root.title("Weather Map Translator — Desktop")
        root.minsize(1060, 720)

        self.image_bytes: bytes | None = None
        self.result_bytes: bytes | None = None
        self.current_path: str = ""
        self._busy = False
        self._photo_before: ImageTk.PhotoImage | None = None
        self._photo_after: ImageTk.PhotoImage | None = None

        self._build_toolbar()
        self._build_previews()
        self._build_statusbar()

    # ---------------------------------------------------------------- UI ----
    def _build_toolbar(self) -> None:
        bar = ttk.Frame(self.root, padding=8)
        bar.pack(side=tk.TOP, fill=tk.X)

        ttk.Button(bar, text="Pilih gambar…", command=self._pick_image).pack(side=tk.LEFT)
        self.file_label = ttk.Label(bar, text="(belum ada file)", width=44)
        self.file_label.pack(side=tk.LEFT, padx=8)

        ttk.Label(bar, text="Bulan:").pack(side=tk.LEFT, padx=(16, 4))
        self.month_var = tk.StringVar(value=MONTHS[0])
        ttk.Combobox(bar, textvariable=self.month_var, values=MONTHS,
                     state="readonly", width=11).pack(side=tk.LEFT)

        ttk.Label(bar, text="Tahun:").pack(side=tk.LEFT, padx=(16, 4))
        self.year_var = tk.StringVar(value="2026")
        ttk.Entry(bar, textvariable=self.year_var, width=7).pack(side=tk.LEFT)

        self.translate_btn = ttk.Button(bar, text="Translate", command=self._on_translate,
                                        state=tk.DISABLED)
        self.translate_btn.pack(side=tk.LEFT, padx=(20, 8))
        self.save_btn = ttk.Button(bar, text="Simpan hasil…", command=self._on_save,
                                   state=tk.DISABLED)
        self.save_btn.pack(side=tk.LEFT)

    def _build_previews(self) -> None:
        container = ttk.Frame(self.root, padding=(8, 0))
        container.pack(side=tk.TOP, fill=tk.BOTH, expand=True)
        container.columnconfigure(0, weight=1)
        container.columnconfigure(1, weight=1)
        container.rowconfigure(0, weight=1)

        self.before_canvas = self._preview_pane(container, "Original", 0)
        self.after_canvas = self._preview_pane(container, "Translated", 1)

    def _preview_pane(self, container: ttk.Frame, title: str, column: int) -> tk.Canvas:
        frame = ttk.LabelFrame(container, text=title, padding=6)
        frame.grid(row=0, column=column, sticky="nsew", padx=4, pady=4)
        frame.rowconfigure(0, weight=1)
        frame.columnconfigure(0, weight=1)

        scroll = ttk.Scrollbar(frame, orient=tk.VERTICAL)
        scroll.grid(row=0, column=1, sticky="ns")
        canvas = tk.Canvas(frame, highlightthickness=0, background="#fafafa",
                           yscrollcommand=scroll.set)
        canvas.grid(row=0, column=0, sticky="nsew")
        scroll.config(command=canvas.yview)
        canvas.create_text(300, 260, text="—", fill="#aaaaaa", font=("Segoe UI", 14))
        return canvas

    def _build_statusbar(self) -> None:
        self.status_var = tk.StringVar(value="Pilih gambar peta cuaca untuk memulai.")
        ttk.Label(self.root, textvariable=self.status_var, relief=tk.SUNKEN,
                  anchor="w", padding=(8, 4)).pack(side=tk.BOTTOM, fill=tk.X)

    def _show_preview(self, canvas: tk.Canvas, data: bytes | None,
                      photo_attr: str) -> None:
        canvas.delete("all")
        setattr(self, photo_attr, None)
        if not data:
            canvas.create_text(300, 260, text="—", fill="#aaaaaa", font=("Segoe UI", 14))
            return
        img = Image.open(io.BytesIO(data))
        img.thumbnail(PREVIEW_MAX)
        photo = ImageTk.PhotoImage(img)
        setattr(self, photo_attr, photo)  # keep a reference (GC otherwise drops it)
        canvas.create_image(6, 6, image=photo, anchor="nw")
        canvas.configure(scrollregion=(0, 0, img.width + 12, img.height + 12))

# ------------------------------------------------------------ actions ----
    def _pick_image(self) -> None:
        path = filedialog.askopenfilename(title="Pilih peta cuaca", filetypes=FILETYPES)
        if not path:
            return
        try:
            with open(path, "rb") as fh:
                self.image_bytes = fh.read()
        except OSError as exc:
            messagebox.showerror("Gagal membaca file", str(exc))
            return

        self.current_path = path
        self.result_bytes = None
        self.file_label.config(text=f"{os.path.basename(path)} "
                                    f"({len(self.image_bytes):,} bytes)")
        self._show_preview(self.before_canvas, self.image_bytes, "_photo_before")
        self._show_preview(self.after_canvas, None, "_photo_after")
        self.translate_btn.config(state=tk.NORMAL)
        self.save_btn.config(state=tk.DISABLED)
        self.status_var.set("Gambar dimuat. Pilih bulan/tahun lalu klik Translate.")

    def _on_translate(self) -> None:
        if self._busy or self.image_bytes is None:
            return
        year = self.year_var.get().strip()
        if not year.isdigit():
            messagebox.showwarning("Tahun tidak valid", "Tahun harus angka, mis. 2026.")
            return

        self._busy = True
        self.translate_btn.config(state=tk.DISABLED, text="Memproses…")
        self.status_var.set("Memproses gambar…")
        month = self.month_var.get()
        raw = self.image_bytes

        def worker() -> None:
            try:
                out, err = remaster_map(raw, month, year), ""
            except Exception as exc:  # surface any processing failure in the UI
                out, err = None, f"Gagal memproses gambar: {exc}"
            self.root.after(0, lambda: self._translate_done(out, err))

        threading.Thread(target=worker, daemon=True).start()

    def _translate_done(self, out: bytes | None, err: str) -> None:
        self._busy = False
        self.translate_btn.config(state=tk.NORMAL, text="Translate")
        if err:
            messagebox.showerror("Error", err)
            self.status_var.set("Gagal memproses gambar.")
            return
        self.result_bytes = out
        self._show_preview(self.after_canvas, out, "_photo_after")
        self.save_btn.config(state=tk.NORMAL)
        self.status_var.set(f"Selesai ({len(out):,} bytes). "
                            "Klik 'Simpan hasil…' untuk menyimpan JPEG.")

    def _on_save(self) -> None:
        if not self.result_bytes:
            return
        base = os.path.splitext(os.path.basename(self.current_path or "map"))[0]
        path = filedialog.asksaveasfilename(
            title="Simpan peta hasil translate",
            defaultextension=".jpg",
            initialfile=f"{base}_translated.jpg",
            filetypes=[("JPEG image", "*.jpg")],
        )
        if not path:
            return
        try:
            with open(path, "wb") as fh:
                fh.write(self.result_bytes)
        except OSError as exc:
            messagebox.showerror("Gagal menyimpan", str(exc))
            return
        self.status_var.set(f"Tersimpan: {path}")


def main() -> None:
    root = tk.Tk()
    WeatherMapTranslatorApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
