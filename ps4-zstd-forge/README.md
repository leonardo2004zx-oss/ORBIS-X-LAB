# PS4 ZSTD Forge

Convierte la carpeta de un juego de PS4 (`CUSAxxxxx`) en una **imagen `.ffpfsc` para
ShadowMountPlus**: un contenedor PFS con compresión PFSC (zlib) que lleva el juego dentro de
una imagen exFAT. Es la misma estructura que genera
[SadykovIV/PS4pkg_to_ffpfsc](https://github.com/SadykovIV/PS4pkg_to_ffpfsc). Funciona en
Windows y Linux, con CLI y GUI. También verifica y extrae imágenes `.ffpfsc` con un lector
propio en Python, sin depender de otras herramientas.

El formato anterior (`.tar.zst`) sigue disponible con `--format zst`, solo como **copia de
respaldo**: ShadowMountPlus no lo puede montar.

> [!IMPORTANT]
> **¿PS4 o PS5?** Toda la documentación de PS4pkg_to_ffpfsc habla de **ejecutar juegos de
> PS4 en una PS5** con ShadowMountPlus:
> - las imágenes usan el perfil PFS de PS5;
> - el proyecto avisa de que pueden "no arrancar en una PS5";
> - el parche de soporte necesita el SDK de PS5.
>
> No he encontrado nada que indique que ShadowMountPlus monte `.ffpfsc` en una PS4. Por
> eso esta herramienta replica exactamente lo que ese proyecto produce. Además, que una
> imagen pase la verificación en el PC **no garantiza** que el juego arranque: el proyecto
> original solo confirma Journey.

---

## Análisis del formato FFPFSC

Lo he documentado leyendo el código de MkPFS (PSBrew), que es el motor que usa
PS4pkg_to_ffpfsc. Mi lector nativo (`pfs_reader.py`, `exfat_reader.py`) lo implementa de
forma independiente. Todos los valores son *little endian*.

```
juego.ffpfsc ─ PFS (sin firmar, sin cifrar)
│  bloque 0: cabecera
│    0x00 i64 versión        2 = perfil PS5 (1 = PS4)
│    0x08 i64 magic          20130315
│    0x1C u16 modo           0x1 firmado · 0x2 inodos 64 bits · 0x4 cifrado · 0x8 sin distinguir mayúsculas
│    0x20 u32 tamaño de bloque (0x10000)
│    0x30 i64 nº de inodos   0x38 i64 nº de bloques   0x40 i64 bloques de inodos
│  bloques 1..N: inodos de 0xA8 bytes
│    0x00 modo (0x4000 dir, 0x8000 archivo) · 0x04 flags (0x1 = comprimido PFSC)
│    0x08 tamaño guardado · 0x10 tamaño lógico · 0x64 bloques directos[12]
│  super-root: entradas "flat_path_table", "collision_resolver", "uroot"
│  uroot: UN solo archivo ──► CUSAxxxxx.exfat
│
└─ CUSAxxxxx.exfat guardado como PFSC
     0x00 "PFSC" (0x43534650) · 0x08 6 · 0x0C/0x10 tamaño de bloque 0x10000
     0x18 tabla de desplazamientos en 0x400 · 0x20 inicio de datos (≥ 0x10000)
     0x28 tamaño lógico (múltiplo de 64 KiB)
     0x400: u64[n+1] desplazamientos; bloque i = datos[off[i]:off[i+1]]
            si mide < 64 KiB es un flujo zlib (RFC 1950) que debe inflar a 64 KiB exactos;
            si mide 64 KiB se guarda sin comprimir.
     └─ exFAT estándar: raíz del juego (eboot.bin, sce_sys/param.sfo, sce_sys/param.json…)
```

**El algoritmo de compresión** es zlib por bloques independientes de 64 KiB:
1. Cada bloque se rellena con ceros hasta 64 KiB y se comprime con zlib (nivel 0–9).
2. Si el resultado no es menor que 64 KiB, el bloque se guarda tal cual.
3. Al montar, la consola descomprime cada bloque cuando lo necesita.

En el PC es zlib normal por software: `zlib`, `zlib-ng` o `isal`, todos generan el mismo
formato de flujo. No hay "nivel 22": eso era de zstd.

**Lo que necesita ShadowMountPlus**, según la documentación de PS4pkg_to_ffpfsc:
- **Una única exFAT** dentro del PFS, con el juego en su raíz (sin carpeta `CUSAxxxxx/`).
- **`sce_sys/param.json`**: el juego se localiza por este archivo, no por `param.sfo`.
  - UTF-8 sin BOM;
  - `titleId` de 9 caracteres;
  - `titleName` con respaldo en `localizedParameters.en-US`.

  Los dumps de PS4 no lo traen, así que la herramienta lo genera a partir de `param.sfo`.
  Añade los idiomas `TITLE_00…29` y `userDefinedParam1…4`. `param.sfo` se conserva sin
  cambios.

### ¿Hace falta pasar por un .pkg (GenGP4 / LibOrbisPkg)?

**No.** El `.ffpfsc` no es un PKG renombrado ni contiene un PKG. LibOrbisPkg crea PKG/PFS
firmados para instalar en la consola, que es otro formato. PS4pkg_to_ffpfsc usa los PKG
solo como **entrada**: los desempaqueta a carpeta y después hace lo mismo que esta
herramienta. Por eso aquí se va **directamente de carpeta a `.ffpfsc`**, con `eboot.bin`
en la raíz y sin PKG intermedio.

## Cómo se integran las piezas externas

| Pieza | Para qué | Cómo se integra |
| --- | --- | --- |
| **MkPFS** (PSBrew, GPL-3.0, Python) | **Escribir** el contenedor PFS/PFSC y la exFAT. Es el motor de PS4pkg_to_ffpfsc. | Paquete de Python externo, instalado con `pip`. Se ejecuta como **programa aparte** (`python -m mkpfs` o `mkpfs.exe`) desde `mkpfs_runner.py`, con los mismos argumentos que PS4pkg_to_ffpfsc: `pack folder --version PS5 --inode-bits 32 --case-insensitive --compression-level N --cpu-count N --compression-backend zlib --require-game-files`. Su barra de progreso se lee y se muestra en la CLI/GUI. |
| Lector nativo (este repo) | **Verificar, listar y extraer** `.ffpfsc` | Python puro, sin dependencias: `pfs_reader.py` y `exfat_reader.py`. |
| C++ / C# | — | No se usa. Ni LibOrbisPkg (C#) ni el extractor de PKG en C++ de PS4pkg_to_ffpfsc hacen falta para ir de carpeta a `.ffpfsc`. |

**¿Por qué no se llama a `ps4pkg_to_ffpfsc.exe`?** Ese programa es una GUI y un flujo
completo pensado para PKG. Su núcleo es MkPFS con los argumentos de arriba, así que
llamarlo directamente da el mismo resultado con menos piezas. Si prefieres su flujo (por
ejemplo, para reparar `npbind.dat` o fusionar parches), su CLI acepta carpetas:
`ps4ffpsc build CUSA12345 --dump-dir "/games/CUSA12345"`.

## Instalación

```bash
# Python 3.9 o superior
pip install -r requirements.txt     # MkPFS 1.1.0 (fijado) + zstandard/xxhash/tqdm
python ps4zstdforge.py doctor       # debe mostrar la versión de MkPFS
```

- Si ya tienes MkPFS en otro sitio, usa `--mkpfs "C:\ruta\mkpfs.exe"` o la variable
  `PS4FORGE_MKPFS`.
- Para verificar y extraer **no** hace falta MkPFS.
- GUI: Tkinter, que viene con Python en Windows. En Linux: `sudo apt install python3-tk`.
- **.exe**: `pyinstaller --onefile --name PS4ZstdForge ps4zstdforge.py`. MkPFS se instala
  aparte (`pip` deja `mkpfs.exe` en `Scripts\`) y se indica con `--mkpfs` o con el campo
  **MkPFS** de la GUI.

## Uso

```bash
# Crear el .ffpfsc ("compress" y "pack" son lo mismo): zlib 9, todos los hilos, verificación
python ps4zstdforge.py compress --input "F:\CUSA12345" --output "D:\FFPFSC\\"

# Verificar: cabeceras PFS/PFSC, TODOS los bloques zlib, exFAT, archivos clave y param.json
python ps4zstdforge.py verify juego.ffpfsc
python ps4zstdforge.py verify juego.ffpfsc --source "F:\CUSA12345"          # + compara eboot/param.sfo
python ps4zstdforge.py verify juego.ffpfsc --source "F:\CUSA12345" --full   # + SHA-256 de todo
python ps4zstdforge.py verify juego.ffpfsc --mkpfs-check                     # + 'mkpfs verify'

# Ver y extraer (sin MkPFS)
python ps4zstdforge.py info juego.ffpfsc --files
python ps4zstdforge.py extract juego.ffpfsc --dest salida
python ps4zstdforge.py extract juego.ffpfsc --dest salida --only eboot.bin sce_sys

python ps4zstdforge.py gui          # o sin argumentos
```

La GUI tiene **Empaquetar**, **Verificar imagen…** y **Extraer imagen…**.

| Opción de `compress` | Por defecto | Qué hace |
| --- | --- | --- |
| `--input` | — | Carpeta con `eboot.bin` y `sce_sys/param.sfo`. Si le das la carpeta padre con un único juego dentro, lo detecta. |
| `--output` | `./TITLEID_Titulo.ffpfsc` | Archivo o carpeta (termina en `/` o `\`). |
| `--format` | `ffpfsc` | `ffpfsc` o `zst` (respaldo). |
| `--level` | `9` | zlib 0–9 (MkPFS usa 7 por defecto: casi igual de pequeño y más rápido). |
| `--threads` | `-1` | Hilos de compresión (y de verificación). `-1` = todos los núcleos. |
| `--backend` | `zlib` | `zlib` es la implementación de referencia. PS4pkg_to_ffpfsc la fuerza en Windows por un fallo reportado. `isal`/`zlib-ng` son más rápidas. |
| `--verify` | `quick` | `quick`, `full` o `none`. |
| `--temp-dir` | junto al juego | Copia temporal (ver abajo). |
| `--mkpfs`, `--keep-stage`, `--overwrite` | — | Ruta de MkPFS, conservar la copia temporal, sobrescribir. |

### Qué pasa al comprimir

1. **Validación**: `eboot.bin`, `param.sfo` legible y `TITLE_ID` de 9 caracteres.
2. **Copia temporal con enlaces duros**: para añadir `param.json` sin tocar tu carpeta se crea
   un espejo con *hard links*, que no ocupa espacio. Tiene que estar en la **misma unidad**
   que el juego; por defecto se crea al lado. Si no se puede (otra unidad, o discos
   **exFAT/FAT32**, que no admiten enlaces duros), copia los archivos tras comprobar que hay
   espacio. Se borra siempre al terminar.
3. **MkPFS** crea la exFAT y la comprime en el `.ffpfsc` de una pasada.
4. **Verificación**: `mkpfs verify` y luego el lector nativo, con las comprobaciones de la
   tabla siguiente. Si falla, la imagen no se publica.
5. Se escribe en `.partial` y se renombra al final. Al lado quedan `.manifest.json` y
   `.shadowmount.txt` con las instrucciones.

### Qué comprueba `verify`

| Comprobación | Detalle |
| --- | --- |
| cabecera PFS | magic 20130315, perfil (avisa si no es PS5), tamaño de bloque, modo (rechaza imágenes firmadas o cifradas) y que el archivo no esté truncado |
| imagen interna | exactamente una `.exfat` en `uroot`, llamada `TITLEID.exfat` |
| cabecera PFSC | magic, versión 6, bloques de 64 KiB, tabla de desplazamientos monótona y dentro de los límites |
| **bloques zlib** | **todos** los bloques se descomprimen (en paralelo) y cada uno debe dar exactamente 64 KiB; un solo byte corrupto hace fallar la verificación |
| exFAT interna | firma `EXFAT`, geometría y cadenas FAT |
| archivos requeridos | `eboot.bin`, `sce_sys/param.sfo` y `sce_sys/param.json` en la raíz |
| TITLE_ID y param.json | se leen desde dentro de la imagen y se validan como lo haría ShadowMountPlus |
| origen (`--source`) | rápida: `eboot.bin`, `param.sfo` y `npbind.dat` byte a byte; `--full`: SHA-256 de todos los archivos, leídos directamente de la imagen sin extraer a disco |

### Usarla en la consola

1. Copia el `.ffpfsc` a un USB o disco externo.
2. Añade la carpeta con `scanpath=` en ShadowMountPlus, o escribe la ruta completa en
   `/data/shadowmount/manual.lst`.
3. Si algo falla, mira `/data/shadowmount/debug.log`.

### Limitaciones

- La entrada debe ser el juego final: no fusiona PKG ni parches.
- No repara `npbind.dat` como PS4pkg_to_ffpfsc. No incluye DLC.
- El lector nativo solo lee imágenes **sin firmar y sin cifrar** (las de ShadowMountPlus) con
  datos contiguos, que es como las escribe MkPFS.
- PFSC rinde peor que una exFAT sin comprimir en juegos que leen muchos datos seguidos.
  Hay errores conocidos en algunos juegos, por ejemplo `Trophy registration failed 0x80551618`.

---

## Formato de respaldo `.tar.zst` (`--format zst`)

Es un tar estándar comprimido con zstd (nivel 1–22) en
[formato *seekable*](https://github.com/facebook/zstd/blob/dev/contrib/seekable_format/zstd_seekable_compression_format.md),
con manifiesto SHA-256. Sirve para guardar dumps y restaurarlos en el PC. **No se monta en
la consola.**

## Código y pruebas

| Archivo | Función |
| --- | --- |
| `ffpfsc.py` | Validación, copia con enlaces duros, llamada a MkPFS, verificación y archivos de acompañamiento |
| `pfs_reader.py` | Lector PFS + PFSC: cabeceras, inodos, directorios, bloques zlib en paralelo |
| `exfat_reader.py` | Lector exFAT mínimo, que lee directamente de los bloques PFSC |
| `ffpfsc_native.py` | Verificación, listado y extracción nativos |
| `shadowmount.py` | Generación y validación de `param.json` |
| `mkpfs_runner.py` | Localiza y ejecuta MkPFS y lee su progreso |
| `cli.py`, `gui.py` | CLI y GUI |
| `packer.py`, `seekable.py`, … | Formato `.tar.zst` |

```bash
python -m unittest discover tests      # 31 pruebas
```

- `tests/ffpfsc_fixture.py` genera `.ffpfsc` pequeños con la estructura descrita. Así se
  prueba el lector, incluida la detección de bloques zlib corruptos, archivos truncados y
  contenedores mal formados.
- `tests/fake_mkpfs.py` imita la CLI de MkPFS para probar la orquestación.
- `tests/test_real_mkpfs.py` crea un juego sintético con **MkPFS real** y lo comprueba con el
  lector nativo. Se salta si MkPFS no está instalado.

**Resultado con MkPFS 1.1.0 real** (juego sintético de 20 MiB, 351 bloques PFSC):
- el lector nativo da los mismos tamaños que `mkpfs verify`: 23.003.136 bytes lógicos y
  7.940.658 guardados;
- la extracción nativa es idéntica byte a byte a `mkpfs unpack --deep` y a la carpeta
  original;
- al cambiar un byte de un bloque comprimido, la verificación nativa y `mkpfs verify` señalan
  el mismo bloque (175) con "incorrect data check", y `verify` termina con código 2.

## Créditos y licencias

- **MkPFS** (PSBrew, GPL-3.0) escribe la imagen. No está incluido en el repo: se instala
  aparte y se ejecuta como programa externo.
- **PS4pkg_to_ffpfsc** (SadykovIV, GPL-3.0-or-later): de su documentación salen la estructura
  de la imagen, los parámetros de MkPFS y los requisitos de `param.json`. El código de esta
  herramienta, incluido el lector del formato, es propio.

Úsala solo con copias de juegos que te pertenecen.
