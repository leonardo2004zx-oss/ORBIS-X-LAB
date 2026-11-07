"""Basic Tkinter GUI (Windows/Linux).  Runs the packer in a worker thread."""

from __future__ import annotations

import os
import queue
import threading
import time


def run_gui() -> int:
    try:
        import tkinter as tk
        from tkinter import filedialog, messagebox, ttk
    except ImportError:
        print("Tkinter no está instalado (en Linux: sudo apt install python3-tk). "
              "Usa la CLI: ps4zstdforge.py --input ... --output ...")
        return 1

    from .cli import duration, human
    from .packer import pack
    from .sfo import find_game_root, read_game_info
    from .verify import verify

    root = tk.Tk()
    root.title("PS4 ZSTD Forge")
    root.minsize(640, 520)
    msgs: "queue.Queue[tuple]" = queue.Queue()
    cancel_flag = threading.Event()

    v_in = tk.StringVar()
    v_out = tk.StringVar()
    v_level = tk.IntVar(value=22)
    v_threads = tk.IntVar(value=os.cpu_count() or 1)
    v_frame = tk.StringVar(value="2 MiB")
    v_verify = tk.StringVar(value="quick")
    v_status = tk.StringVar(value="Elige la carpeta del juego (CUSAxxxxx).")
    v_game = tk.StringVar(value="—")

    frm = ttk.Frame(root, padding=12)
    frm.pack(fill="both", expand=True)
    frm.columnconfigure(1, weight=1)

    def pick_in():
        d = filedialog.askdirectory(title="Carpeta del juego (CUSAxxxxx)")
        if d:
            v_in.set(d)
            g = read_game_info(find_game_root(d))
            v_game.set(" · ".join(x for x in (g.title_id, g.title, g.app_ver and f"v{g.app_ver}",
                                               g.firmware and f"FW {g.firmware}+") if x)
                       or "Sin param.sfo")

    def pick_out():
        d = filedialog.askdirectory(title="Carpeta de destino")
        if d:
            v_out.set(d)

    r = 0
    ttk.Label(frm, text="Juego:").grid(row=r, column=0, sticky="w")
    ttk.Entry(frm, textvariable=v_in).grid(row=r, column=1, sticky="ew", padx=6)
    ttk.Button(frm, text="Elegir…", command=pick_in).grid(row=r, column=2)
    r += 1
    ttk.Label(frm, textvariable=v_game, foreground="#555").grid(row=r, column=1, sticky="w", padx=6)
    r += 1
    ttk.Label(frm, text="Destino:").grid(row=r, column=0, sticky="w", pady=(8, 0))
    ttk.Entry(frm, textvariable=v_out).grid(row=r, column=1, sticky="ew", padx=6, pady=(8, 0))
    ttk.Button(frm, text="Elegir…", command=pick_out).grid(row=r, column=2, pady=(8, 0))
    r += 1

    opts = ttk.LabelFrame(frm, text="Compresión zstd", padding=8)
    opts.grid(row=r, column=0, columnspan=3, sticky="ew", pady=10)
    ttk.Label(opts, text="Nivel").grid(row=0, column=0, sticky="w")
    lvl_lbl = ttk.Label(opts, text="22 (Máximo)")
    scale = ttk.Scale(opts, from_=1, to=22, orient="horizontal",
                      command=lambda v: (v_level.set(int(float(v))),
                                         lvl_lbl.config(text=f"{int(float(v))}"
                                                        + (" (Máximo)" if int(float(v)) == 22 else ""))))
    scale.set(22)
    scale.grid(row=0, column=1, sticky="ew", padx=6)
    lvl_lbl.grid(row=0, column=2, sticky="w")
    opts.columnconfigure(1, weight=1)
    ttk.Label(opts, text="Hilos").grid(row=1, column=0, sticky="w", pady=4)
    ttk.Spinbox(opts, from_=1, to=256, textvariable=v_threads, width=6).grid(row=1, column=1, sticky="w", padx=6)
    ttk.Label(opts, text="Trama").grid(row=2, column=0, sticky="w")
    ttk.Combobox(opts, textvariable=v_frame, width=10, state="readonly",
                 values=("512 KiB", "1 MiB", "2 MiB", "4 MiB", "8 MiB", "16 MiB")).grid(
        row=2, column=1, sticky="w", padx=6)
    ttk.Label(opts, text="Verificación").grid(row=3, column=0, sticky="w", pady=4)
    vb = ttk.Frame(opts)
    vb.grid(row=3, column=1, sticky="w", padx=6)
    for val, txt in (("quick", "Rápida"), ("full", "Completa"), ("none", "Ninguna")):
        ttk.Radiobutton(vb, text=txt, value=val, variable=v_verify).pack(side="left", padx=(0, 8))
    r += 1

    pb = ttk.Progressbar(frm, maximum=1000)
    pb.grid(row=r, column=0, columnspan=3, sticky="ew")
    r += 1
    ttk.Label(frm, textvariable=v_status).grid(row=r, column=0, columnspan=3, sticky="w", pady=4)
    r += 1
    log = tk.Text(frm, height=12, wrap="word", state="disabled")
    log.grid(row=r, column=0, columnspan=3, sticky="nsew", pady=(4, 8))
    frm.rowconfigure(r, weight=1)
    r += 1
    btns = ttk.Frame(frm)
    btns.grid(row=r, column=0, columnspan=3, sticky="e")
    b_start = ttk.Button(btns, text="Empaquetar")
    b_cancel = ttk.Button(btns, text="Cancelar", state="disabled", command=cancel_flag.set)
    b_cancel.pack(side="right", padx=4)
    b_start.pack(side="right")

    def write_log(text):
        log.config(state="normal")
        log.insert("end", text + "\n")
        log.see("end")
        log.config(state="disabled")

    def worker(params):
        t0 = time.time()

        def progress(done, total, comp):
            msgs.put(("progress", done, total, comp, t0))

        try:
            st = pack(log=lambda s: msgs.put(("log", s)), progress=progress,
                      cancel=cancel_flag.is_set, **params)
            msgs.put(("log", f"Hecho: {human(st.compressed_bytes)} de {human(st.source_bytes)} "
                             f"({st.ratio * 100:.1f}%) en {duration(st.seconds)}"))
            msgs.put(("log", f"→ {st.output}"))
            if v_verify.get() != "none":
                msgs.put(("status", "Verificando…"))
                rep = verify(st.output, source=params["input_dir"], mode=v_verify.get(),
                             progress=lambda d, t: msgs.put(("vprogress", d, t)))
                msgs.put(("log", ("✔ " if rep.ok else "✘ ") + rep.summary()))
                for c in rep.checks:
                    msgs.put(("log", f"   {'✓' if c.ok else '✗'} {c.name}: {c.detail}"))
            msgs.put(("done", True))
        except KeyboardInterrupt:
            msgs.put(("log", "Cancelado. Se borró el archivo parcial."))
            msgs.put(("done", False))
        except Exception as e:  # noqa: BLE001
            msgs.put(("log", f"Error: {e}"))
            msgs.put(("done", False))

    def start():
        if not v_in.get():
            messagebox.showwarning("PS4 ZSTD Forge", "Elige la carpeta del juego.")
            return
        num, unit = v_frame.get().split()
        frame = int(num) * (1024 if unit == "KiB" else 1024 * 1024)
        params = dict(input_dir=v_in.get(), output=v_out.get() or None,
                      level=v_level.get(), threads=int(v_threads.get()), frame_size=frame)
        cancel_flag.clear()
        b_start.config(state="disabled")
        b_cancel.config(state="normal")
        pb["value"] = 0
        threading.Thread(target=worker, args=(params,), daemon=True).start()

    b_start.config(command=start)

    def poll():
        try:
            while True:
                m = msgs.get_nowait()
                kind = m[0]
                if kind == "log":
                    write_log(m[1])
                elif kind == "status":
                    v_status.set(m[1])
                elif kind == "progress":
                    _, done, total, comp, t0 = m
                    pb["value"] = done * 1000 / max(total, 1)
                    el = time.time() - t0
                    eta = el * (total - done) / done if done else 0
                    v_status.set(f"{human(done)} / {human(total)} · zst {human(comp)} · "
                                 f"{human(done / el if el else 0)}/s · quedan {duration(eta)}")
                elif kind == "vprogress":
                    pb["value"] = m[1] * 1000 / max(m[2], 1)
                elif kind == "done":
                    b_start.config(state="normal")
                    b_cancel.config(state="disabled")
                    v_status.set("Terminado." if m[1] else "Detenido.")
        except queue.Empty:
            pass
        root.after(150, poll)

    poll()
    root.mainloop()
    return 0
