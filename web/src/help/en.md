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

The right-hand panel has three tabs: **Console**, **Problems** and **Resources**.

- **Console.** Compile log (Yosys → nextpnr → icepack) and USB programming. After a good compile, a **download `.bin`** link appears. **Export** saves the whole log as `consola.txt`.
- **Problems.** Tool errors and warnings with file and line: click one and the editor jumps there. The messages that keep coming back (inferred latch, undriven wire, implicitly declared identifier, missing module) carry a plain-language explanation underneath. It also lists the pin problems visible **without compiling** (a top port with no `set_io`, a `set_io` for something the design does not have, two signals on the same pin).
- **Resources.** After a compile: LC / BRAM / IO / PLL used, the **Fmax** of each clock against the target, the critical path and the cells Yosys counted. The last builds are listed below, so you can see the design growing.

  The target comes from the `.pcf`: `set_frequency CLK12 12` tells nextpnr how fast that clock really runs. Without that line nextpnr compares **every** clock against its 12 MHz default, and the panel says so in grey (`no constraint`), because that "pass" would mean nothing. The `.pcf` completion offers the line with each board clock's frequency.
- **UART console.** Serial data only. It does not mix with synthesis. It has timestamps, a hex view, a plot for lines that are numbers, a send box with history (↑/↓) and log saving.

Errors are underlined in the editor too, with a marker in the gutter.

## Checking without compiling

Next to the tabs there is a clickable status: **not checked** when something changed, **checking…** while it runs, **checked ✓** when the last check came out clean. A click (or `Ctrl+S`) runs `read_verilog` + `hierarchy -check`: syntax errors, missing modules and bad port connections in seconds, without waiting for place & route. With **auto check** ticked it also runs whenever you stop typing, from the first compile or check onwards (before that the WASM is not in the browser yet and the status stays at **not checked**).

Inferred latches only show up in a full compile: the Yosys pass that finds them is part of synthesis, not elaboration.

**Compile** and **Cancel** are the same button: while compiling it reads **Compiling… ✕** and clicking stops it. WASM cannot abort, so the worker is restarted and the next compile starts from scratch.

## Editor

- **Ctrl+F** opens find and replace.
- Completion offers keywords, iCE40 primitives (`SB_*`), the signals in the file, the project's modules (completed as a full instantiation) and ready-made blocks: `module`, `always`, `counter`, `fsm`, `debounce`, `pwm`, `rom`, `pll`. `Tab` moves between the holes.
- In the `.pcf` it completes the top ports that still have no pin, using the number from the board template.

## Projects

Above the top module there is a **Project** picker. Each project keeps its files, its top and its active tab in **this** browser. **+ new** starts one with the active board's lab, **✎** renames it and **🗑** deletes it (it asks first; it cannot be undone, so export the zip if you want to keep it).

Switching projects saves the one you were editing. Whatever you had before this version was migrated automatically, named "Mi proyecto".

## Tools menu

- **Share as a link.** Puts the whole project, compressed, inside the URL after the `#`. Send it and the other person opens exactly what you see. That text never reaches the server: it stays in both browsers.
- **Open folder / Save to folder** (Chrome and Edge). Works straight against a folder on disk, no zip round trip. The permission lasts while the tab stays open. Names with spaces or accents come in with `_` (`mi modulo.v` → `mi_modulo.v`): they end up on the WASM command line and inside `$readmemh`.
- **PLL wizard.** Runs `icepll` (the IceStorm one) and writes the `SB_PLL40_*` module with the dividers worked out. Give it the input clock and the one you want, and it adds the file to the project.
- **Swap ROM (icebram).** Replaces BRAM contents inside the bitstream that is already compiled: change the table and the `.bin` comes out in seconds, no re-synthesis. Generate the initial contents with the **Generate** button (random values): that is what icebram needs to locate the ROM.
- **View the `.bin` in hex.** To look at the bitstream without downloading it.
- **From the last compile.** Downloads the four files it left: the `.bin` that gets flashed, the `.asc` (bitstream as text, what `icebram` and `icetime` eat), the `.json` (the Yosys netlist, what draws a schematic or feeds a simulator) and the `.pnr` (the utilisation and timing report).
- **Close folder.** Releases the disk folder: "Save to folder" asks again. It is also released when you reset or switch project.

## Offline

The browser keeps the Yosys and nextpnr WASM after the first run. From then on the app starts instantly and **compiles with no internet**. The Tools menu shows how much is cached and has a button to clear it.

## Programmer buttons

- **Connect programmer.** Chrome shows the USB picker. Choose FTDI channel A (programmer), not the UART COM port.
- **Disconnect.** Releases WebUSB.
- **Compile.** Synthesizes the Verilog in this window for **the selected board**. The `.bin` stays in memory; no HDL is uploaded to a server.
- **Program flash.** Writes the compiled `.bin`, or one you upload, to SPI flash. Survives reset and unplug.
- **Program SRAM.** Loads the bitstream into the FPGA without touching flash. Lost on reset or unplug.
- **Erase flash.** Clears SPI.
- **Read flash / EEPROM.** Download or show contents (bin, hex, or console).
- **Verify against the `.bin`.** Inside the **Program flash** menu: reads back exactly what the bitstream occupies and compares it byte by byte. Tick **verify after flashing** to do it automatically after every write.
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
