/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ALLOWED_IMPORT_EXTENSIONS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*?raw' {
  const text: string
  export default text
}

