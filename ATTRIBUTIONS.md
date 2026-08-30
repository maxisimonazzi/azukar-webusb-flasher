# Atribuciones y Avisos de Terceros (Third-Party Notices)

Este documento detalla todas las herramientas de software libre, bibliotecas, tipografías, especificaciones de hardware, esquemas de pines y proyectos de referencia utilizados, portados o tomados como inspiración en **Lattice iCE40 FPGA Web Flasher**.

---

## 1. Resumen de Componentes y Licencias

| Componente / Proyecto | Autor / Titular de Derechos | Licencia | Rol en este Proyecto |
| :--- | :--- | :--- | :--- |
| **IceStorm (`iceprog.c`)** | Claire Xenia Wolf, Piotr Esden-Tempski, YosysHQ | **ISC** | Port directo a TypeScript (`mpsse.ts`, `programmer.ts`, `iceprogPins.ts`, `flashPlan.ts`) del protocolo MPSSE, lectura/escritura/borrado de Flash SPI y secuencias GPIO. |
| **IceStorm (`icepll`, `icebram`, `icepack`)** | Claire Xenia Wolf, YosysHQ | **ISC** | Lógica de cálculo de divisores PLL, reemplazo de bloques BRAM y empaquetado de bitstream. |
| **`iceram.c` / openFPGALoader** | Jesús Arias (2017), Gwenhael Goavec-Merou | **GPL / Referencia** | Referencia para la secuencia de inicialización SRAM Slave en modo bitbang (SPI Modo 3 y tiempos de latencia). |
| **Web-iceprog / WebFPGA** | Juan González-Gómez (*Obijuan*) | **GPL-2.0 / Referencia** | **Inspiración conceptual y técnica** para la programación de FPGAs Lattice iCE40 directamente desde el navegador web vía WebUSB. |
| **Yosys** (vía YoWASP `@yowasp/yosys`) | Claire Xenia Wolf, YosysHQ Contributors | **ISC** | Motor de síntesis Verilog (`synth_ice40`) ejecutado en WebAssembly en el navegador. |
| **nextpnr-ice40** (vía YoWASP `@yowasp/nextpnr-ice40`) | David Shah (Gatecat), Serge Bazanski, Miodrag Milanovic | **ISC** | Motor de *Place & Route* para iCE40 ejecutado en WebAssembly en el navegador. |
| **YoWASP Project** | Catherine (*whitequark*) | **ISC / MIT / BSD** | Runtime y empaquetado WebAssembly de la suite EDA (Yosys, nextpnr, icepack). |
| **OSS CAD Suite** | YosysHQ | **ISC / GPL / Apache** | Suite de herramientas de referencia y base del ecosistema iCE40 de código abierto. |
| **Alhambra II (`pins.pcf`)** | Juan González (*Obijuan*), Jesús Arroyo Torrens, FPGAwars | **GPL-2.0** | Archivo de restricciones y asignación de pines de la placa Alhambra II. |
| **EDU-CIAA-FPGA (`pins.pcf`)** | Proyecto CIAA / ACSE / INTI | **GPL-2.0** | Archivo de restricciones y asignación de pines de la placa EDU-CIAA-FPGA. |
| **Azukar v2 (`pins.pcf`)** | Maximiliano Martín Simonazzi | **CERN-OHL-P v2** | Archivo de restricciones y mapa de pines de la placa Azukar v2. |
| **Inter Font** | Rasmus Andersson | **OFL-1.1** | Tipografía de interfaz (`@fontsource/inter`). |
| **JetBrains Mono** | JetBrains | **OFL-1.1** | Tipografía monoespaciada para el editor Verilog y consolas (`@fontsource/jetbrains-mono`). |
| **CodeMirror 6** | Marijn Haverbeke y colaboradores | **MIT** | Componentes del editor de código, resaltado de sintaxis, autocompletado y linter. |
| **Vue.js 3** | Evan You y colaboradores | **MIT** | Framework reactivo de frontend. |
| **Vite** | Evan You y colaboradores | **MIT** | Entorno de desarrollo y empaquetador de la aplicación web. |
| **Tailwind CSS** | Tailwind Labs, Inc. | **MIT** | Framework de estilos CSS utilitarios. |
| **vue-i18n** | Kazuya Kawaguchi y colaboradores | **MIT** | Motor de internacionalización (español / inglés). |
| **Caddy Server** *(opcional en despliegue)* | Matthew Holt y The Caddy Authors | **Apache-2.0** | Servidor web perimetral HTTPS y proxy inverso. |
| **Nginx** *(contenedor web)* | Igor Sysoev, Nginx, Inc. | **2-Clause BSD** | Servidor estático para la SPA en entornos contenerizados. |

---

## 2. Código Portado y Derivado Directamente

### Project IceStorm — `iceprog.c` (Licencia ISC)
El módulo de comunicación WebUSB con el chip FTDI y la memoria SPI Flash es una adaptación directa en TypeScript/WebUSB de la implementación de `iceprog.c` perteneciente al **Project IceStorm** (YosysHQ).

- **Repositorio original**: [https://github.com/YosysHQ/icestorm](https://github.com/YosysHQ/icestorm)

#### Texto de la Licencia ISC de `iceprog`:
```text
iceprog -- simple programming tool for FTDI-based Lattice iCE programmers

Copyright (C) 2015 Claire Xenia Wolf <claire@clairexen.net>
Copyright (C) 2018 Piotr Esden-Tempski <piotr@esden.net>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

---

## 3. Reconocimiento e Inspiración Conceptual

### Juan González-Gómez (*Obijuan*) — Web-iceprog / FPGAwars
- **Repositorio**: [https://github.com/Obijuan/Web-iceprog](https://github.com/Obijuan/Web-iceprog)
- **Comunidad**: [FPGAwars](https://github.com/FPGAwars)

Se agradece y reconoce especialmente la labor pionera de **Juan González-Gómez (*Obijuan*)** en la difusión del hardware libre y la programación de FPGAs en el navegador. Su proyecto `Web-iceprog` y el ecosistema de FPGAwars sirvieron como **inspiración inicial fundamental** para validar la viabilidad de programar chips iCE40 mediante el estándar WebUSB sin intermediación de drivers nativos pesados. Aunque la implementación interna de este proyecto fue reescrita directamente a partir de las especificaciones de `iceprog.c` y las especificaciones de FTDI, el trabajo de Obijuan marcó el camino a seguir.

### Jesús Arias — `iceram.c`
- **Referencia**: Secuencia de inicialización en modo bitbang asíncrono y temporización para programación directa en la SRAM volátil de chips Lattice iCE40.
- **Implementación derivada**: Lógica de respaldo (*fallback*) y modos de reloj en `web/src/fpga/mpsse.ts`.

---

## 4. Cadena de Herramientas EDA en WebAssembly

### YoWASP Project y YosysHQ (OSS CAD Suite)
- **YoWASP**: Mantenido por Catherine (*whitequark*) ([https://yowasp.org/](https://yowasp.org/)).
- **Yosys**: Desarrollado por Claire Xenia Wolf y colaboradores de YosysHQ ([https://yosyshq.net/yosys/](https://yosyshq.net/yosys/)).
- **nextpnr**: Desarrollado por David Shah, Serge Bazanski, Miodrag Milanovic y la comunidad de YosysHQ.

Las herramientas de síntesis, place & route y empaquetado corren completamente del lado del cliente mediante WebAssembly, manteniendo sus respectivas licencias permisivas ISC.

---

## 5. Especificaciones de Placas y Pines (`.pcf`)

- **Alhambra II** (`boards/alhambra-ii/pins.pcf`): Diseñado por Juan González (*Obijuan*) y Jesús Arroyo Torrens para FPGAwars. Licencia: **GPL-2.0**.
- **EDU-CIAA-FPGA** (`boards/edu-ciaa-fpga/pins.pcf`): Diseñado por el equipo del Proyecto CIAA / ACSE / INTI. Licencia: **GPL-2.0**.
- **Azukar v2** (`boards/azukar-v2/pins.pcf`): Diseñado por Maximiliano Martín Simonazzi. Licencia: **CERN-OHL-P v2**.

---

## 6. Tipografías (SIL Open Font License 1.1)

### Inter Font
- **Autor**: Rasmus Andersson ([https://rsms.me/inter/](https://rsms.me/inter/))
- **Licencia**: SIL Open Font License 1.1 (`web/public/fonts/OFL-Inter.txt`).

### JetBrains Mono
- **Autor**: JetBrains ([https://www.jetbrains.com/lp/mono/](https://www.jetbrains.com/lp/mono/))
- **Licencia**: SIL Open Font License 1.1 (`web/public/fonts/OFL-JetBrainsMono.txt`).

#### Términos de la Licencia OFL-1.1 (Resumen):
Se permite el uso, estudio, copia, fusión, inserción, modificación y redistribución de las tipografías de forma libre, siempre que no se vendan por sí solas y se mantengan los créditos y avisos de derechos de autor.

---

## 7. Dependencias Web (Licencia MIT)

Las siguientes dependencias se distribuyen bajo los términos de la Licencia MIT:

- **Vue.js 3**: `Copyright (c) 2014-present Evan You`
- **CodeMirror 6**: `Copyright (c) 2018-present Marijn Haverbeke and contributors`
- **Tailwind CSS**: `Copyright (c) Tailwind Labs, Inc.`
- **Vite**: `Copyright (c) 2019-present Evan You & Vite Contributors`
- **vue-i18n**: `Copyright (c) 2016-present kazuya kawaguchi`

#### Texto de la Licencia MIT estándar:
```text
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 8. Infraestructura y Servidores

- **Caddy Web Server**: Copyright (c) Matthew Holt and The Caddy Authors. Licenciado bajo **Apache License, Version 2.0**.
- **Nginx**: Copyright (c) Igor Sysoev, Nginx, Inc. Licenciado bajo la **licencia BSD de 2 cláusulas**.

---

## 9. Licencia del Proyecto Principal

Este proyecto principal se publica bajo la Licencia **MIT** (consulte el archivo [LICENSE])
