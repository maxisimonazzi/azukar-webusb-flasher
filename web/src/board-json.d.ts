declare module '@boards/azukar-v2/board.json' {
  const value: {
    id: string
    title: string
    fpga: {
      arch: string
      nextpnr_device: string
      nextpnr_package: string
      pcf: string
    }
    programmer: {
      chip: string
      vid: number
      pid: number
      channel: string
      adbus: {
        sck: number
        mosi: number
        cs: number
        cdone: number
        creset: number
      }
    }
  }
  export default value
}
