/** Lab starters keyed by board id. CLK / buttons / LEDs follow each PCF. */

import { isCustomBoardId } from './boardTypes.ts'
import type { FpgaFile } from './files.ts'

export const BLINKY_TOP = 'top_module'

export const UART_TX_VERILOG = `// uart_tx — 8N1, LSB first. Default 115200 @ 12 MHz (DIV=104).
// wr un ciclo con busy=0 encola un byte. tx idle = 1.

module uart_tx #(
    parameter CLK_HZ = 12_000_000,
    parameter BAUD   = 115200
) (
    input  wire       clk,
    input  wire       wr,
    input  wire [7:0] din,
    output reg        busy,
    output reg        tx
);
    localparam DIV = CLK_HZ / BAUD;

    reg [15:0] divcnt  = 16'd0;
    reg [3:0]  bitpos  = 4'd0;
    reg [9:0]  shifter = 10'h3FF;

    initial begin
        busy = 1'b0;
        tx   = 1'b1;
    end

    always @(posedge clk) begin
        if (busy) begin
            if (divcnt == DIV - 1) begin
                divcnt  <= 16'd0;
                tx      <= shifter[0];
                shifter <= {1'b1, shifter[9:1]};
                if (bitpos == 4'd9) begin
                    busy   <= 1'b0;
                    bitpos <= 4'd0;
                    tx     <= 1'b1;
                end else begin
                    bitpos <= bitpos + 1'b1;
                end
            end else begin
                divcnt <= divcnt + 1'b1;
            end
        end else if (wr) begin
            busy    <= 1'b1;
            divcnt  <= 16'd0;
            bitpos  <= 4'd0;
            shifter <= {1'b1, din, 1'b0};
        end
    end
endmodule
`

export const AZUKAR_VERILOG = `// Azukar v2 — laboratorio de puertas + contador 4 bit + UART TX.
// CLK12 pin 49 (12 MHz). LEDs 37–45. Botones BTN*_ activos en BAJO.
// TX pin 63 → FT2232H canal B. 115200 8N1 (igual que el combo UART).

module top_module (
    input  CLK12,
    input  BTN0_,
    input  BTN1_,
    input  BTN2_,
    input  BTN3_,
    input  BTN4_,
    input  BTN5_,
    input  BTN6_,
    input  BTN7_,
    output LED0,
    output LED1,
    output LED2,
    output LED3,
    output LED4,
    output LED5,
    output LED6,
    output LED7,
    output TX
);
    assign LED0 = (~BTN0_) & (~BTN1_);
    assign LED1 = (~BTN2_) | (~BTN3_);
    assign LED2 = (~BTN4_) ^ (~BTN5_);
    assign LED3 = ~BTN6_;

    reg [31:0] div = 32'd0;

    always @(posedge CLK12) begin
        if (!BTN7_)
            div <= 32'd0;
        else
            div <= div + 1'b1;
    end

    assign LED4 = div[22];
    assign LED5 = div[23];
    assign LED6 = div[24];
    assign LED7 = div[25];

    wire       uart_busy;
    reg        uart_wr   = 1'b0;
    reg [7:0]  uart_data = 8'h00;
    reg [3:0]  msg_idx   = 4'd0;
    reg [21:0] gap       = 22'd0;

    uart_tx u_tx (
        .clk (CLK12),
        .wr  (uart_wr),
        .din (uart_data),
        .busy(uart_busy),
        .tx  (TX)
    );

    always @(posedge CLK12) begin
        uart_wr <= 1'b0;
        if (!BTN7_) begin
            msg_idx <= 4'd0;
            gap     <= 22'd0;
        end else if (gap != 22'd0) begin
            gap <= gap - 1'b1;
        end else if (!uart_busy && !uart_wr) begin
            case (msg_idx)
                4'd0:  uart_data <= "H";
                4'd1:  uart_data <= "o";
                4'd2:  uart_data <= "l";
                4'd3:  uart_data <= "a";
                4'd4:  uart_data <= " ";
                4'd5:  uart_data <= "U";
                4'd6:  uart_data <= "A";
                4'd7:  uart_data <= "R";
                4'd8:  uart_data <= "T";
                4'd9:  uart_data <= 8'h0D;
                default: uart_data <= 8'h0A;
            endcase
            uart_wr <= 1'b1;
            if (msg_idx == 4'd10) begin
                msg_idx <= 4'd0;
                gap     <= 22'd3_000_000;
            end else begin
                msg_idx <= msg_idx + 1'b1;
            end
        end
    end
endmodule
`

export const EDU_CIAA_VERILOG = `// EDU-CIAA-FPGA — contador 4 bit + UART TX.
// CLK pin 94 (12 MHz). LED0–3 pins 1–4. BTN1 pin 31 activo en BAJO = reset.
// TX pin 56 → FT2232H canal B. 115200 8N1.

module top_module (
    input  CLK,
    input  BTN1,
    output LED0,
    output LED1,
    output LED2,
    output LED3,
    output TX
);
    reg [31:0] div = 32'd0;

    always @(posedge CLK) begin
        if (!BTN1)
            div <= 32'd0;
        else
            div <= div + 1'b1;
    end

    assign LED0 = div[22];
    assign LED1 = div[23];
    assign LED2 = div[24];
    assign LED3 = div[25];

    wire       uart_busy;
    reg        uart_wr   = 1'b0;
    reg [7:0]  uart_data = 8'h00;
    reg [3:0]  msg_idx   = 4'd0;
    reg [21:0] gap       = 22'd0;

    uart_tx u_tx (
        .clk (CLK),
        .wr  (uart_wr),
        .din (uart_data),
        .busy(uart_busy),
        .tx  (TX)
    );

    always @(posedge CLK) begin
        uart_wr <= 1'b0;
        if (!BTN1) begin
            msg_idx <= 4'd0;
            gap     <= 22'd0;
        end else if (gap != 22'd0) begin
            gap <= gap - 1'b1;
        end else if (!uart_busy && !uart_wr) begin
            case (msg_idx)
                4'd0:  uart_data <= "H";
                4'd1:  uart_data <= "o";
                4'd2:  uart_data <= "l";
                4'd3:  uart_data <= "a";
                4'd4:  uart_data <= " ";
                4'd5:  uart_data <= "U";
                4'd6:  uart_data <= "A";
                4'd7:  uart_data <= "R";
                4'd8:  uart_data <= "T";
                4'd9:  uart_data <= 8'h0D;
                default: uart_data <= 8'h0A;
            endcase
            uart_wr <= 1'b1;
            if (msg_idx == 4'd10) begin
                msg_idx <= 4'd0;
                gap     <= 22'd3_000_000;
            end else begin
                msg_idx <= msg_idx + 1'b1;
            end
        end
    end
endmodule
`

export const ALHAMBRA_VERILOG = `// Alhambra II — contador 4 bit + NOT en SW2 + UART TX.
// CLK pin 49 (12 MHz). LED0–7 pines 45–37 (PCF FPGAwars). SW1/SW2 34/33, activos en BAJO.
// TX pin 61 → FT2232H canal B. 115200 8N1.

module top_module (
    input  CLK,
    input  SW1,
    input  SW2,
    output LED0,
    output LED1,
    output LED2,
    output LED3,
    output LED4,
    output LED5,
    output LED6,
    output LED7,
    output TX
);
    reg [31:0] div = 32'd0;

    always @(posedge CLK) begin
        if (!SW1)
            div <= 32'd0;
        else
            div <= div + 1'b1;
    end

    assign LED0 = div[22];
    assign LED1 = div[23];
    assign LED2 = div[24];
    assign LED3 = div[25];
    assign LED4 = ~SW2;
    assign LED5 = ~SW2;
    assign LED6 = ~SW2;
    assign LED7 = ~SW2;

    wire       uart_busy;
    reg        uart_wr   = 1'b0;
    reg [7:0]  uart_data = 8'h00;
    reg [3:0]  msg_idx   = 4'd0;
    reg [21:0] gap       = 22'd0;

    uart_tx u_tx (
        .clk (CLK),
        .wr  (uart_wr),
        .din (uart_data),
        .busy(uart_busy),
        .tx  (TX)
    );

    always @(posedge CLK) begin
        uart_wr <= 1'b0;
        if (!SW1) begin
            msg_idx <= 4'd0;
            gap     <= 22'd0;
        end else if (gap != 22'd0) begin
            gap <= gap - 1'b1;
        end else if (!uart_busy && !uart_wr) begin
            case (msg_idx)
                4'd0:  uart_data <= "H";
                4'd1:  uart_data <= "o";
                4'd2:  uart_data <= "l";
                4'd3:  uart_data <= "a";
                4'd4:  uart_data <= " ";
                4'd5:  uart_data <= "U";
                4'd6:  uart_data <= "A";
                4'd7:  uart_data <= "R";
                4'd8:  uart_data <= "T";
                4'd9:  uart_data <= 8'h0D;
                default: uart_data <= 8'h0A;
            endcase
            uart_wr <= 1'b1;
            if (msg_idx == 4'd10) begin
                msg_idx <= 4'd0;
                gap     <= 22'd3_000_000;
            end else begin
                msg_idx <= msg_idx + 1'b1;
            end
        end
    end
endmodule
`

export const CUSTOM_VERILOG = `// Custom board — skeleton. Match CLK / BTN1 / LED0 / TX to your PCF.
// If you use UART, the PCF must define TX (and RX if you read). Clock too.

module top_module (
    input  CLK,
    input  BTN1,
    output LED0,
    output LED1,
    output LED2,
    output LED3,
    output TX
);
    reg [31:0] div = 32'd0;

    always @(posedge CLK) begin
        if (!BTN1)
            div <= 32'd0;
        else
            div <= div + 1'b1;
    end

    assign LED0 = div[22];
    assign LED1 = div[23];
    assign LED2 = div[24];
    assign LED3 = div[25];

    wire       uart_busy;
    reg        uart_wr   = 1'b0;
    reg [7:0]  uart_data = 8'h00;
    reg [3:0]  msg_idx   = 4'd0;
    reg [21:0] gap       = 22'd0;

    uart_tx u_tx (
        .clk (CLK),
        .wr  (uart_wr),
        .din (uart_data),
        .busy(uart_busy),
        .tx  (TX)
    );

    always @(posedge CLK) begin
        uart_wr <= 1'b0;
        if (!BTN1) begin
            msg_idx <= 4'd0;
            gap     <= 22'd0;
        end else if (gap != 22'd0) begin
            gap <= gap - 1'b1;
        end else if (!uart_busy && !uart_wr) begin
            case (msg_idx)
                4'd0:  uart_data <= "H";
                4'd1:  uart_data <= "o";
                4'd2:  uart_data <= "l";
                4'd3:  uart_data <= "a";
                4'd4:  uart_data <= " ";
                4'd5:  uart_data <= "U";
                4'd6:  uart_data <= "A";
                4'd7:  uart_data <= "R";
                4'd8:  uart_data <= "T";
                4'd9:  uart_data <= 8'h0D;
                default: uart_data <= 8'h0A;
            endcase
            uart_wr <= 1'b1;
            if (msg_idx == 4'd10) begin
                msg_idx <= 4'd0;
                gap     <= 22'd3_000_000;
            end else begin
                msg_idx <= msg_idx + 1'b1;
            end
        end
    end
endmodule
`

export type BoardStarter = { top: string; files: FpgaFile[] }

function pack(verilog: string): BoardStarter {
  return {
    top: BLINKY_TOP,
    files: [
      { name: 'top_module.v', open: true, content: verilog },
      { name: 'uart_tx.v', open: true, content: UART_TX_VERILOG },
    ],
  }
}

export const AZUKAR_STARTER: BoardStarter = pack(AZUKAR_VERILOG)
export const EDU_CIAA_STARTER: BoardStarter = pack(EDU_CIAA_VERILOG)
export const ALHAMBRA_STARTER: BoardStarter = pack(ALHAMBRA_VERILOG)
export const CUSTOM_STARTER: BoardStarter = pack(CUSTOM_VERILOG)

/** Azukar default — existing tests and first paint. */
export const BLINKY_VERILOG = AZUKAR_VERILOG
export const FPGA_STARTER: FpgaFile[] = AZUKAR_STARTER.files

export function starterForBoard(id: string): BoardStarter {
  if (isCustomBoardId(id)) return CUSTOM_STARTER
  switch (id) {
    case 'edu-ciaa-fpga':
      return EDU_CIAA_STARTER
    case 'alhambra-ii':
      return ALHAMBRA_STARTER
    case 'azukar-v2':
      return AZUKAR_STARTER
    default:
      return AZUKAR_STARTER
  }
}

export function cloneStarterFiles(starter: BoardStarter): FpgaFile[] {
  return starter.files.map((f) => ({ ...f }))
}

export function filesMatchStarter(files: FpgaFile[], starter: BoardStarter): boolean {
  if (files.length !== starter.files.length) return false
  const have = new Map(files.map((f) => [f.name, f.content]))
  return starter.files.every((f) => have.get(f.name) === f.content)
}
