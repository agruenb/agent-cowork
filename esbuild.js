const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

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
      copyAssets();
      console.log('[watch] build finished');
    });
  },
};

function copyAssets() {
  const distDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const stylesDir = path.join(__dirname, 'src', 'webview', 'styles');
  const cssDest = path.join(distDir, 'markdownEditor.css');
  const srcCssDest = path.join(__dirname, 'src', 'webview', 'markdownEditor.css');

  const cssOrder = [
    'base.css',
    'toolbar.css',
    'editor.css',
    'blocks.css',
    'lists.css',
    'codeBlocks.css',
    'tables.css',
    'rawMode.css',
  ];

  if (fs.existsSync(stylesDir)) {
    const concatenated = cssOrder
      .map((file) => {
        const filePath = path.join(stylesDir, file);
        return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
      })
      .filter(Boolean)
      .join('\n\n');
    fs.writeFileSync(cssDest, concatenated, 'utf-8');
    fs.writeFileSync(srcCssDest, concatenated, 'utf-8');
  } else {
    const cssSrc = path.join(__dirname, 'src', 'webview', 'markdownEditor.css');
    if (fs.existsSync(cssSrc)) {
      fs.copyFileSync(cssSrc, cssDest);
    }
  }
}


async function main() {
  copyAssets();

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

  if (watch) {
    await extensionCtx.watch();
    await webviewCtx.watch();
  } else {
    await extensionCtx.rebuild();
    await webviewCtx.rebuild();
    await extensionCtx.dispose();
    await webviewCtx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

