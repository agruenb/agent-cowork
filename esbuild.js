const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      });
      console.log('[watch] build finished');
    });
  },
};

async function main() {
  // 1. Extension host bundle (Node)
  const extensionCtx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin],
  });

  // 2. Webview editor bundle (Browser)
  const webviewCtx = await esbuild.context({
    entryPoints: ['src/webview/markdownEditor.ts'],
    bundle: true,
    format: 'iife',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'browser',
    outfile: 'dist/markdownEditor.js',
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin],
  });

  // 3. Webview styles bundle (CSS)
  const cssCtx = await esbuild.context({
    entryPoints: ['src/webview/styles/index.css'],
    bundle: true,
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    outfile: 'dist/markdownEditor.css',
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin],
  });

  if (watch) {
    await extensionCtx.watch();
    await webviewCtx.watch();
    await cssCtx.watch();
  } else {
    await extensionCtx.rebuild();
    await webviewCtx.rebuild();
    await cssCtx.rebuild();
    await extensionCtx.dispose();
    await webviewCtx.dispose();
    await cssCtx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
