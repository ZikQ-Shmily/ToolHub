export {}

declare global {
  interface Window {
    api: {
      pickAnyFiles(): Promise<{
        canceled: boolean
        files?: { path: string; name: string; dir: string; ext: string }[]
      }>
      renameFiles(items: { from: string; to: string; autoResolve?: boolean }[]): Promise<{
        results: { from: string; to: string }[]
      }>
    }
  }
}
