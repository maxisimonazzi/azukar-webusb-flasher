# Cómo usar esta página

Esta app corre en el navegador. Editás Verilog, compilás a un `.bin` iCE40 y, en Chrome o Edge, grabás la placa por USB. No hay cuenta ni servidor de usuarios.

**Antes de compilar, elegí la placa** arriba a la derecha. Eso elige el PCF (pines del FPGA) y el mapa del programador FTDI. Si compilás con otra placa, el `.bin` no va a coincidir con los LEDs, botones ni UART de la que tenés enchufada.

## Paneles

- **Árbol de archivos (izquierda).** Lista los `.v` del proyecto. El **módulo top** es el que Yosys sintetiza.
- **Editor (centro).** El Verilog de la pestaña activa. Podés importar o exportar un zip del proyecto.
- **Programador (arriba a la derecha).** Consola de síntesis y de WebUSB (canal A del FTDI): conectar, compilar, grabar flash/SRAM, borrar, leer, reset.
- **UART (abajo a la derecha).** WebSerial, canal B. Texto que manda la FPGA (por ejemplo `Hola UART`).

## Archivos y pestañas

- **+** crea un `.v` nuevo (en el árbol o junto a las pestañas).
- Un click en el árbol abre el archivo. **Doble click** (árbol o pestaña) cambia el nombre.
- **×** en la pestaña la cierra pero el archivo sigue en el árbol. **×** en el árbol borra el archivo (tiene que quedar al menos uno).
- **Importar / exportar proyecto** mueve un zip de `.v`. No se guarda en el servidor: vive en esta ventana.

## Consolas

- **Consola del programador.** Log de compile (Yosys → nextpnr → icepack) y del grabado USB. Si el compile terminó bien, aparece un enlace para **descargar el `.bin`**.
- **Consola UART.** Solo lo que entra por el puerto serie. No mezcla la síntesis.

## Botones del programador

- **Conectar programador.** Chrome muestra el picker USB. Elegí el FTDI, canal A (programador), no el COM del UART.
- **Desconectar.** Suelta el WebUSB.
- **Compilar.** Sintetiza el Verilog de esta ventana para **la placa seleccionada**. El `.bin` queda en memoria; no se sube a ningún servidor si estás en modo YoWASP.
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

Yosys → nextpnr-ice40 → icepack, con el PCF de la placa activa. El resultado es un bitstream `.bin`.

- En modo **YoWASP** corre en este navegador (la primera vez baja los WASM).
- En modo **server** corre en el contenedor toolchain.

Si sale bien: **Binario listo** y un link de descarga en la consola del programador. Ese mismo `.bin` es el que usa **Grabar en flash / SRAM**.

## Grabar un `.bin` que no compilaste acá

En **Grabar en flash** o **Grabar en SRAM** elegí la opción de subir archivo. Tiene que ser un bitstream iCE40 para **esa** placa (mismo device y mismos pines). Un `.bin` de otra placa puede grabarse y no hacer lo que esperás.

## Placa personalizada

**Placa no listada…** en el selector. Definís nombre, device/package de nextpnr, el mapa **ADBUS del FTDI** (programador) y el **PCF** (pines del FPGA). Son dos mapas distintos.

Eso se guarda en `localStorage` de **este** navegador. En otra PC no está. El ícono **?** de cada placa abre el pinout y el mapa ADBUS.

## Laboratorio de arranque

Al cambiar de placa, si no tocaste los `.v`, se carga el laboratorio de esa placa (contador, botones, UART). Si editaste el código, se respeta tu trabajo.
