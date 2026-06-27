# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Android Build Notes

Production Android builds (admin, cashier, captain) load the bundled assets from `dist/` and do **not** allow mixed content.

For QA live-reload builds, set the `CAPACITOR_LIVE_RELOAD` environment variable in the shell before running the build command:

```bash
# Example for captain QA
CAPACITOR_LIVE_RELOAD=https://192.168.1.10:5173/captain.html npm run build:captain-android
```

This variable is read at build time by `apps/*/capacitor.config.ts`. It is not loaded from Vite `.env` files. After the build, run `npm run verify:captain` to confirm `dist/captain.html` exists and contains no `localhost` references.
