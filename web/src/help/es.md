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

El panel de la derecha tiene tres pestañas: **Consola**, **Problemas** y **Recursos**.

- **Consola.** Log de compile (Yosys → nextpnr → icepack) y del grabado USB. Si el compile terminó bien, aparece un enlace para **descargar el `.bin`**. **Exportar** baja todo el log como `consola.txt`.
- **Problemas.** Los errores y avisos de las herramientas, con archivo y línea: un click te lleva al lugar. Los mensajes que se repiten (latch inferido, señal sin driver, identificador no declarado, módulo que falta) vienen con una explicación abajo, en criollo. Ahí también aparecen los problemas de pines que se ven **sin compilar** (un puerto del top sin `set_io`, un `set_io` que no existe en el diseño, dos señales en el mismo pin).
- **Recursos.** Después de compilar: cuántos LC / BRAM / IO / PLL usó el diseño, el **Fmax** de cada reloj contra la frecuencia pedida, el camino crítico y las celdas que contó Yosys. Abajo queda el historial de los últimos builds, para ver si el diseño está creciendo.

  La frecuencia pedida sale del `.pcf`: `set_frequency CLK12 12` le dice a nextpnr a qué velocidad anda ese reloj de verdad. Sin esa línea, nextpnr compara **todos** los relojes contra su default de 12 MHz y el panel lo dice en gris (`sin restricción`), porque ese "pasa" no significaría nada. El autocompletado del `.pcf` ofrece la línea con la frecuencia de cada reloj de la placa.
- **Consola UART.** Solo lo que entra por el puerto serie. No mezcla la síntesis. Tiene hora, vista hexadecimal, gráfico de las líneas que son números, envío con historial (↑/↓) y guardar el log.

Los errores también se subrayan en el editor, con una marca en el margen.

## Revisar sin compilar

Al lado de las pestañas hay un indicador clicable: **sin revisar** cuando cambiaste algo, **revisando…** mientras corre y **revisado ✓** cuando la última revisión salió limpia. Un click (o `Ctrl+S`) corre `read_verilog` + `hierarchy -check`: encuentra errores de sintaxis, módulos que faltan y puertos mal conectados en segundos, sin esperar el place & route. Con **revisar solo** tildado eso pasa cada vez que dejás de escribir, a partir del primer compile o de la primera revisión (antes, los WASM todavía no están en el navegador y el indicador queda en **sin revisar**).

Los latches inferidos aparecen recién en el compile completo: la pasada de Yosys que los detecta es parte de la síntesis, no de la elaboración.

**Compilar** y **Cancelar** son el mismo botón: mientras compila dice **Compilando… ✕** y el click corta. El WASM no sabe abortar, así que se reinicia el worker y el próximo compile arranca de cero.

## Editor

- **Ctrl+F** abre buscar y reemplazar.
- El autocompletado ofrece palabras clave, primitivas del iCE40 (`SB_*`), las señales del archivo, los módulos del proyecto (los completa con la instancia entera) y bloques listos: `module`, `always`, `counter`, `fsm`, `debounce`, `pwm`, `rom`, `pll`. `Tab` salta entre los huecos.
- En el `.pcf` completa los puertos del top que todavía no tienen pin, con el número que trae la plantilla de la placa.

## Proyectos

Arriba del módulo top está el selector de **Proyecto**. Cada proyecto guarda sus archivos, su top y su pestaña activa en **este** navegador. **+ nuevo** arranca uno con el laboratorio de la placa activa, **✎** le cambia el nombre y **🗑** lo borra (pide confirmación; no se puede deshacer, así que exportá el zip si lo querés guardar).

Cambiar de proyecto guarda el que estabas editando. Lo que había antes de esta versión se migró solo, con el nombre "Mi proyecto".

## Menú Herramientas

- **Compartir por link.** Mete el proyecto entero comprimido adentro de la URL, después del `#`. Se lo pasás a alguien y abre lo mismo que estás viendo. Ese texto no viaja al servidor: se queda en los dos navegadores.
- **Abrir carpeta / Guardar en carpeta** (Chrome y Edge). Trabaja directo contra una carpeta del disco, sin el ida y vuelta del zip. El permiso dura mientras la pestaña siga abierta. Los nombres con espacios o acentos entran con `_` (`mi modulo.v` → `mi_modulo.v`): terminan en la línea de comandos del WASM y adentro de los `$readmemh`.
- **Asistente de PLL.** Corre `icepll` (el de IceStorm) y escribe el módulo `SB_PLL40_*` con los divisores ya calculados. Le decís el reloj de entrada y el que querés, y lo agrega al proyecto.
- **Cambiar ROM (icebram).** Reemplaza el contenido de una BRAM adentro del bitstream ya compilado: cambiás la tabla y el `.bin` sale en segundos, sin volver a sintetizar. El contenido inicial conviene generarlo con el botón **Generar** (valores al azar): es lo que icebram necesita para ubicar la ROM.
- **Ver el `.bin` en hexadecimal.** Para mirar el bitstream sin bajarlo.
- **Del último compile.** Baja los cuatro archivos que quedaron: el `.bin` que se graba, el `.asc` (el bitstream en texto, que comen `icebram` e `icetime`), el `.json` (el netlist de Yosys, que es lo que dibuja un esquemático o come un simulador) y el `.pnr` (el reporte de ocupación y timing).
- **Cerrar carpeta.** Suelta la carpeta del disco: "Guardar en carpeta" vuelve a preguntar cuál. También se suelta al reiniciar el proyecto o al cambiar de proyecto.

## Sin conexión

La app guarda en el navegador los WASM de Yosys y nextpnr la primera vez. Después arranca al toque y **compila sin internet**. En el menú Herramientas se ve cuánto quedó guardado y hay un botón para vaciarlo.

## Botones del programador

- **Conectar programador.** Chrome muestra el picker USB. Elegí el FTDI, canal A (programador), no el COM del UART.
- **Desconectar.** Suelta el WebUSB.
- **Compilar.** Sintetiza el Verilog de esta ventana para **la placa seleccionada**. El `.bin` queda en memoria; no se sube a ningún servidor.
- **Grabar en flash.** Escribe el `.bin` compilado, o uno que subas, en la SPI. Sobrevive un reset o un corte de USB.
- **Grabar en SRAM.** Carga el bitstream en la FPGA sin tocar la flash. Se pierde al resetear o al desconectar.
- **Borrar flash.** Deja la SPI vacía.
- **Leer flash / EEPROM.** Baja o muestra el contenido (bin, hex o consola).
- **Verificar contra el `.bin`.** Dentro del menú **Grabar en flash**: relee de la flash lo que ocupa el bitstream y lo compara byte a byte. Si tildás **verificar al grabar**, lo hace solo después de cada grabado.
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
