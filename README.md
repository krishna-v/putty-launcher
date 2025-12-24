# putty-launcher

Electron scaffold for Putty Launcher.

Getting started

1. Install dependencies

```powershell
cd putty-launcher
npm install
```

2. Run the app

```powershell
npm start
```

Files
- [package.json](package.json)
- [src/main.js](src/main.js)
- [src/preload.js](src/preload.js)
- [src/renderer.js](src/renderer.js)
- [src/index.html](src/index.html)

Building installer (Windows)

1. Install dev dependencies (includes electron-builder)

```powershell
npm install
```

2. Create an installer (NSIS)

```powershell
npm run dist
```

The installer output will appear in the `dist` directory.
