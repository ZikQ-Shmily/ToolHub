# ImageMergeTool - shadcn + Tailwind v3 + Electron Patch

## 使用方法（覆盖你的现有项目）

1. 把本压缩包解压到你的项目根目录（例如 `C:\Users\Administrator\Desktop\work\ImageMergeTool`），允许覆盖同名文件。
2. 在项目根目录执行：
   ```powershell
   npm install
   ```
   这会安装：React/Vite、Electron 打包、Tailwind v3、shadcn 组件依赖等。
3. 开发运行（Vite + Electron 同时启动）：
   ```powershell
   npm run dev
   ```
4. 生成 Windows 安装包（.exe）：
   ```powershell
   npm run dist:win
   ```

## 目录要点
- `tailwind.config.ts`：shadcn 需要的 TS 版配置（Tailwind v3）。
- `src/components/ui/*`：已经内置了 `button/card/select/label` 四个 shadcn 风格组件，无需再跑 CLI。
- `electron/*`：主进程与预加载脚本（ESM）。
- `src/App.tsx`：你的卡片式界面（选择图片文件夹/保存位置/拼接方式/开始拼接）。
- `src/merge.ts`：Canvas 合并逻辑，无原生依赖。

## 常见问题
- 如果之前项目里还有 `tailwind.config.js`，请删除，**只保留 `tailwind.config.ts`**。
- 如果 `npm run dev` 白屏，请确认终端是否打印了 `http://localhost:5173`，Electron 会自动等端口就绪再打开。
- 如果想改图标，把 `public/icon.ico` 放入并在 `package.json -> build.win.icon` 指向它。
