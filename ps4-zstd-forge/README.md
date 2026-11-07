# PS4 ZSTD Forge

Empaqueta la carpeta de un juego de PS4 (`CUSAxxxxx`) en **un solo archivo `.tar.zst`**
comprimido con zstd (nivel 22 por defecto, en todos los núcleos), preservando las rutas
originales, y lo verifica después. Funciona en Windows y Linux (Python 3.8+), con CLI y GUI.

> ⚠️ **Antes de nada, sobre la compatibilidad con ShadowMountPlus:** lee la sección
> [Compatibilidad con la consola](#compatibilidad-con-la-consola-léelo). En resumen: el
> archivo que genera esta herramienta es un formato zstd estándar, documentado y de acceso
> aleatorio, **pero no he podido confirmar que exista hoy un payload de PS4 (ShadowMountPlus
> u otro) que monte archivos zstd**. No lo copies a la consola esperando que arranque sin más.

---

## Instalación

```bash
# Python 3.8 o superior
pip install -r requirements.txt     # zstandard, xxhash, tqdm
```

- `zstandard` es obligatorio. `xxhash` añade checksums por trama a la tabla de búsqueda
  (recomendado). `tqdm` da la barra de progreso (sin él se muestra un porcentaje simple).
- GUI: usa Tkinter, que viene con Python en Windows. En Linux: `sudo apt install python3-tk`.

### Crear un .exe (Windows)

```bat
pip install pyinstaller
pyinstaller --onefile --name PS4ZstdForge ps4zstdforge.py
REM El ejecutable queda en dist\PS4ZstdForge.exe. Sin argumentos abre la GUI.
```

## Uso

```bash
# Lo mínimo (equivale a "pack"): nivel 22, todos los hilos, verificación rápida
python ps4zstdforge.py --input "F:\CUSA12345" --output "D:\ZSTD\\"

# Todas las opciones de empaquetado
python ps4zstdforge.py pack --input CUSA12345 --output D:/ZSTD/juego.tar.zst \
    --level 22 --threads -1 --frame-size 2M --verify quick

# Verificar más tarde (rápida o completa, con o sin la carpeta original)
python ps4zstdforge.py verify juego.tar.zst --source CUSA12345
python ps4zstdforge.py verify juego.tar.zst --source CUSA12345 --full

# Ver datos del juego o del archivo
python ps4zstdforge.py info CUSA12345
python ps4zstdforge.py info juego.tar.zst --files

# Descomprimir todo, o solo algunos archivos (sin descomprimir el resto)
python ps4zstdforge.py extract juego.tar.zst --dest CUSA12345_restaurado
python ps4zstdforge.py extract juego.tar.zst --dest tmp --only eboot.bin sce_sys/param.sfo

# Interfaz gráfica
python ps4zstdforge.py gui          # o sin argumentos
```

Hay scripts de ejemplo en [`examples/ejemplo_uso.sh`](examples/ejemplo_uso.sh) y
[`examples/ejemplo_uso.bat`](examples/ejemplo_uso.bat).

| Opción | Por defecto | Qué hace |
| --- | --- | --- |
| `--input` | — | Carpeta del juego. Si le das la carpeta padre y dentro hay un único juego, lo detecta (busca `eboot.bin` / `sce_sys/param.sfo`). |
| `--output` | `./TITLEID_Titulo.tar.zst` | Archivo o carpeta de destino (termina en `/` o `\` para carpeta). Nunca dentro de la carpeta del juego. |
| `--level` | `22` | Nivel zstd 1–22. 19–22 es muy lento; 3–9 es rápido. |
| `--threads` | `-1` | Hilos de compresión. `-1` = todos los núcleos. |
| `--frame-size` | `2M` | Tamaño de cada trama independiente (ver abajo). |
| `--verify` | `quick` | `quick`, `full` o `none` al terminar. |
| `--overwrite` | no | Sobrescribir la salida si ya existe. |
| `--no-manifest` | no | No escribir el `.manifest.json` al lado del archivo. |

Al terminar se muestra un resumen (original vs. comprimido, ahorro, tiempo y velocidad).
Se escribe primero a `*.partial` y se renombra al final, así que si cancelas (Ctrl+C) no
queda un archivo a medias.

### Rendimiento y memoria

- El nivel 22 es lentísimo **por diseño**. En mis pruebas con datos sintéticos, ~1,2 MiB/s por
  núcleo (en juegos reales variará). Con 16 núcleos y 187 GB, cuenta varias horas (en la línea de las
  4–5 h de la captura). Si te importa más el tiempo, `--level 19` comprime casi igual y
  bastante más rápido.
- Cada hilo comprime tramas distintas a la vez, así que la velocidad escala con los núcleos.
  Memoria aproximada: decenas de MB por hilo con tramas de 2 MiB.
- **Tramas grandes** (`--frame-size 8M`, `16M`) comprimen algo más; **tramas pequeñas**
  (`512K`, `1M`) hacen más barato leer un trozo suelto (lo que necesitaría un montaje en
  la consola, que tiene una CPU Jaguar lenta). 2 MiB es un término medio.
- Los datos ya comprimidos (vídeo, audio AT9, texturas comprimidas) apenas bajan de tamaño.
  El ratio de la captura de PS5 (187 → 82 GB) depende totalmente del juego.

## Verificación

**Rápida** (por defecto tras empaquetar), igual que en la captura:

1. **Tabla de búsqueda**: número de tramas, y que tamaños + tabla = tamaño del archivo.
2. **Cabeceras de tramas**: lee la cabecera zstd de *cada* trama y comprueba el magic y que el tamaño declarado coincide con la tabla.
3. **Manifiesto**: se lee desde el archivo, con SHA-256 correcto y el número de archivos esperado.
4. **Tamaños**: desplazamientos coherentes y la suma de tamaños cuadra.
5. **Rutas vs. origen** (si hay carpeta original): mismas rutas y mismos tamaños.
6. **Carpetas vacías**: las mismas que en el origen.
7. **Cantidad revisada**: descomprime un 10 % de las tramas al azar (más la primera y la última). Comprueba sus checksums, las cabeceras tar que caen dentro y compara los bytes con los archivos originales.

**Completa** (`--full`): descomprime todo en paralelo, comprueba el checksum de cada trama
y el SHA-256 de cada archivo contra el manifiesto (y contra el origen si lo indicas).

El código de salida es `0` si todo está bien, `2` si falla la verificación y `1` si hay errores.

---

## Formato del archivo de salida

Es **un archivo zstd normal** que contiene **un tar normal**, escrito en el
[formato *seekable* oficial de zstd](https://github.com/facebook/zstd/blob/dev/contrib/seekable_format/zstd_seekable_compression_format.md):

```
juego.tar.zst
├── trama zstd 0      ┐ cada trama es independiente: 2 MiB del tar sin comprimir,
├── trama zstd 1      │ con tamaño de contenido y checksum de contenido de zstd
├── …                 │
├── trama zstd N-2    ┘
├── trama zstd N-1    ← la última siempre empieza por __forge__/footer.json
└── tabla de búsqueda ← "skippable frame" de zstd (los descompresores normales la ignoran)
```

Dentro del tar (formato POSIX/pax, rutas UTF-8, orden alfabético, uid/gid 0):

```
sce_sys/              ← carpetas primero (incluidas las vacías)
sce_sys/param.sfo
eboot.bin             ← rutas relativas a la raíz del juego: eboot.bin queda en la raíz del archivo
…
__forge__/manifest.json   (en tramas propias)
__forge__/footer.json     (al principio de la última trama)
```

Así que funciona con cualquier herramienta estándar:

```bash
zstd -d juego.tar.zst -o juego.tar && tar -xf juego.tar     # o: tar --zstd -xf juego.tar.zst
```

(con tar a mano también se extrae la carpeta `__forge__/`, que se puede borrar).

### Tabla de búsqueda (little endian)

```
u32 0x184D2A5E            magic de skippable frame
u32 tamaño_del_resto
N × { u32 tamaño_comprimido, u32 tamaño_descomprimido, u32 xxh64_bajo32 }
u32 N                     número de tramas
u8  descriptor            bit 7 = hay checksums
u32 0x8F92EAB1            magic seekable
```

### Manifiesto (`__forge__/manifest.json`)

```jsonc
{
  "format": "ps4-zstd-forge", "version": 1,
  "game": { "title_id": "CUSA12345", "title": "…", "content_id": "…", "app_ver": "01.05",
            "category": "Juego (gd)", "firmware": "5.05" },
  "compression": { "codec": "zstd", "level": 22, "frame_size": 2097152, … },
  "totals": { "files": 149966, "dirs": 812, "empty_dirs": 1, "bytes": 201671354698 },
  "dirs": ["sce_sys", …], "empty_dirs": […],
  "files": [ { "p": "eboot.bin", "s": 31457280, "h": 1536, "o": 2048, "sha256": "…" }, … ]
}
```

`p` = ruta, `s` = tamaño, `h` = desplazamiento de la cabecera tar y `o` = desplazamiento de los
datos, **ambos en el flujo descomprimido**. También se guarda una copia como
`juego.tar.zst.manifest.json` junto al archivo, para inspeccionarlo sin abrir el `.zst`.

### Cómo lee un archivo un cargador (algoritmo para quien escriba un payload)

1. Leer los últimos 9 bytes del archivo y comprobar `0x8F92EAB1`. Leer la tabla y acumular los desplazamientos comprimidos y descomprimidos de cada trama.
2. Descomprimir la **última** trama. Empieza por la cabecera tar de `__forge__/footer.json`; su JSON da `manifest_offset` y `manifest_size`.
3. Leer el manifiesto (descomprimiendo solo sus tramas) y construir el índice `ruta → (o, s)`.
4. Para leer `n` bytes del archivo `ruta` desde `pos`: el rango descomprimido es `[o+pos, o+pos+n)`. Con búsqueda binaria se encuentran las tramas que lo cubren, se descomprimen (con una caché) y se copian los bytes.

`ps4_zstd_forge/seekable.py` (`SeekableReader.read_at`) y `extract.py` (`extract_some`)
son una implementación de referencia de esos pasos en Python. En C con `libzstd` son
unas 200 líneas.

---

## Compatibilidad con la consola (léelo)

Lo que sé y lo que no:

- **En PS5**, por lo que se ve en tu captura, PS5 Dump Forge **no** hace que ShadowMount+
  descomprima un `.zst`. Guarda los recursos en *volúmenes* zstd con un índice
  (`ampr_zstd.index`) y necesita **`ampr-emu-ng`** instalado en `fakelib`. Ese módulo
  sustituye la biblioteca de E/S AMPR del juego y descomprime al vuelo. Por eso la app
  avisa de "desactivar la actualización de fakelib de ShadowMount+, o reemplazará el runtime".
- **La PS4 no tiene AMPR**: los juegos leen con las llamadas normales del sistema de
  archivos. Ese truco no se puede portar tal cual. Para que un juego de PS4 lea un archivo
  zstd haría falta un payload que intercepte las lecturas (o que monte un sistema de
  archivos virtual) y descomprima por tramas, como en el algoritmo de arriba.
- **No he podido verificar** que ShadowMountPlus (ni otro payload de PS4) monte hoy
  archivos zstd, ni el formato exacto que esperaría si lo hiciera. Tampoco que exista
  un formato "ffpfsc" de PS4. Por eso esta herramienta **no** dice generar un archivo
  "compatible con ShadowMountPlus". Genera un formato abierto, estándar y de acceso
  aleatorio, preparado para que un cargador lo lea, y lo documenta entero.
- Si ShadowMountPlus para PS4 monta **imágenes** (exFAT/PFS), lo que espera es una
  imagen de sistema de archivos, no un `.zst`. Eso lo crean otras herramientas.

Para qué sirve hoy, con seguridad:

- Guardar y transferir dumps ocupando mucho menos, con verificación de integridad
  (SHA-256 por archivo y checksum por trama).
- Restaurar la carpeta exacta en PC (`extract`) o con `zstd` + `tar` estándar, y copiarla a
  la consola como siempre.
- Servir de base (formato + lector de referencia) para un futuro payload de montaje.
  Si sale una versión de ShadowMountPlus con zstd y documenta su formato, el empaquetado
  se puede adaptar a ella.

Sobre comprimir **en** la PS4: zstd 22 en una CPU Jaguar de 8 núcleos sería varias veces
más lento que en un PC actual y necesita mucha RAM. No merece la pena: comprime en el PC.

---

## Estructura del código

| Archivo | Función |
| --- | --- |
| `ps4zstdforge.py` | Punto de entrada |
| `ps4_zstd_forge/cli.py` | Argumentos, barra de progreso y resumen |
| `ps4_zstd_forge/gui.py` | GUI Tkinter (hilo de trabajo, progreso, cancelar) |
| `ps4_zstd_forge/packer.py` | Escaneo de la carpeta, tar en streaming y manifiesto |
| `ps4_zstd_forge/seekable.py` | Escritor zstd seekable multihilo y lector de acceso aleatorio |
| `ps4_zstd_forge/archive.py` | Disposición footer/manifiesto y lectura de cabeceras tar |
| `ps4_zstd_forge/verify.py` | Verificación rápida y completa |
| `ps4_zstd_forge/extract.py` | Extracción completa y de archivos sueltos |
| `ps4_zstd_forge/sfo.py` | Lectura de `param.sfo` (TITLE_ID, título, versión, firmware) |
| `tests/test_roundtrip.py` | Pruebas con un dump sintético: `python -m unittest -v` |

Úsalo solo con copias de juegos que te pertenecen.
