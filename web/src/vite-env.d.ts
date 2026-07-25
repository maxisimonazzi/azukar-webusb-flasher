/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COMPILE_BACKEND?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*?raw' {
  const text: string
  export default text
}

