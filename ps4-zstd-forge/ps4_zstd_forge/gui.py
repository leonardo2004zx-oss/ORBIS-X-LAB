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
    from .ffpfsc import extract_ffpfsc, is_ffpfsc, pack_ffpfsc, verify_ffpfsc
    from .mkpfs_runner import MkpfsNotFound, find_mkpfs, mkpfs_version
    from .packer import pack
    from .sfo import find_game_root, read_game_info
    from .verify import verify

    root = tk.Tk()
    root.title("PS4 ZSTD Forge")
    root.minsize(680, 580)
    msgs: "queue.Queue[tuple]" = queue.Queue()
    cancel_flag = threading.Event()

    v_in = tk.StringVar()
    v_out = tk.StringVar()
    v_fmt = tk.StringVar(value="ffpfsc")
    v_level = tk.IntVar(value=9)
    v_threads = tk.IntVar(value=os.cpu_count() or 1)
    v_backend = tk.StringVar(value="zlib")
    v_mkpfs = tk.StringVar(value=os.environ.get("PS4FORGE_MKPFS", ""))
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

    def pick_mkpfs():
        f = filedialog.askopenfilename(title="Ejecutable de MkPFS")
        if f:
            v_mkpfs.set(f)

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

    opts = ttk.LabelFrame(frm, text="Empaquetar", padding=8)
    opts.grid(row=r, column=0, columnspan=3, sticky="ew", pady=10)
    opts.columnconfigure(1, weight=1)
    ttk.Label(opts, text="Formato").grid(row=0, column=0, sticky="w")
    fb = ttk.Frame(opts)
    fb.grid(row=0, column=1, columnspan=2, sticky="w", padx=6)
    lvl_lbl = ttk.Label(opts)
    scale = ttk.Scale(opts, orient="horizontal")

    def set_level(v):
        v = int(float(v))
        v_level.set(v)
        top = 9 if v_fmt.get() == "ffpfsc" else 22
        lvl_lbl.config(text=f"{v}" + (" (Máximo)" if v == top else ""))

    def on_fmt(*_):
        if v_fmt.get() == "ffpfsc":
            scale.config(from_=0, to=9)
            scale.set(9)
        else:
            scale.config(from_=1, to=22)
            scale.set(22)
        state = "normal" if v_fmt.get() == "ffpfsc" else "disabled"
        for w in ff_widgets:
            w.config(state=state)

    ttk.Radiobutton(fb, text=".ffpfsc (ShadowMountPlus)", value="ffpfsc", variable=v_fmt,
                    command=on_fmt).pack(side="left", padx=(0, 10))
    ttk.Radiobutton(fb, text=".tar.zst (respaldo)", value="zst", variable=v_fmt,
                    command=on_fmt).pack(side="left")
    ttk.Label(opts, text="Nivel").grid(row=1, column=0, sticky="w", pady=4)
    scale.config(command=set_level)
    scale.grid(row=1, column=1, sticky="ew", padx=6)
    lvl_lbl.grid(row=1, column=2, sticky="w")
    ttk.Label(opts, text="Hilos").grid(row=2, column=0, sticky="w")
    ttk.Spinbox(opts, from_=1, to=256, textvariable=v_threads, width=6).grid(
        row=2, column=1, sticky="w", padx=6)
    ttk.Label(opts, text="Backend zlib").grid(row=3, column=0, sticky="w", pady=4)
    cb_backend = ttk.Combobox(opts, textvariable=v_backend, width=10, state="readonly",
                              values=("zlib", "auto", "zlib-ng", "isal"))
    cb_backend.grid(row=3, column=1, sticky="w", padx=6)
    ttk.Label(opts, text="MkPFS").grid(row=4, column=0, sticky="w")
    mk_row = ttk.Frame(opts)
    mk_row.grid(row=4, column=1, columnspan=2, sticky="ew", padx=6)
    mk_row.columnconfigure(0, weight=1)
    e_mkpfs = ttk.Entry(mk_row, textvariable=v_mkpfs)
    e_mkpfs.grid(row=0, column=0, sticky="ew")
    b_mkpfs = ttk.Button(mk_row, text="…", width=3, command=pick_mkpfs)
    b_mkpfs.grid(row=0, column=1, padx=(4, 0))
    ff_widgets = [cb_backend, e_mkpfs, b_mkpfs]
    ttk.Label(opts, text="Verificación").grid(row=5, column=0, sticky="w", pady=4)
    vb = ttk.Frame(opts)
    vb.grid(row=5, column=1, sticky="w", padx=6)
    for val, txt in (("quick", "Rápida"), ("full", "Completa"), ("none", "Ninguna")):
        ttk.Radiobutton(vb, text=txt, value=val, variable=v_verify).pack(side="left", padx=(0, 8))
    on_fmt()
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
    b_verify = ttk.Button(btns, text="Verificar imagen…")
    b_extract = ttk.Button(btns, text="Extraer imagen…")
    b_cancel.pack(side="right", padx=4)
    b_start.pack(side="right")
    b_extract.pack(side="right", padx=4)
    b_verify.pack(side="right")
    busy_buttons = [b_start, b_verify, b_extract]

    def write_log(text):
        log.config(state="normal")
        log.insert("end", text + "\n")
        log.see("end")
        log.config(state="disabled")

    def worker_ffpfsc(p):
        st = pack_ffpfsc(
            p["input_dir"], p["output"], level=p["level"], threads=p["threads"],
            backend=p["backend"], verify_mode=p["verify"], mkpfs=p["mkpfs"],
            log=lambda s: msgs.put(("log", s)),
            progress=lambda pct, phase, det: msgs.put(("pct", pct, phase, det)),
            cancel=cancel_flag.is_set)
        msgs.put(("log", f"Hecho: {human(st.image_bytes)} de {human(st.source_bytes)} "
                         f"({st.ratio * 100:.1f}%) en {duration(st.seconds)}"))
        msgs.put(("log", f"→ {st.output}"))
        v = st.verification
        if v.get("mode") != "none":
            msgs.put(("log", ("✔ " if v["ok"] else "✘ ") + "Verificación "
                             + ("superada" if v["ok"] else "FALLIDA")))
            for c in v["checks"]:
                msgs.put(("log", f"   {'✓' if c['ok'] else '✗'} {c['name']}: {c['detail']}"))
        msgs.put(("log", f"Instrucciones: {st.shadowmount_path}"))

    def worker_zst(p):
        t0 = time.time()
        st = pack(p["input_dir"], p["output"], level=p["level"], threads=p["threads"],
                  log=lambda s: msgs.put(("log", s)),
                  progress=lambda d, t, c: msgs.put(("bytes", d, t, c, t0)),
                  cancel=cancel_flag.is_set)
        msgs.put(("log", f"Hecho: {human(st.compressed_bytes)} de {human(st.source_bytes)} "
                         f"({st.ratio * 100:.1f}%) en {duration(st.seconds)}"))
        msgs.put(("log", f"→ {st.output}"))
        if p["verify"] != "none":
            msgs.put(("status", "Verificando…"))
            rep = verify(st.output, source=p["input_dir"], mode=p["verify"],
                         progress=lambda d, t: msgs.put(("pct", d * 100 // max(t, 1), "verify", "")))
            msgs.put(("log", ("✔ " if rep.ok else "✘ ") + rep.summary()))
            for c in rep.checks:
                msgs.put(("log", f"   {'✓' if c.ok else '✗'} {c.name}: {c.detail}"))

    def worker(p):
        try:
            (worker_ffpfsc if p["format"] == "ffpfsc" else worker_zst)(p)
            msgs.put(("done", True))
        except KeyboardInterrupt:
            msgs.put(("log", "Cancelado. Se borraron los archivos parciales."))
            msgs.put(("done", False))
        except Exception as e:  # noqa: BLE001
            msgs.put(("log", f"Error: {e}"))
            out = getattr(e, "output", "")
            if out:
                msgs.put(("log", "\n".join(out.splitlines()[-15:])))
            msgs.put(("done", False))

    def run_job(fn):
        cancel_flag.clear()
        for b in busy_buttons:
            b.config(state="disabled")
        b_cancel.config(state="normal")
        pb["value"] = 0

        def wrap():
            try:
                fn()
                msgs.put(("done", True))
            except Exception as e:  # noqa: BLE001
                msgs.put(("log", f"Error: {e}"))
                msgs.put(("done", False))
        threading.Thread(target=wrap, daemon=True).start()

    def report(v):
        msgs.put(("log", ("✔ " if v["ok"] else "✘ ") + "Verificación "
                         + ("superada" if v["ok"] else "FALLIDA")))
        for c in v["checks"]:
            msgs.put(("log", f"   {'✓' if c['ok'] else '✗'} {c['name']}: {c['detail']}"))

    def pct(p, phase, det):
        msgs.put(("pct", p, phase, det))

    def do_verify():
        img = filedialog.askopenfilename(title="Imagen .ffpfsc",
                                         filetypes=[("FFPFSC", "*.ffpfsc"), ("Todos", "*.*")])
        if not img:
            return
        if not is_ffpfsc(img):
            messagebox.showwarning("PS4 ZSTD Forge", "Usa la CLI para verificar .tar.zst.")
            return
        src = v_in.get() or None
        write_log(f"Verificando {img}" + (f" contra {src}" if src else ""))
        run_job(lambda: report(verify_ffpfsc(img, source=src, mode=v_verify.get()
                                             if v_verify.get() != "none" else "quick",
                                             progress=pct, threads=int(v_threads.get()))))

    def do_extract():
        img = filedialog.askopenfilename(title="Imagen .ffpfsc",
                                         filetypes=[("FFPFSC", "*.ffpfsc"), ("Todos", "*.*")])
        if not img:
            return
        dest = filedialog.askdirectory(title="Carpeta donde extraer")
        if not dest:
            return
        write_log(f"Extrayendo {img} → {dest}")
        run_job(lambda: msgs.put(("log", f"{extract_ffpfsc(img, dest, progress=pct)} "
                                         f"archivos extraídos en {dest}")))

    b_verify.config(command=do_verify)
    b_extract.config(command=do_extract)

    def start():
        if not v_in.get():
            messagebox.showwarning("PS4 ZSTD Forge", "Elige la carpeta del juego.")
            return
        p = dict(input_dir=v_in.get(), output=(v_out.get() + os.sep) if v_out.get() else None,
                 format=v_fmt.get(), level=v_level.get(), threads=int(v_threads.get()),
                 backend=v_backend.get(), mkpfs=v_mkpfs.get() or None, verify=v_verify.get())
        if p["format"] == "ffpfsc":
            try:
                write_log(f"Motor: {mkpfs_version(find_mkpfs(p['mkpfs']))}")
            except MkpfsNotFound as e:
                messagebox.showerror("PS4 ZSTD Forge", str(e))
                return
            except Exception as e:  # noqa: BLE001
                messagebox.showerror("PS4 ZSTD Forge", f"MkPFS no responde: {e}")
                return
        cancel_flag.clear()
        for b in busy_buttons:
            b.config(state="disabled")
        b_cancel.config(state="normal")
        pb["value"] = 0
        threading.Thread(target=worker, args=(p,), daemon=True).start()

    b_start.config(command=start)
    phase_names = {"preparar": "Preparando", "compress": "Comprimiendo", "write": "Escribiendo",
                   "verify": "Verificando", "check": "Verificando",
                   "zlib": "Bloques zlib", "comparar": "Comparando", "extraer": "Extrayendo"}

    def poll():
        try:
            while True:
                m = msgs.get_nowait()
                kind = m[0]
                if kind == "log":
                    write_log(m[1])
                elif kind == "status":
                    v_status.set(m[1])
                elif kind == "pct":
                    _, pct, phase, det = m
                    pb["value"] = pct * 10
                    v_status.set(f"{phase_names.get(phase, phase)}: {pct}% {det}")
                elif kind == "bytes":
                    _, done, total, comp, t0 = m
                    pb["value"] = done * 1000 / max(total, 1)
                    el = time.time() - t0
                    eta = el * (total - done) / done if done else 0
                    v_status.set(f"{human(done)} / {human(total)} · zst {human(comp)} · "
                                 f"{human(done / el if el else 0)}/s · quedan {duration(eta)}")
                elif kind == "done":
                    for b in busy_buttons:
                        b.config(state="normal")
                    b_cancel.config(state="disabled")
                    v_status.set("Terminado." if m[1] else "Detenido.")
        except queue.Empty:
            pass
        root.after(150, poll)

    poll()
    root.mainloop()
    return 0
