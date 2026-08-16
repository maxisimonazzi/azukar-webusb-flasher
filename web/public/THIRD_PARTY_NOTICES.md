# Third-party notices

Fonts, FPGA tools, and code this app ports or bundles.

| Piece | License | Use |
|-------|---------|-----|
| IceStorm `iceprog.c` (YosysHQ/icestorm) | ISC | Ported: GPIO encoding, flash/SRAM/MPSSE sequence (`iceprogPins.ts`, `mpsse.ts`, `programmer.ts`, `flashPlan.ts`) |
| Web-iceprog (Juan González-Gómez, Obijuan) | — | Inspiration only. Not used as source. See below. |
| Inter (`@fontsource/inter`) | OFL | UI sans |
| JetBrains Mono (`@fontsource/jetbrains-mono`) | OFL | Editor / logs |
| Yosys (YoWASP `@yowasp/yosys` 0.68.1207) | ISC | Synthesis (`synth_ice40`) in the browser |
| nextpnr-ice40 + icepack (YoWASP `@yowasp/nextpnr-ice40` 0.11.825) | ISC | Place & route / pack in the browser |
| Yosys / nextpnr / IceStorm (Debian, stack viejo en :8080) | ISC | Síntesis en el contenedor, otro compose |
| Vue, Vite, Tailwind, CodeMirror | MIT | SPA |
| Caddy (opcional, VPS) | Apache-2.0 | Reverse proxy + Let’s Encrypt |

OFL copies: `web/public/fonts/`.

This app: MIT (`LICENSE`). `boards/azukar-v2/pins.pcf`: CERN OHL-P. `boards/edu-ciaa-fpga/pins.pcf` and `boards/alhambra-ii/pins.pcf`: GPL-2.0 (FPGAwars/apio-examples).

## IceStorm iceprog (ISC)

The WebUSB programmer is a port of IceStorm `iceprog.c`, not a clean-room rewrite.
Source: https://github.com/YosysHQ/icestorm/blob/master/iceprog/iceprog.c

```
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

## Web-iceprog (Obijuan)

Juan González-Gómez (Obijuan), https://github.com/Obijuan/Web-iceprog

That repo is a WebUSB ice40 programmer in the same family as IceStorm iceprog. This app does **not** include or port its code. Reading it (with AI assistance) was the starting map for how to approach a browser programmer, before porting IceStorm `iceprog.c` directly.

