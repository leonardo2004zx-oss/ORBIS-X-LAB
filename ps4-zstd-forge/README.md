# PS4 ZSTD Forge

Convierte la carpeta de un juego de PS4 (`CUSAxxxxx`) en una **imagen `.ffpfsc` para
ShadowMountPlus**: un contenedor PFS comprimido con zlib (PFSC) con el juego dentro de una
imagen exFAT, con la misma estructura que genera
[SadykovIV/PS4pkg_to_ffpfsc](https://github.com/SadykovIV/PS4pkg_to_ffpfsc). Funciona en
Windows y Linux, con CLI y GUI.

El formato anterior (`.tar.zst`) sigue disponible con `--format zst`, solo como **copia de
respaldo**: ShadowMountPlus no lo puede montar.

> [!IMPORTANT]
> **¿En qué consola?** Según la documentación del repositorio analizado, ShadowMountPlus y
> las imágenes `.ffpfsc` son para **ejecutar juegos de PS4 en una PS5** con jailbreak (perfil
> PFS de PS5; "puede no arrancar en una PS5"). No hay nada en ese proyecto que indique
> soporte en una PS4. Además, que una imagen pase la verificación en el PC **no garantiza**
> que el juego arranque: depende de cada juego (el proyecto original solo confirma Journey).

---

## Cómo es la imagen

```
CUSA12345_Titulo.ffpfsc        PFS exterior: perfil PS5, inodos de 32 bits,
└── CUSA12345.exfat            sin distinguir mayúsculas, bloques PFSC zlib de 64 KiB
    ├── eboot.bin              exFAT interna = raíz del juego (sin carpeta CUSAxxxxx/)
    ├── sce_sys/param.sfo      sin modificar, byte a byte
    ├── sce_sys/param.json     añadido: es lo que lee ShadowMountPlus
    └── … resto del juego
```

- **`sce_sys/param.json`**: ShadowMountPlus localiza el juego por este archivo, no por
  `param.sfo`. Los dumps de PS4 no lo traen, así que la herramienta lo genera a partir de
  `param.sfo`:
  - UTF-8 sin BOM, con `titleId` de 9 caracteres y `titleName`;
  - `localizedParameters` con `en-US` y los idiomas de `TITLE_00…29`;
  - `userDefinedParam1…4` cuando no son 0.

  Si el juego ya tiene un `param.json`, conserva sus otros campos.
- **Compresión**: zlib nivel 0–9 (no zstd), por bloques de 64 KiB que la consola descomprime
  al vuelo. No existe un "nivel 22" en este formato. El máximo es 9.
- **Motor**: el contenedor PFS/PFSC y la exFAT interna los escribe
  [MkPFS](https://github.com/PSBrew/MkPFS) (PSBrew, GPL-3.0), igual que en
  PS4pkg_to_ffpfsc. Se ejecuta como **programa externo** con los mismos parámetros:
  `pack folder --version PS5 --inode-bits 32 --case-insensitive --compression-level N --cpu-count N --require-game-files`.

## Instalación

```bash
# Python 3.9 o superior
pip install -r requirements.txt
python ps4zstdforge.py doctor        # debe mostrar la versión de MkPFS
```

`requirements.txt` instala MkPFS desde GitHub en una versión fija (1.1.0, commit
`1d5df56`), además de `zstandard`, `xxhash` y `tqdm` para el formato de respaldo. Si ya
tienes MkPFS en otro sitio, indícalo con `--mkpfs "C:\ruta\mkpfs.exe"` o con la variable
de entorno `PS4FORGE_MKPFS`.

GUI: usa Tkinter, que viene con Python en Windows. En Linux: `sudo apt install python3-tk`.

**.exe con PyInstaller**: `pyinstaller --onefile --name PS4ZstdForge ps4zstdforge.py`.
El `.exe` no lleva MkPFS dentro: instala MkPFS aparte (`pip install …` deja un `mkpfs.exe`
en `Scripts\`) y apunta a él con `--mkpfs` o desde el campo **MkPFS** de la GUI.

## Uso

```bash
# Lo mínimo: .ffpfsc, zlib 9, todos los hilos, verificación rápida
python ps4zstdforge.py --input "F:\CUSA12345" --output "D:\FFPFSC\\"

# Con todas las opciones
python ps4zstdforge.py pack --input CUSA12345 --output D:/FFPFSC/ \
    --level 9 --threads -1 --backend zlib --verify quick --temp-dir F:/tmp

python ps4zstdforge.py verify juego.ffpfsc --source CUSA12345          # rápida
python ps4zstdforge.py verify juego.ffpfsc --source CUSA12345 --full   # todo
python ps4zstdforge.py extract juego.ffpfsc --dest salida [--only eboot.bin]
python ps4zstdforge.py info juego.ffpfsc
python ps4zstdforge.py gui            # o sin argumentos
```

| Opción | Por defecto | Qué hace |
| --- | --- | --- |
| `--input` | — | Carpeta del juego con `eboot.bin` y `sce_sys/param.sfo`. Si le das la carpeta padre con un único juego dentro, lo detecta. |
| `--output` | `./TITLEID_Titulo.ffpfsc` | Archivo o carpeta (termina en `/` o `\`). |
| `--format` | `ffpfsc` | `ffpfsc` (ShadowMountPlus) o `zst` (respaldo). |
| `--level` | `9` | zlib 0–9 (MkPFS usa 7 por defecto: algo más rápido y casi igual de pequeño). Con `zst`: 1–22. |
| `--threads` | `-1` | Hilos de compresión. `-1` = todos los núcleos. |
| `--backend` | `zlib` | `zlib` es la implementación de referencia y la que usa PS4pkg_to_ffpfsc en Windows por un fallo de descompresión reportado. `isal`/`zlib-ng` son más rápidas; úsalas solo si las pruebas. |
| `--temp-dir` | junto al juego | Carpeta para la copia temporal (ver abajo). |
| `--verify` | `quick` | `quick`, `full` o `none`. |
| `--mkpfs` | autodetección | Ruta o comando de MkPFS. |
| `--keep-stage`, `--overwrite` | no | Conservar la copia temporal / sobrescribir la salida. |

### Qué pasa al empaquetar

1. **Validación**: `eboot.bin`, `param.sfo` legible y `TITLE_ID` de 9 caracteres. Avisa si
   no es `CUSA` o si la categoría no es juego base (`gd`).
2. **Copia temporal con enlaces duros**: hay que añadir `param.json` sin tocar tu carpeta,
   así que se crea un "espejo" del juego con *hard links*. No ocupa espacio extra y el
   original no se modifica. Hace falta que la carpeta temporal esté en la **misma unidad**
   que el juego (por defecto se crea al lado). Si no se puede (otra unidad, FAT32…), copia
   los archivos, comprobando antes que haya espacio. La copia se borra al terminar, también
   si falla o se cancela.
3. **MkPFS** crea la exFAT y la comprime en el `.ffpfsc` de una pasada (sin `.exfat`
   intermedio). La barra de progreso es la de MkPFS.
4. **Verificación rápida** (por defecto):
   - `mkpfs verify` comprueba la estructura y los checksums del contenedor;
   - se desempaquetan de la exFAT interna `eboot.bin`, `param.sfo`, `param.json` y
     `npbind.dat`, y se comparan byte a byte con el origen;
   - se valida el `param.json` tal como lo lee ShadowMountPlus.

   La **completa** desempaqueta todo y compara el SHA-256 de cada archivo; necesita
   espacio libre igual al tamaño del juego. Si la verificación falla, no se publica la imagen.
5. Se escribe primero a `.partial` y se renombra al final. Junto a la imagen quedan:
   - `*.ffpfsc.manifest.json`: juego, parámetros, `param.json` generado y resultado de la
     verificación (`runtime_verified: false`);
   - `*.ffpfsc.shadowmount.txt`: cómo añadirla a ShadowMountPlus.

### Usarla en la consola

1. Copia el `.ffpfsc` a un disco USB o externo.
2. Añade la carpeta con `scanpath=` en la configuración de ShadowMountPlus, o escribe la
   ruta completa de la imagen en `/data/shadowmount/manual.lst`.
3. Si no aparece o no arranca, mira `/data/shadowmount/debug.log`.

### Limitaciones conocidas (heredadas del formato, según PS4pkg_to_ffpfsc)

- No fusiona PKGs ni parches: la carpeta de entrada debe ser ya el juego final
  (base + actualización aplicada).
- No repara el pie SHA-1 de `npbind.dat` como hace PS4pkg_to_ffpfsc. Si tu dump lo tiene
  mal, usa esa herramienta.
- Sin soporte de DLC.
- PFSC rinde peor que una carpeta o una exFAT sin comprimir en juegos que leen muchos datos
  continuamente.
- Hay errores conocidos en algunos juegos (p. ej. `Trophy registration failed 0x80551618`).

---

## Formato de respaldo `.tar.zst` (`--format zst`)

Es un tar estándar comprimido con zstd (nivel 1–22) en el
[formato *seekable*](https://github.com/facebook/zstd/blob/dev/contrib/seekable_format/zstd_seekable_compression_format.md),
con un manifiesto SHA-256 por archivo y verificación propia. Sirve para guardar o transferir
dumps ocupando menos y restaurarlos en el PC (`extract`, o `zstd -d` + `tar`). **No se monta
en la consola.** Los detalles del formato están en `ps4_zstd_forge/archive.py` y
`seekable.py`.

## Estructura del código

| Archivo | Función |
| --- | --- |
| `ps4_zstd_forge/ffpfsc.py` | Validación, copia con enlaces duros, llamada a MkPFS, verificación y archivos de acompañamiento |
| `ps4_zstd_forge/shadowmount.py` | Generación y validación de `sce_sys/param.json` |
| `ps4_zstd_forge/mkpfs_runner.py` | Localiza y ejecuta MkPFS; lee su barra de progreso |
| `ps4_zstd_forge/sfo.py` | Lectura de `param.sfo` |
| `ps4_zstd_forge/cli.py`, `gui.py` | CLI y GUI (Tkinter) |
| `ps4_zstd_forge/packer.py`, `seekable.py`, `archive.py`, `verify.py`, `extract.py` | Formato `.tar.zst` de respaldo |
| `tests/` | `python -m unittest discover tests`. `fake_mkpfs.py` imita la CLI de MkPFS para probar la orquestación sin MkPFS real. |

## Créditos y licencias

- **MkPFS** (PSBrew, GPL-3.0): escribe el PFS/PFSC y la exFAT. No está incluido en este
  repositorio: se instala aparte y se ejecuta como programa externo.
- **PS4pkg_to_ffpfsc** (SadykovIV, GPL-3.0-or-later): de su documentación salen la
  estructura de la imagen, los parámetros de MkPFS y los requisitos de `param.json`. El
  código de esta herramienta es propio; no se ha copiado código de ese proyecto.

Úsala solo con copias de juegos que te pertenecen.
