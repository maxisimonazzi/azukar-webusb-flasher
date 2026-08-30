# Third-Party Notices & Attributions

This document details all third-party open-source software, fonts, toolchains, hardware constraint files, and prior art inspirations included in, ported to, or bundled with **Lattice iCE40 FPGA Web Flasher**.

---

## Summary of Components & Licenses

| Component / Project | Author / Copyright Holder | License | Role in this Project |
| :--- | :--- | :--- | :--- |
| **IceStorm (`iceprog.c`)** | Claire Xenia Wolf, Piotr Esden-Tempski, YosysHQ | **ISC** | Direct TypeScript port (`mpsse.ts`, `programmer.ts`, `iceprogPins.ts`, `flashPlan.ts`) of FTDI MPSSE engine, SPI flash erase/read/write routines, and GPIO sequences. |
| **IceStorm (`icepll`, `icebram`, `icepack`)** | Claire Xenia Wolf, YosysHQ | **ISC** | Logic for PLL calculations, BRAM bitstream memory patching, and packing. |
| **`iceram.c` / openFPGALoader** | Jesús Arias (2017), Gwenhael Goavec-Merou | **GPL / Reference** | Reference for asynchronous bitbang SRAM slave mode (SPI Mode 3, clock idle high, latency timings). |
| **Web-iceprog / WebFPGA** | Juan González-Gómez (*Obijuan*) | **GPL-2.0 / Reference** | **Conceptual inspiration** for browser-based WebUSB FPGA flashing without native drivers. |
| **Yosys** (via YoWASP `@yowasp/yosys`) | Claire Xenia Wolf, YosysHQ Contributors | **ISC** | Verilog synthesis engine (`synth_ice40`) compiled to WebAssembly running in-browser. |
| **nextpnr-ice40** (via YoWASP `@yowasp/nextpnr-ice40`) | David Shah (Gatecat), Serge Bazanski, Miodrag Milanovic | **ISC** | Place & Route engine compiled to WebAssembly running in-browser. |
| **YoWASP Project** | Catherine (*whitequark*) | **ISC / MIT / BSD** | WebAssembly compilation and runtime wrappers for open-source EDA tools. |
| **OSS CAD Suite** | YosysHQ | **ISC / GPL / Apache** | Reference toolchain distribution and core open-source FPGA ecosystem. |
| **Alhambra II (`pins.pcf`)** | Juan González (*Obijuan*), Jesús Arroyo Torrens, FPGAwars | **GPL-2.0** | Pin constraints definition for Alhambra II board. |
| **EDU-CIAA-FPGA (`pins.pcf`)** | Proyecto CIAA / ACSE / INTI | **GPL-2.0** | Pin constraints definition for EDU-CIAA-FPGA board. |
| **Azukar v2 (`pins.pcf`)** | Maximiliano Martín Simonazzi | **CERN-OHL-P v2** | Pin constraints definition for Azukar v2 board. |
| **Inter Font** | Rasmus Andersson | **OFL-1.1** | UI sans-serif typography (`@fontsource/inter`). |
| **JetBrains Mono** | JetBrains | **OFL-1.1** | Monospace typography for Verilog editor and logs (`@fontsource/jetbrains-mono`). |
| **CodeMirror 6** | Marijn Haverbeke & contributors | **MIT** | Web code editor, syntax highlighting, autocompletion, and linter. |
| **Vue.js 3** | Evan You & contributors | **MIT** | Reactive frontend UI framework. |
| **Vite** | Evan You & contributors | **MIT** | Build tool and bundler. |
| **Tailwind CSS** | Tailwind Labs, Inc. | **MIT** | Utility-first CSS styling framework. |
| **vue-i18n** | Kazuya Kawaguchi & contributors | **MIT** | Internationalization library (ES / EN). |
| **Caddy Server** *(optional deployment)* | Matthew Holt & The Caddy Authors | **Apache-2.0** | HTTPS edge reverse proxy and TLS manager. |
| **Nginx** *(container)* | Igor Sysoev, Nginx, Inc. | **2-Clause BSD** | Static web server inside containerized deployment. |

---

## IceStorm `iceprog.c` (ISC License)

The WebUSB flashing implementation in `web/src/fpga/` is a direct TypeScript port of `iceprog.c` from **Project IceStorm** (YosysHQ).
Source: [https://github.com/YosysHQ/icestorm/blob/master/iceprog/iceprog.c](https://github.com/YosysHQ/icestorm/blob/master/iceprog/iceprog.c)

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

## Inspiration & Community Prior Art

### Juan González-Gómez (*Obijuan*) — Web-iceprog / FPGAwars
- **Repository**: [https://github.com/Obijuan/Web-iceprog](https://github.com/Obijuan/Web-iceprog)
- **Community**: [FPGAwars](https://github.com/FPGAwars)

Special thanks and acknowledgement to **Juan González-Gómez (*Obijuan*)** for his pioneering open-source work in community FPGA education and browser-based WebUSB programming. `Web-iceprog` and FPGAwars served as a vital **conceptual inspiration** proving the feasibility of WebUSB programming for Lattice FPGAs.

### Jesús Arias — `iceram.c`
- **Reference**: Asynchronous bitbang timing sequences and SPI mode 3 state handling for volatile iCE40 CRAM configuration.

---

## Fonts (SIL Open Font License 1.1)

Font license texts are available at `web/public/fonts/`:
- **Inter**: `web/public/fonts/OFL-Inter.txt` (Rasmus Andersson)
- **JetBrains Mono**: `web/public/fonts/OFL-JetBrainsMono.txt` (JetBrains)

---

## Application License

This application is released under the **MIT License** (see [LICENSE](../../LICENSE)).
