# How to use this page

This app runs in the browser. You edit Verilog, compile an iCE40 `.bin`, and — in Chrome or Edge — flash the board over USB. There is no account and no user API.

**Select the board before you compile** (top right). That picks the chip (nextpnr device/package) and how the programmer talks to the FTDI. FPGA pins do not come from there: they come from `pins.pcf`, one more project file you can edit.

Picking a board loads its example `pins.pcf` as a file. Rename the signals, add pins, or drop in your own: it is your file.

## Panels

- **File tree (left).** The project `.v` files and its `pins.pcf`. The **top module** is what Yosys synthesizes.
- **Editor (center).** Verilog for the active tab. You can import or export a project zip.
- **Programmer (top right).** Synthesis and WebUSB log (FTDI channel A): connect, compile, flash/SRAM, erase, read, reset.
- **UART (bottom right).** WebSerial, channel B. Text the FPGA sends (for example `Hola UART`).

## Files and tabs

- **+** creates a new `.v` (tree or tab bar).
- Click a file in the tree to open it. **Double-click** (tree or tab) to rename.
- **×** on a tab closes it; the file stays in the tree. **×** in the tree deletes the file (at least one must remain).
- **Import / export project** moves a zip with the `.v`, the `.pcf` and any `.txt`. Nothing is stored on a server.
- The project is kept in **this** browser (`localStorage`): reload or close the tab and it comes back as you left it. It is not on another computer — export the zip for that.
- **Reset project** (the circular arrow icon) drops what is stored and brings back the active board's lab. It asks first.

## Consoles

- **Programmer console.** Compile log (Yosys → nextpnr → icepack) and USB programming. After a good compile, a **download `.bin`** link appears.
- **UART console.** Serial data only. It does not mix with synthesis.

## Programmer buttons

- **Connect programmer.** Chrome shows the USB picker. Choose FTDI channel A (programmer), not the UART COM port.
- **Disconnect.** Releases WebUSB.
- **Compile.** Synthesizes the Verilog in this window for **the selected board**. The `.bin` stays in memory; no HDL is uploaded to a server.
- **Program flash.** Writes the compiled `.bin`, or one you upload, to SPI flash. Survives reset and unplug.
- **Program SRAM.** Loads the bitstream into the FPGA without touching flash. Lost on reset or unplug.
- **Erase flash.** Clears SPI.
- **Read flash / EEPROM.** Download or show contents (bin, hex, or console).
- **Reset.** Reloads the FPGA from flash.

Each **Program** action has two entries: the `.bin` you just compiled, or **upload an external `.bin`**.

## Connecting the board

1. Pick the board (Azukar v2, Alhambra II, EDU-CIAA-FPGA, or a custom profile).
2. Plug it in over USB. Chrome or Edge.
3. **Connect programmer** → channel A.
4. For serial: **Connect UART** → channel B / *USB Serial Converter B*, baud **115200** 8N1.

### Windows drivers

Channel A must be **WinUSB** for WebUSB. Zadig → Options → List All Devices → `USB Serial Converter A` (Interface 0) → WinUSB. Not libusbK. **Do not change the driver on channel B** (UART). Close iceprog, Diamond Programmer, and any terminal holding the COM port.

**Windows 10 — flash reads.** On some Windows 10 USB host controllers, reading the flash may fail with "short USB packet". If this happens:

1. Try the **Reconnect USB** button that appears after the error. It resets the USB pipe without reinstalling the driver.
2. If that is not enough, **unplug the board, wait a few seconds, and plug it back in**. You do not need to run Zadig again.
3. If it keeps failing, try a **different USB port** (rear panel, no hub). Compiling and flashing/SRAM do not use this path and should still work.

Linux and macOS usually work without Zadig. WebUSB needs HTTPS (or localhost).

Firefox has no WebUSB: you can edit and compile, but not flash.

## What compile does

Yosys → nextpnr-ice40 → icepack, using the project’s `pins.pcf` and the active board’s device/package. The result is a `.bin` bitstream.

The project must hold **exactly one** `.pcf`. With none, the compile stops and shows the active board's PCF so you can add it in one click. With more than one it also stops: keep a single one.

It all runs in this browser with **YoWASP** (WebAssembly): the first time it downloads the WASM files, then they stay cached.

On success: **Binary ready** and a download link in the programmer console. That same `.bin` is what **Program flash / SRAM** uses.

## Flashing a `.bin` you did not compile here

Under **Program flash** or **Program SRAM**, choose the upload-file option. It must be an iCE40 bitstream for **this** board (same device and pins). A `.bin` from another board can still be written and then do the wrong thing.

## Custom board

**Unlisted board…** in the selector. You set a name, nextpnr device/package, USB VID/PID, and the **FTDI ADBUS** map (programmer). FPGA pins do not go here: they go in the project’s `pins.pcf`. Those are two different maps.

It is stored in `localStorage` on **this** browser. Another computer will not have it. The **?** on each board opens pinout and ADBUS help.

## Starter lab

When you switch boards, if you have not edited the project, the lab for that board loads (counter, buttons, UART) along with its `pins.pcf`. If you already changed something, your work is kept, `pins.pcf` included.
