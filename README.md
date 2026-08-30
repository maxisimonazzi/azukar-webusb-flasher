<div align="center">
  <h1>⚡ Lattice iCE40 WebUSB Flasher & Mini IDE ⚡</h1>

  [![Estado](https://img.shields.io/badge/Estado-Activo-success?style=for-the-badge&logoSize=auto)]()
  [![Licencia: MIT](https://img.shields.io/badge/Licencia-MIT-yellow.svg?style=for-the-badge&logoSize=auto)](LICENSE)
  [![Vue.js](https://img.shields.io/badge/_-Vue.js_3-4FC08D.svg?style=for-the-badge&logo=vuedotjs&logoColor=white&logoSize=auto)](https://vuejs.org/)
  [![TypeScript](https://img.shields.io/badge/_-TypeScript-3178C6.svg?style=for-the-badge&logo=typescript&logoColor=white&logoSize=auto)](https://www.typescriptlang.org/)
  [![Tailwind CSS](https://img.shields.io/badge/_-Tailwind_CSS-06B6D4.svg?style=for-the-badge&logo=tailwindcss&logoColor=white&logoSize=auto)](https://tailwindcss.com/)
  [![Vite](https://img.shields.io/badge/_-Vite-646CFF.svg?style=for-the-badge&logo=vite&logoColor=white&logoSize=auto)](https://vite.dev/)
  [![WebAssembly](https://img.shields.io/badge/_-WebAssembly-654FF0.svg?style=for-the-badge&logo=webassembly&logoColor=white&logoSize=auto)](https://webassembly.org/)
  [![WebUSB](https://img.shields.io/badge/_-WebUSB-005C84.svg?style=for-the-badge&logo=usb&logoColor=white&logoSize=auto)]()
  [![Docker](https://img.shields.io/badge/_-Docker-2496ED.svg?style=for-the-badge&logo=docker&logoColor=white&logoSize=auto)](https://www.docker.com/)
  [![Yosys](https://img.shields.io/badge/_-Yosys-FF8000.svg?style=for-the-badge&logoSize=auto)](https://yosyshq.net/yosys/)
  [![nextpnr](https://img.shields.io/badge/_-nextpnr-339933.svg?style=for-the-badge&logoSize=auto)](https://github.com/YosysHQ/nextpnr)
  [![FTDI](https://img.shields.io/badge/_-FT2232H-E31B23.svg?style=for-the-badge&logoSize=auto)](https://ftdichip.com/)
  [![Github](https://img.shields.io/badge/_-Github-181717.svg?style=for-the-badge&logo=github&logoColor=white&logoSize=auto)](https://github.com/)
</div>

[Español](#español) | [English](#english)

---

# Español

## 📄 Descripción general

**Lattice iCE40 WebUSB Flasher & Mini IDE** es un mini entorno de desarrollo integrado (IDE), sintetizador y grabador WebUSB/WebSerial que se ejecuta **100% en el navegador web**. Permite editar código Verilog, realizar síntesis lógica y *Place & Route* con la suite de herramientas abiertas (Yosys y nextpnr-ice40 compilados a WebAssembly), programar la memoria Flash SPI o la SRAM de FPGAs Lattice iCE40 directamente por USB y monitorear la comunicación serie UART en tiempo real.

Al ingresar por primera vez a la aplicación, se carga automáticamente un **starter puntual para cada placa seleccionada**: con solo enchufar la FPGA por USB, presionar **Compilar** y luego **Grabar**, la placa queda funcionando de inmediato con un ejemplo simple que maneja LEDs y transmite mensajes periódicos por UART para un rápido inicio. Siempre se puede volver al diseño inicial utilizando el botón **Reiniciar proyecto** de la barra de herramientas. La primera vez que se compila o graba se descargan los archivos necesarios a la cache del navegador (alrededor de 300MB), por lo que las siguientes veces la compilación y grabación es casi instantánea. No importa si reinicias la computadora o el navegador, la cache se mantiene y la aplicación sigue funcionando igual.

El proyecto está diseñado con fines educativos y de laboratorio para la carrera de **Ingeniería Electrónica en la UTN-FRT**, orientado a simplificar radicalmente el flujo de trabajo en diseño digital: sin necesidad de instalar suites EDA pesadas, cadenas de compilación locales ni configuraciones complejas de drivers. Además, en muchos laboratorios universitarios e institucionales no se permite la instalación de ningún software (por restricciones de permisos de administrador o congelamiento de terminales), por lo que alternativas tradicionales como Apio, OSS CAD Suite o incluso entornos locales con Docker complican el uso cotidiano. Esta herramienta viene a solucionar directamente estas dificultades ofreciendo una experiencia inmediata y sin fricción desde el navegador.

Proyecto funcionando en https://www.maxisimonazzi.com.ar/grabador-lattice-webusb/

---

## 🎯 Características principales

- **📝 Editor Verilog completo y análisis en tiempo real:**
  - Resaltado de sintaxis y autocompletado inteligente (palabras clave, primitivas `SB_*`, señales del archivo, instancias de módulos y snippets: `module`, `always`, `counter`, `fsm`, `debounce`, `pwm`, `rom`, `pll`).
  - Linter en tiempo real y subrayado de errores directamente en el código. En consola cada error aparece por separado con su número de línea; al hacer clic en el error te lleva directo a la línea correspondiente en el editor.
  - **Comprobación rápida sin compilar (`read_verilog` + `hierarchy -check`):** Valida la sintaxis, módulos faltantes y puertos en segundos sin tener que esperar el *Place & Route*.
  - **Validación inteligente de pines (`.pcf`):** Cruza en tiempo real las restricciones del archivo PCF contra los puertos del módulo *top*, alertando sobre puertos sin asignar, señales inexistentes o pines físicos duplicados antes de compilar.
  - **Explicaciones didácticas en lenguaje claro (`hints.ts`):** Traduce automáticamente los avisos y errores crípticos del sintetizador (latches inferidos, señales sin driver, identificadores implícitos, módulos no encontrados, etc.) a explicaciones sencillas con recomendaciones prácticas para corregirlos.

- **⚙️ Síntesis, Place & Route y análisis en el navegador (WebAssembly / YoWASP):**
  - Cadena EDA completa ejecutada en el cliente con `@yowasp/yosys` y `@yowasp/nextpnr-ice40`.
  - Generación de bitstreams `.bin` con `icepack`.
  - **Reporte interactivo de recursos y timing:** Ocupación de celdas lógicas (LC), bloques BRAM, pads IO y PLLs; análisis de frecuencia máxima operativa (**Fmax**) frente a la requerida (`set_frequency`), camino crítico e historial de compilaciones.
  - **Cancelación instantánea:** Posibilidad de abortar compilaciones en curso reiniciando el Web Worker en tiempo real.

- **🔌 Programación WebUSB de FPGAs (Canal A del FTDI FT2232H / MPSSE):**
  - **Grabado en memoria Flash SPI:** Escritura rápida optimizada con MPSSE, borrado por bloques/chip y **verificación byte a byte** automática contra el bitstream físico.
  - **Grabado directo en SRAM (volátil):** Programación ultrarrápida sin desgaste de Flash mediante bitbang por ADBUS2.
  - Control de líneas de estado y reset de hardware (`CRESET_B`, `CDONE`, `CS`).
  - Lectura y volcado de memoria Flash a archivo binario o visor hexadecimal integrado.

- **📡 Monitor Serie UART integrado (WebSerial / Canal B del FTDI FT2232H):**
  - Terminal serie integrada a 115200 baudios (8N1).
  - Vistas configurables: texto con marca de tiempo, visor hexadecimal, y **graficador en tiempo real** de señales numéricas.
  - Envío interactivo de comandos con búfer de historial (↑/↓) y exportación de logs.

- **🧰 Herramientas de productividad y utilidades:**
  - **Laboratorios de arranque (Starters):** Proyectos base adaptados automáticamente a cada placa con parpadeo de LEDs y mensajes serie.
  - **Gestor multiproyecto integrado:** Creación, edición, renombramiento, eliminación y cambio rápido entre múltiples proyectos guardados en el navegador.
  - **Asistente de PLL (`icepll`):** Cálculo automatizado de divisores e instanciación del módulo `SB_PLL40_*` en Verilog.
  - **Reemplazo rápido de BRAM (`icebram`):** Actualización instantánea del contenido de tablas ROM dentro del bitstream en menos de un segundo sin necesidad de volver a sintetizar.
  - **Descarga de artefactos intermedios:** Descarga directa de `.bin`, `.asc`, `.json` y `.pnr`.
  - **Importación y exportación a `.zip`:** Respaldo completo del proyecto (archivos `.v` y `.pcf`) en un archivo comprimido.
  - **Compartir proyectos por URL:** Enlace autocontenido comprimido en el hash (`#p=...`) para clonar el proyecto completo en otro navegador sin almacenar datos en servidores.
  - **File System Access API:** Apertura y sincronización directa con carpetas del disco local (Chrome/Edge).

- **🔒 Privacidad y funcionamiento offline:**
  - El código Verilog nunca abandona la máquina del usuario; el servidor sólo entrega archivos estáticos.
  - *Service Worker* integrado que almacena en caché los binarios WASM para permitir el trabajo continuo sin conexión a internet.
  - Almacenamiento local automático de proyectos, pestañas y configuraciones en `localStorage`.

---

## 🧩 Placas soportadas

La aplicacion soporta cualquier placa que tenga una FPGA iCE40 y un chip FTDI FT2232H. El usuario puede dar de alta otras placas para usarla con la aplicacion y los datos quedan guardados en su navegador. Para el que decida hospedar la aplicacion no hay problema de agregar placas adicionales en el repositorio, solo hay que definir los archivos de perfil para que la aplicacion sepa que pines usar y como programar el chip FTDI.

Por defecto vienen cargada 3 placas como ejemplo:

| Placa | FPGA | Encapsulado | Chip USB / Interfaz | Archivos de Perfil |
| :--- | :--- | :--- | :--- | :--- |
| **Azukar v2** | Lattice iCE40-HX4K | TQFP-144 | FTDI FT2232H (MPSSE + UART) | [`boards/azukar-v2/`](boards/azukar-v2/) |
| **Alhambra II** | Lattice iCE40-HX4K | TQFP-144 | FTDI FT2232H (MPSSE + UART) | [`boards/alhambra-ii/`](boards/alhambra-ii/) |
| **EDU-CIAA-FPGA** | Lattice iCE40-HX4K | TQFP-144 | FTDI FT2232H (MPSSE + UART) | [`boards/edu-ciaa-fpga/`](boards/edu-ciaa-fpga/) |
| **Placas personalizadas** | iCE40 (LP/HX/UP) | *Cualquiera* | FTDI FT2232H / compatible | *Configurable desde la UI* |

> [!NOTE]
> La definición de pines del FPGA se gestiona mediante el archivo `pins.pcf` propio de cada proyecto, otorgando total flexibilidad para reasignar señales y etiquetas.

---

## 🛠 Tecnologías utilizadas

- **Frontend:** [Vue.js 3](https://vuejs.org/) (Composition API), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS v4](https://tailwindcss.com/), [Vite](https://vite.dev/), [vue-i18n](https://vue-i18n.intlify.dev/).
- **Editor de código:** [CodeMirror 6](https://codemirror.net/) (`@codemirror/autocomplete`, `@codemirror/lint`, `@codemirror/search`).
- **EDA & Síntesis WebAssembly:** [YoWASP Project](https://yowasp.org/) ([Yosys](https://yosyshq.net/yosys/), [nextpnr-ice40](https://github.com/YosysHQ/nextpnr), [Project IceStorm](https://github.com/YosysHQ/icestorm)).
- **Hardware & Web APIs:** [WebUSB API](https://developer.mozilla.org/es/docs/Web/API/USB), [Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API), [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API).
- **Servidor & Despliegue:** [Docker](https://www.docker.com/), [Docker Compose](https://docs.docker.com/compose/), [Nginx](https://nginx.org/), [Caddy Server](https://caddyserver.com/) (TLS / HTTPS edge proxy).

---

## 🚀 Instalación y ejecución

Podes usar la aplicacion directamente en tu navegador desde este enlace: https://www.maxisimonazzi.com.ar/grabador-lattice-webusb/. Si optas por hospedar tu propia instancia de la aplicacion o si queres probarla para integrarla en tu aplicacion, podes hacerlo facilmente.

### Requisitos previos

- Navegador compatible con **WebUSB** y **WebSerial**: **Google Chrome** o **Microsoft Edge** (versión 89 o superior).
- [Docker](https://www.docker.com/) y [Docker Compose v2](https://docs.docker.com/compose/).

### 💻 Ejecución local (Windows / Linux / macOS)

1. Clonar el repositorio y acceder a la carpeta del proyecto:
   ```bash
   git clone https://github.com/maxisimonazzi/azukar-webusb-flasher.git
   cd azukar-webusb-flasher
   ```

2. Crear el archivo de variables de entorno:
   ```bash
   # En Windows (CMD / PowerShell):
   copy .env.example .env

   # En Linux / macOS:
   cp .env.example .env
   ```

3. Construir e iniciar el contenedor:
   ```bash
   docker compose up --build -d
   ```

4. Abrir en el navegador: [http://localhost:9090](http://localhost:9090)

> [!TIP]
> En entornos locales (`localhost`), los navegadores permiten el uso de WebUSB y WebSerial sobre HTTP sin restricciones de seguridad.

### 🌐 Despliegue en VPS / Servidor con HTTPS

WebUSB y WebSerial requieren un contexto seguro (**HTTPS**) cuando la aplicación se sirve desde un dominio o IP remota. Para desplegar en un servidor junto al proxy inverso Caddy:

1. Crear la red compartida y levantar el proxy de borde:
   ```bash
   docker network create edge
   (cd deploy/edge && docker compose up -d)
   ```

2. Configurar el prefijo de ruta en `.env` (ej. `BASE_PATH=/grabador-lattice-webusb`):
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.edge.yml up --build -d
   ```

Dentro del caddyfile hay que configurar segun el dominio que quieras usar.

---

## 🔌 Configuración de drivers en Windows

Para que WebUSB pueda comunicarse con el Canal A del chip FTDI FT2232H, el sistema operativo debe utilizar el driver genérico **WinUSB**.

### Opción recomendada (Instalador automatizado)
1. Conectar la placa FPGA por USB a la PC.
2. Ejecutar el instalador incluido: [`driver/driver_azukar.exe`](driver/driver_azukar.exe).
3. Aceptar la elevación de permisos (UAC). El script configurará automáticamente el **Canal A** en modo WinUSB sin alterar el **Canal B** (puerto COM serie).

### Opción alternativa (Zadig)
1. Abrir [Zadig](https://zadig.akeo.ie/).
2. Ir a **Options → List All Devices**.
3. Seleccionar **`USB Serial Converter A`** (Interface 0).
4. Elegir **WinUSB** como driver de destino y presionar **Replace Driver** (o *Install Driver*).
5. **No modificar** el driver de `USB Serial Converter B` para conservar el puerto serie UART.

---

## 📜 Atribuciones y agradecimientos

Este proyecto se apoya en el trabajo pionero del ecosistema de hardware abierto y herramientas EDA libres:

- **[Project IceStorm](https://github.com/YosysHQ/icestorm)** (Claire Xenia Wolf, Piotr Esden-Tempski, YosysHQ) por la herramienta `iceprog`, base del protocolo MPSSE.
- **[YoWASP Project](https://yowasp.org/)** (Catherine / *whitequark*) por las compilaciones WebAssembly de Yosys y nextpnr.
- **[Juan González-Gómez (*Obijuan*) / FPGAwars](https://github.com/Obijuan/Web-iceprog)** por el concepto de programación de FPGAs desde la web con `Web-iceprog`.
- **Jesús Arias** por diagnosticar y resolver el flujo de programación de la SRAM con `iceram.c`.

El detalle completo de licencias y créditos de terceros se encuentra en [ATTRIBUTIONS.md](ATTRIBUTIONS.md).

## Optimizaciones y features pendientes

- [X] Write-enable + page program viajan en un solo envío USB.
- [X] La espera de WIP arranca a fondo y solo después se espacia: el sleep fijo de 10 ms por página se comía ~4-5 s por bitstream.
- [X] La verificación pasó de comparar los primeros 256 bytes a comparar el bitstream entero, que ahora cuesta menos de un segundo.
- [X] Cada tarea reporta cuánto tardó y a qué velocidad.
- [ ] Tiempos de SRAM. Ya se bajo hasta 2,6s y el techo está medido: es WebUSB. Para bajarlo hay que encontrar cómo sacarle más throughput de escritura a Chrome, o aceptar el peaje del navegador.
- [ ] Una galería de ejemplos listos para abrir, además del laboratorio de cada placa o el starter basico.
- [ ] Los PCF ya son un archivo del proyecto, con chequeo contra los puertos del top y autocompletado de pines, pero se siguen editando a mano: falta poder definirlos de forma visual, en tabla aunque estoy evaluando si eso no rompe el flujo normal de trabajo.
- [ ] iceunpack e icemulti. Son las dos herramientas de IceStorm que todavía no están: volver del bitstream para atrás, e imágenes multiboot.
- [ ] Un gemelo digital virtual. Agradecimiento especial a @lmcapacho, la idea es suya, me encanta, y sus avances me parecen maravillosos. No se me había ocurrido y me quiero sentar a pensarla para compartirla con mis alumnos que usan Azukar.

## Agradezco feedback

Si pueden y tienen ganas, ingresen a https://www.maxisimonazzi.com.ar/grabador-lattice-webusb/, se abre y ya está, no hay que instalar nada. Con la primera compilada o grabada se descarga la toolchain y queda en cache para futuros usos. Me encantaría que la prueben y me den feedback:

- ¿Les resulta útil? ¿Le ven sentido para dar clase o para prototipar rápido?
- ¿Qué le sobra? Hay cosas que puse porque las necesitaba yo y capaz molestan.
- ¿Qué le falta para que la usen de verdad?
- Si tienen una Alhambra II o una iCEstick (o placas con FPGA ice40 y conexion por FTDI): ¿les anda el bit-bang de SRAM?
- Reportes de cualquier cosa rara con el driver en Windows.

---

## 📄 Licencia

Este proyecto está bajo la Licencia **MIT**. Para más información, consulte el archivo [LICENSE](LICENSE).

---

## ⚠️ Descargo de responsabilidad

Este software es un desarrollo independiente para herramientas de hardware libre. No está patrocinado, avalado ni afiliado oficialmente a Lattice Semiconductor ni a FTDI Chip.

---

# English

## 📄 Overview

**Lattice iCE40 WebUSB Flasher & Mini IDE** is a mini integrated development environment (IDE), synthesizer, and WebUSB/WebSerial flasher that runs **100% in the web browser**. It allows you to edit Verilog code, perform logic synthesis and *Place & Route* with the open-source toolchain (Yosys and nextpnr-ice40 compiled to WebAssembly), program the SPI Flash memory or SRAM of Lattice iCE40 FPGAs directly via USB, and monitor UART serial communication in real time.

When opening the application for the first time, a **tailored starter project is automatically loaded for each selected board**: simply by plugging in the FPGA via USB, clicking **Compile**, and then **Program**, the board immediately runs a simple example that drives LEDs and sends periodic UART messages for a quick start. You can always revert to the starter design using the **Reset Project** button in the toolbar. The first time you compile or program, the required files are downloaded to the browser cache (around 300MB), making subsequent compilations and flashing almost instantaneous. Even if you restart your computer or browser, the cache is preserved and the application continues to work seamlessly.

The project is designed for educational and laboratory purposes for the **Electronic Engineering degree at UTN-FRT**, aimed at radically simplifying the digital design workflow: without the need to install heavy EDA suites, local build chains, or complex driver configurations. Furthermore, in many university and institutional computer labs, installing software is strictly prohibited (due to lack of administrative privileges or disk freeze policies), making traditional alternatives such as Apio, OSS CAD Suite, or even local Docker setups difficult or impractical to use. This tool directly overcomes these hurdles by providing an instant, friction-free experience straight from the browser.

Live project running at https://www.maxisimonazzi.com.ar/grabador-lattice-webusb/

---

## 🎯 Key Features

- **📝 Full Verilog Editor and Real-Time Analysis:**
  - Syntax highlighting and smart autocompletion (keywords, `SB_*` primitives, file signals, module instances, and snippets: `module`, `always`, `counter`, `fsm`, `debounce`, `pwm`, `rom`, `pll`).
  - Real-time linter and error underlining directly in the code. In the console, each error is displayed separately with its line number; clicking on an error takes you directly to that line in the editor.
  - **Quick check without compiling (`read_verilog` + `hierarchy -check`):** Validates syntax, missing module instances, and port connections in seconds without waiting for *Place & Route*.
  - **Smart pin validation (`.pcf`):** Cross-checks PCF file constraints in real time against the *top* module's ports, warning about unassigned ports, non-existent signals, or duplicate physical pins before compiling.
  - **Educational explanations in plain language (`hints.ts`):** Automatically translates cryptic synthesis warnings and errors (inferred latches, undriven signals, implicit identifiers, missing modules, etc.) into clear explanations with actionable tips to fix them.

- **⚙️ In-Browser Synthesis, Place & Route, and Analysis (WebAssembly / YoWASP):**
  - Complete EDA toolchain executed on the client side with `@yowasp/yosys` and `@yowasp/nextpnr-ice40`.
  - Bitstream generation (`.bin`) with `icepack`.
  - **Interactive resource utilization and timing report:** Logic cells (LC), BRAM blocks, IO pads, and PLLs; maximum operating frequency analysis (**Fmax**) against requested clock constraints (`set_frequency`), critical path inspection, and build history.
  - **Instant cancellation:** Ability to abort running synthesis jobs by recreating the Web Worker in real time.

- **🔌 WebUSB FPGA Programming (FTDI FT2232H Channel A / MPSSE):**
  - **SPI Flash memory programming:** Fast write optimized with MPSSE, block/chip erase, and automatic **byte-by-byte hardware verification** against the physical bitstream.
  - **Direct SRAM programming (volatile):** Ultra-fast programming without Flash wear via bitbang over ADBUS2.
  - Status lines and hardware reset control (`CRESET_B`, `CDONE`, `CS`).
  - Read and dump Flash memory to a binary file or integrated hexadecimal viewer.

- **📡 Integrated UART Serial Monitor (WebSerial / FTDI FT2232H Channel B):**
  - Integrated serial terminal at 115200 baud (8N1).
  - Configurable views: timestamped text, hexadecimal viewer, and **real-time plotting** of numerical signals.
  - Command sender with interactive history buffer (↑/↓) and log export.

- **🧰 Productivity Tools and Utilities:**
  - **Starter Labs:** Pre-configured starter designs tailored for each board with LED blinking and serial messages.
  - **Integrated Multi-Project Manager:** Create, edit, rename, delete, and switch quickly between multiple projects saved in the browser.
  - **PLL Assistant (`icepll`):** Automated divisor calculation and instantiation of the `SB_PLL40_*` Verilog module.
  - **Fast BRAM replacement (`icebram`):** Instant update of ROM table contents inside the bitstream in under a second without resynthesizing.
  - **Intermediate artifact download:** Direct download of `.bin`, `.asc`, `.json`, and `.pnr`.
  - **Zip Import and Export:** Complete project backup (`.v` and `.pcf` files) into a compressed `.zip` archive.
  - **Share projects via URL:** Self-contained link compressed in the hash (`#p=...`) to clone the complete workspace in another browser without server storage.
  - **File System Access API:** Direct opening and synchronization with local disk folders (Chrome/Edge).

- **🔒 Privacy and Offline Operation:**
  - Verilog code never leaves the user's computer; the server only serves static files.
  - Integrated *Service Worker* that caches WASM binaries to allow continuous work without an internet connection.
  - Automatic local storage of projects, tabs, and settings in `localStorage`.

---

## 🧩 Supported Boards

The application supports any board with a Lattice iCE40 FPGA and an FTDI FT2232H chip. Users can add custom boards to use with the application, and the settings remain saved in their browser. For anyone hosting the application, additional boards can easily be added to the repository by defining the profile files so the app knows which pins to use and how to program the FTDI chip.

By default, 3 boards are pre-configured as examples:

| Board | FPGA | Package | USB Chip / Interface | Profile Files |
| :--- | :--- | :--- | :--- | :--- |
| **Azukar v2** | Lattice iCE40-HX4K | TQFP-144 | FTDI FT2232H (MPSSE + UART) | [`boards/azukar-v2/`](boards/azukar-v2/) |
| **Alhambra II** | Lattice iCE40-HX4K | TQFP-144 | FTDI FT2232H (MPSSE + UART) | [`boards/alhambra-ii/`](boards/alhambra-ii/) |
| **EDU-CIAA-FPGA** | Lattice iCE40-HX4K | TQFP-144 | FTDI FT2232H (MPSSE + UART) | [`boards/edu-ciaa-fpga/`](boards/edu-ciaa-fpga/) |
| **Custom Boards** | iCE40 (LP/HX/UP) | *Any* | FTDI FT2232H / compatible | *Configurable from the UI* |

> [!NOTE]
> FPGA pin definitions are managed via the project's own `pins.pcf` file, giving total flexibility to reassign signals and labels.

---

## 🛠 Built With / Technologies

- **Frontend:** [Vue.js 3](https://vuejs.org/) (Composition API), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS v4](https://tailwindcss.com/), [Vite](https://vite.dev/), [vue-i18n](https://vue-i18n.intlify.dev/).
- **Code Editor:** [CodeMirror 6](https://codemirror.net/) (`@codemirror/autocomplete`, `@codemirror/lint`, `@codemirror/search`).
- **EDA & WebAssembly Synthesis:** [YoWASP Project](https://yowasp.org/) ([Yosys](https://yosyshq.net/yosys/), [nextpnr-ice40](https://github.com/YosysHQ/nextpnr), [Project IceStorm](https://github.com/YosysHQ/icestorm)).
- **Hardware & Web APIs:** [WebUSB API](https://developer.mozilla.org/en-US/docs/Web/API/USB), [Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API), [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API).
- **Server & Deployment:** [Docker](https://www.docker.com/), [Docker Compose](https://docs.docker.com/compose/), [Nginx](https://nginx.org/), [Caddy Server](https://caddyserver.com/) (TLS / HTTPS edge proxy).

---

## 🚀 Installation and Deployment

You can use the application directly in your browser at this link: https://www.maxisimonazzi.com.ar/grabador-lattice-webusb/. If you choose to host your own instance or test it for integration into your app, you can easily do so.

### Prerequisites

- Browser compatible with **WebUSB** and **WebSerial**: **Google Chrome** or **Microsoft Edge** (version 89 or higher).
- [Docker](https://www.docker.com/) and [Docker Compose v2](https://docs.docker.com/compose/).

### 💻 Local Execution (Windows / Linux / macOS)

1. Clone the repository and navigate to the project directory:
   ```bash
   git clone https://github.com/maxisimonazzi/azukar-webusb-flasher.git
   cd azukar-webusb-flasher
   ```

2. Create the environment configuration file:
   ```bash
   # On Windows (CMD / PowerShell):
   copy .env.example .env

   # On Linux / macOS:
   cp .env.example .env
   ```

3. Build and start the container:
   ```bash
   docker compose up --build -d
   ```

4. Open in browser: [http://localhost:9090](http://localhost:9090)

> [!TIP]
> In local environments (`localhost`), browsers allow the use of WebUSB and WebSerial over HTTP without security restrictions.

### 🌐 VPS / Production Server Deployment with HTTPS

WebUSB and WebSerial require a secure context (**HTTPS**) when the application is served from a remote domain or IP. To deploy on a server behind the Caddy reverse proxy:

1. Create the shared network and launch the edge proxy:
   ```bash
   docker network create edge
   (cd deploy/edge && docker compose up -d)
   ```

2. Configure the route prefix in `.env` (e.g. `BASE_PATH=/grabador-lattice-webusb`):
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.edge.yml up --build -d
   ```

Inside the Caddyfile, adjust the configuration according to the domain you want to use.

---

## 🔌 Windows Driver Setup

For WebUSB to communicate with Channel A of the FTDI FT2232H chip, the operating system must use the generic **WinUSB** driver.

### Recommended Option (Automated Installer)
1. Connect the FPGA board to the PC via USB.
2. Run the included installer: [`driver/driver_azukar.exe`](driver/driver_azukar.exe).
3. Accept the permission elevation (UAC). The script will automatically configure **Channel A** in WinUSB mode without altering **Channel B** (serial COM port).

### Alternative Option (Zadig)
1. Open [Zadig](https://zadig.akeo.ie/).
2. Go to **Options → List All Devices**.
3. Select **`USB Serial Converter A`** (Interface 0).
4. Choose **WinUSB** as the target driver and click **Replace Driver** (or *Install Driver*).
5. **Do not modify** the driver for `USB Serial Converter B` to preserve the UART serial port.

---

## 📜 Attributions and Acknowledgments

This project relies on the pioneering work of the open hardware and free EDA tool ecosystem:

- **[Project IceStorm](https://github.com/YosysHQ/icestorm)** (Claire Xenia Wolf, Piotr Esden-Tempski, YosysHQ) for the `iceprog` tool, the foundation of the MPSSE protocol.
- **[YoWASP Project](https://yowasp.org/)** (Catherine / *whitequark*) for the WebAssembly builds of Yosys and nextpnr.
- **[Juan González-Gómez (*Obijuan*) / FPGAwars](https://github.com/Obijuan/Web-iceprog)** for the concept of programming FPGAs from the web with `Web-iceprog`.
- **Jesús Arias** for diagnosing and solving the SRAM programming flow with `iceram.c`.

Full details of third-party licenses and credits can be found in [ATTRIBUTIONS.md](ATTRIBUTIONS.md).

## Optimizations & Pending Features

- [X] Write-enable + page program are batched into a single USB transfer.
- [X] WIP polling starts aggressively and backs off: the fixed 10 ms sleep per page used to take ~4-5 s per bitstream.
- [X] Verification now compares the entire bitstream instead of just the first 256 bytes, taking under a second.
- [X] Every long task reports elapsed time and throughput.
- [ ] SRAM flashing times. It has already been reduced to 2.6s and the bottleneck is known: it is WebUSB. To lower it further, we need to find how to get higher write throughput out of Chrome, or accept the browser overhead.
- [ ] A ready-to-open examples gallery, beyond each board's starter lab or basic starter.
- [ ] PCFs are already project files with top module port checking and pin autocomplete, but are still edited manually: a visual table-based pin editor is missing (though evaluating if this would break the natural workflow).
- [ ] `iceunpack` and `icemulti`. The two IceStorm tools not yet integrated: bitstream reversal and multiboot images.
- [ ] A virtual digital twin. Special thanks to @lmcapacho; the idea is theirs, I love it, and their progress is amazing. I hadn't thought of it and want to explore it to share with my students using Azukar.

## Feedback Welcome

If you'd like to test it out, visit https://www.maxisimonazzi.com.ar/grabador-lattice-webusb/ — just open it and go, nothing to install. The toolchain downloads on the first compile or flash and stays cached for future use. I'd love for you to try it and give feedback:

- Is it useful to you? Does it make sense for teaching or rapid prototyping?
- What is unnecessary? There are things I added for my own needs that might get in the way.
- What is missing for you to use it in real workflows?
- If you have an Alhambra II or an iCEstick (or any board with an iCE40 FPGA and FTDI connection): does SRAM bit-banging work for you?
- Reports of anything unusual with the Windows driver.

---

## 📄 License

This project is licensed under the **MIT License**. For more information, see the [LICENSE](LICENSE) file.

---

## ⚠️ Disclaimer

This software is an independent development for open-source hardware tools. It is not officially sponsored, endorsed, or affiliated with Lattice Semiconductor or FTDI Chip.