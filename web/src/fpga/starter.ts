export const BLINKY_TOP = 'azukar_lab'

export const BLINKY_VERILOG = `// Azukar v2 — laboratorio de puertas + contador 4 bit.
// CLK12 pin 49 (12 MHz). LEDs 37–45. Botones BTN*_ activos en BAJO.

module azukar_lab (
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
    output LED7
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
endmodule
`
