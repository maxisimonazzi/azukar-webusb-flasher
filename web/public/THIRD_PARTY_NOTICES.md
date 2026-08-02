# Third-party notices

Fonts and FPGA tools bundled or used at runtime.

| Piece | License | Use |
|-------|---------|-----|
| Inter (`@fontsource/inter`) | OFL | UI sans |
| JetBrains Mono (`@fontsource/jetbrains-mono`) | OFL | Editor / logs |
| Yosys (YoWASP `@yowasp/yosys` 0.68.1207) | ISC | Synthesis (`synth_ice40`) in the browser |
| nextpnr-ice40 + icepack (YoWASP `@yowasp/nextpnr-ice40` 0.11.825) | ISC | Place & route / pack in the browser |
| Yosys / nextpnr / IceStorm (Debian, stack viejo en :8080) | ISC | Síntesis en el contenedor, otro compose |
| Vue, Vite, Tailwind, CodeMirror | MIT | SPA |
| Caddy (opcional, VPS) | Apache-2.0 | Reverse proxy + Let’s Encrypt |

OFL copies: `web/public/fonts/`.

This app: MIT (`LICENSE`). `boards/azukar-v2/pins.pcf`: CERN OHL-P. `boards/edu-ciaa-fpga/pins.pcf` and `boards/alhambra-ii/pins.pcf`: GPL (FPGAwars/apio-examples).
