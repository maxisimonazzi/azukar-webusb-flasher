# Cómo usar esta página

Esta app corre en el navegador. Editás Verilog, compilás a un `.bin` iCE40 y, en Chrome o Edge, grabás la placa por USB. No hay cuenta ni servidor de usuarios.

**Antes de compilar, elegí la placa** arriba a la derecha. Eso define el chip (device/package de nextpnr) y cómo se conecta el programador al FTDI. Los pines del FPGA no salen de ahí: salen de `pins.pcf`, un archivo más del proyecto que podés editar.

Al elegir una placa, su `pins.pcf` de ejemplo se carga como archivo. Cambiale los nombres de las señales, agregá pines o poné el tuyo: es tu archivo.

## Paneles

- **Árbol de archivos (izquierda).** Lista los `.v` y el `pins.pcf` del proyecto. El **módulo top** es el que Yosys sintetiza.
- **Editor (centro).** El Verilog de la pestaña activa. Podés importar o exportar un zip del proyecto.
- **Programador (arriba a la derecha).** Consola de síntesis y de WebUSB (canal A del FTDI): conectar, compilar, grabar flash/SRAM, borrar, leer, reset.
- **UART (abajo a la derecha).** WebSerial, canal B. Texto que manda la FPGA (por ejemplo `Hola UART`).

## Archivos y pestañas

- **+** crea un `.v` nuevo (en el árbol o junto a las pestañas).
- Un click en el árbol abre el archivo. **Doble click** (árbol o pestaña) cambia el nombre.
- **×** en la pestaña la cierra pero el archivo sigue en el árbol. **×** en el árbol borra el archivo (tiene que quedar al menos uno).
- **Importar / exportar proyecto** mueve un zip con los `.v`, el `.pcf` y los `.txt`. No se guarda en el servidor.
- El proyecto queda guardado en **este** navegador (`localStorage`): si recargás o cerrás la pestaña, vuelve como lo dejaste. En otra PC no está: para eso exportá el zip.
- **Reiniciar proyecto** (el ícono de la flecha circular) borra lo guardado y vuelve al laboratorio de la placa activa. Avisa antes.

## Consolas

- **Consola del programador.** Log de compile (Yosys → nextpnr → icepack) y del grabado USB. Si el compile terminó bien, aparece un enlace para **descargar el `.bin`**.
- **Consola UART.** Solo lo que entra por el puerto serie. No mezcla la síntesis.

## Botones del programador

- **Conectar programador.** Chrome muestra el picker USB. Elegí el FTDI, canal A (programador), no el COM del UART.
- **Desconectar.** Suelta el WebUSB.
- **Compilar.** Sintetiza el Verilog de esta ventana para **la placa seleccionada**. El `.bin` queda en memoria; no se sube a ningún servidor.
- **Grabar en flash.** Escribe el `.bin` compilado, o uno que subas, en la SPI. Sobrevive un reset o un corte de USB.
- **Grabar en SRAM.** Carga el bitstream en la FPGA sin tocar la flash. Se pierde al resetear o al desconectar.
- **Borrar flash.** Deja la SPI vacía.
- **Leer flash / EEPROM.** Baja o muestra el contenido (bin, hex o consola).
- **Reset.** Recarga la FPGA desde la flash (como un reset de la placa).

Cada **Grabar** tiene dos entradas: el `.bin` que acabás de compilar, o **subir un `.bin` externo**.

## Cómo conectar la placa

1. Elegí la placa en el selector (Azukar v2, Alhambra II, EDU-CIAA-FPGA, o una personalizada).
2. Enchufala por USB. Chrome o Edge.
3. **Conectar programador** → canal A.
4. Para ver el serial: **Conectar UART** → canal B / *USB Serial Converter B*, baud **115200** 8N1.

### Windows y drivers

El canal A del FTDI tiene que estar en **WinUSB** para WebUSB. Zadig → Options → List All Devices → `USB Serial Converter A` (Interface 0) → WinUSB. No libusbK. **No le cambies el driver al canal B** (UART). Cerrá iceprog, Diamond Programmer y cualquier terminal que tenga tomado el COM.

**Windows 10 — lectura de flash.** En algunos controladores USB de Windows 10, leer la flash puede fallar con "paquete USB corto". Si pasa:

1. Probá el botón **Reconectar USB** que aparece después del error. Resetea el pipe sin reinstalar el driver.
2. Si no alcanza, **desenchufá la placa, esperá unos segundos, y volvé a enchufar**. No hace falta correr Zadig de nuevo.
3. Si sigue fallando, probá **otro puerto USB** (trasero, sin hub). Compilar y grabar la flash/SRAM no usan este camino y deberían andar igual.

Linux y macOS suelen andar sin Zadig. Hace falta HTTPS (o localhost) para WebUSB.

Firefox no tiene WebUSB: podés editar y compilar, pero no grabar.

## Qué pasa al compilar

Yosys → nextpnr-ice40 → icepack, con el `pins.pcf` del proyecto y el device/package de la placa activa. El resultado es un bitstream `.bin`.

Tiene que haber **un solo** `.pcf` en el proyecto. Si no hay ninguno, la compilación se corta y te muestra el PCF de la placa activa para que lo agregues con un click. Si hay más de uno, también se corta: dejá uno solo.

Todo corre en este navegador con **YoWASP** (WebAssembly): la primera vez baja los WASM, después quedan cacheados.

Si sale bien: **Binario listo** y un link de descarga en la consola del programador. Ese mismo `.bin` es el que usa **Grabar en flash / SRAM**.

## Grabar un `.bin` que no compilaste acá

En **Grabar en flash** o **Grabar en SRAM** elegí la opción de subir archivo. Tiene que ser un bitstream iCE40 para **esa** placa (mismo device y mismos pines). Un `.bin` de otra placa puede grabarse y no hacer lo que esperás.

## Placa personalizada

**Placa no listada…** en el selector. Definís nombre, device/package de nextpnr, VID/PID del USB y el mapa **ADBUS del FTDI** (programador). Los pines del FPGA no van acá: van en el `pins.pcf` del proyecto. Son dos mapas distintos.

Eso se guarda en `localStorage` de **este** navegador. En otra PC no está. El ícono **?** de cada placa abre el pinout y el mapa ADBUS.

## Laboratorio de arranque

Al cambiar de placa, si no tocaste el proyecto, se carga el laboratorio de esa placa (contador, botones, UART) con su `pins.pcf`. Si editaste algo, se respeta tu trabajo: el PCF sigue siendo el tuyo.
