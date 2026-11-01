/* eslint-disable @typescript-eslint/no-var-requires */
import './vscodeMock';
import assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { JSDOM } from 'jsdom';
import { vscodeMockState, resetVscodeMock } from './vscodeMock';
import { applyFilenameTint, isWebviewDarkMode } from '../src/webview/markdownEditor';

const vscode = require('vscode');
const { getFileKind } = require('../src/utils/fileKind');
const { getFileWithDotIconUri } = require('../src/utils/fileDotIcon');
const { FolderItem, FolderTreeProvider } = require('../src/folderTreeProvider');
import type { FileKind } from '../src/utils/fileKind';

describe('File Icons and Classification', () => {
  describe('getFileKind', () => {
    it('classifies markdown files as markdown', () => {
      assert.strictEqual(getFileKind('README.md'), 'markdown');
      assert.strictEqual(getFileKind('doc.markdown'), 'markdown');
      assert.strictEqual(getFileKind('post.mdown'), 'markdown');
      assert.strictEqual(getFileKind('page.mkdn'), 'markdown');
      assert.strictEqual(getFileKind('component.mdx'), 'markdown');
    });

    it('classifies image files as image', () => {
      assert.strictEqual(getFileKind('photo.png'), 'image');
      assert.strictEqual(getFileKind('photo.PNG'), 'image');
      assert.strictEqual(getFileKind('picture.jpg'), 'image');
      assert.strictEqual(getFileKind('picture.jpeg'), 'image');
      assert.strictEqual(getFileKind('icon.svg'), 'image');
      assert.strictEqual(getFileKind('anim.gif'), 'image');
      assert.strictEqual(getFileKind('banner.webp'), 'image');
      assert.strictEqual(getFileKind('favicon.ico'), 'image');
      assert.strictEqual(getFileKind('scan.bmp'), 'image');
      assert.strictEqual(getFileKind('scan.tiff'), 'image');
      assert.strictEqual(getFileKind('modern.avif'), 'image');
      assert.strictEqual(getFileKind('mobile.heic'), 'image');
    });

    it('classifies source code and config files as code', () => {
      // JavaScript & TypeScript
      assert.strictEqual(getFileKind('index.ts'), 'code');
      assert.strictEqual(getFileKind('index.tsx'), 'code');
      assert.strictEqual(getFileKind('index.js'), 'code');
      assert.strictEqual(getFileKind('index.jsx'), 'code');
      assert.strictEqual(getFileKind('script.mjs'), 'code');
      assert.strictEqual(getFileKind('module.cjs'), 'code');

      // Python
      assert.strictEqual(getFileKind('app.py'), 'code');
      assert.strictEqual(getFileKind('notebook.ipynb'), 'code');

      // Web
      assert.strictEqual(getFileKind('index.html'), 'code');
      assert.strictEqual(getFileKind('styles.css'), 'code');
      assert.strictEqual(getFileKind('styles.scss'), 'code');
      assert.strictEqual(getFileKind('component.vue'), 'code');
      assert.strictEqual(getFileKind('widget.svelte'), 'code');

      // Systems / Native
      assert.strictEqual(getFileKind('main.c'), 'code');
      assert.strictEqual(getFileKind('main.cpp'), 'code');
      assert.strictEqual(getFileKind('header.h'), 'code');
      assert.strictEqual(getFileKind('main.rs'), 'code');
      assert.strictEqual(getFileKind('server.go'), 'code');
      assert.strictEqual(getFileKind('App.java'), 'code');
      assert.strictEqual(getFileKind('App.kt'), 'code');
      assert.strictEqual(getFileKind('Program.cs'), 'code');
      assert.strictEqual(getFileKind('App.swift'), 'code');

      // Shell & Scripts
      assert.strictEqual(getFileKind('deploy.sh'), 'code');
      assert.strictEqual(getFileKind('script.bash'), 'code');
      assert.strictEqual(getFileKind('config.zsh'), 'code');
      assert.strictEqual(getFileKind('build.bat'), 'code');
      assert.strictEqual(getFileKind('run.ps1'), 'code');

      // Other languages
      assert.strictEqual(getFileKind('app.rb'), 'code');
      assert.strictEqual(getFileKind('index.php'), 'code');
      assert.strictEqual(getFileKind('script.lua'), 'code');
      assert.strictEqual(getFileKind('analysis.r'), 'code');
      assert.strictEqual(getFileKind('script.pl'), 'code');
      assert.strictEqual(getFileKind('main.dart'), 'code');
      assert.strictEqual(getFileKind('build.zig'), 'code');

      // Data / Config / Query
      assert.strictEqual(getFileKind('package.json'), 'code');
      assert.strictEqual(getFileKind('config.yaml'), 'code');
      assert.strictEqual(getFileKind('config.yml'), 'code');
      assert.strictEqual(getFileKind('Cargo.toml'), 'code');
      assert.strictEqual(getFileKind('query.sql'), 'code');
      assert.strictEqual(getFileKind('schema.graphql'), 'code');
      assert.strictEqual(getFileKind('data.xml'), 'code');

      // Special filenames
      assert.strictEqual(getFileKind('Dockerfile'), 'code');
      assert.strictEqual(getFileKind('dockerfile'), 'code');
      assert.strictEqual(getFileKind('Makefile'), 'code');
      assert.strictEqual(getFileKind('CMakeLists.txt'), 'code');
      assert.strictEqual(getFileKind('.env'), 'code');
      assert.strictEqual(getFileKind('.env.local'), 'code');
      assert.strictEqual(getFileKind('.gitignore'), 'code');
    });

    it('classifies document and other non-code files as file', () => {
      assert.strictEqual(getFileKind('notes.txt'), 'file');
      assert.strictEqual(getFileKind('document.pdf'), 'file');
      assert.strictEqual(getFileKind('report.docx'), 'file');
      assert.strictEqual(getFileKind('spreadsheet.xlsx'), 'file');
      assert.strictEqual(getFileKind('data.csv'), 'file');
      assert.strictEqual(getFileKind('archive.zip'), 'file');
      assert.strictEqual(getFileKind('archive.tar.gz'), 'file');
      assert.strictEqual(getFileKind(''), 'file');
    });
  });

  describe('Agent Cowork Icon Theme JSON', () => {
    it('defines code, image, markdown, and file icons', () => {
      const themePath = path.join(__dirname, '../resources/icons/agent-cowork-icon-theme.json');
      const content = fs.readFileSync(themePath, 'utf8');
      const theme = JSON.parse(content);

      assert.ok(theme.iconDefinitions._file, 'Should define _file');
      assert.ok(theme.iconDefinitions._markdown, 'Should define _markdown');
      assert.ok(theme.iconDefinitions._code, 'Should define _code');
      assert.ok(theme.iconDefinitions._image, 'Should define _image');

      assert.strictEqual(theme.iconDefinitions._code.iconPath, './code.svg');
      assert.strictEqual(theme.iconDefinitions._image.iconPath, './image.svg');
      assert.strictEqual(theme.iconDefinitions._file.iconPath, './file.svg');
      assert.strictEqual(theme.iconDefinitions._markdown.iconPath, './markdown.svg');

      // Check SVG files exist
      const iconsDir = path.join(__dirname, '../resources/icons');
      assert.ok(fs.existsSync(path.join(iconsDir, 'code.svg')), 'code.svg must exist');
      assert.ok(fs.existsSync(path.join(iconsDir, 'image.svg')), 'image.svg must exist');
      assert.ok(fs.existsSync(path.join(iconsDir, 'file.svg')), 'file.svg must exist');
      assert.ok(fs.existsSync(path.join(iconsDir, 'markdown.svg')), 'markdown.svg must exist');

      // Check extension mappings
      assert.strictEqual(theme.fileExtensions.ts, '_code');
      assert.strictEqual(theme.fileExtensions.js, '_code');
      assert.strictEqual(theme.fileExtensions.py, '_code');
      assert.strictEqual(theme.fileExtensions.png, '_image');
      assert.strictEqual(theme.fileExtensions.jpg, '_image');
      assert.strictEqual(theme.fileExtensions.svg, '_image');
      assert.strictEqual(theme.fileExtensions.md, '_markdown');
    });
  });

  describe('getFileWithDotIconUri', () => {
    it('generates dot icons for all file kinds and legacy booleans', () => {
      const kinds: FileKind[] = ['markdown', 'code', 'image', 'file'];
      for (const kind of kinds) {
        const icon = getFileWithDotIconUri(kind, '#2563eb');
        assert.ok(icon, `Icon for ${kind} should be generated`);
        assert.ok(icon.light.fsPath.endsWith(`${kind === 'markdown' ? 'md' : kind}-dot-2563eb.svg`));
        assert.ok(fs.existsSync(icon.light.fsPath));

        const svgContent = fs.readFileSync(icon.light.fsPath, 'utf8');
        assert.ok(svgContent.includes('fill="#2563eb"'), 'Contains color dot');
        if (kind === 'code') {
          assert.ok(svgContent.includes('polyline'), 'Code icon contains brackets');
        } else if (kind === 'image') {
          assert.ok(svgContent.includes('<circle cx="9.5"'), 'Image icon contains sun');
        } else if (kind === 'markdown') {
          assert.ok(svgContent.includes('AI'), 'Markdown icon contains AI text');
        }
      }

      // Legacy boolean support
      const legacyMd = getFileWithDotIconUri(true, '#ff0000');
      assert.ok(legacyMd?.light.fsPath.includes('md-dot-ff0000.svg'));
      const legacyFile = getFileWithDotIconUri(false, '#ff0000');
      assert.ok(legacyFile?.light.fsPath.includes('file-dot-ff0000.svg'));
    });
  });

  describe('FolderTreeItem icon selection', () => {
    const extUri = vscode.Uri.file(path.join(__dirname, '..'));

    it('assigns code icon to source code files', () => {
      const item = new FolderItem(vscode.Uri.file('/workspace/app.ts'), false, extUri);
      assert.ok(item.iconPath);
      assert.ok(item.iconPath.light.fsPath.endsWith('code.svg'));
    });

    it('assigns image icon to image files', () => {
      const item = new FolderItem(vscode.Uri.file('/workspace/logo.png'), false, extUri);
      assert.ok(item.iconPath);
      assert.ok(item.iconPath.light.fsPath.endsWith('image.svg'));
    });

    it('assigns markdown icon to markdown files', () => {
      const item = new FolderItem(vscode.Uri.file('/workspace/doc.md'), false, extUri);
      assert.ok(item.iconPath);
      assert.ok(item.iconPath.light.fsPath.endsWith('markdown.svg'));
    });

    it('assigns file icon to generic documents', () => {
      const item = new FolderItem(vscode.Uri.file('/workspace/notes.txt'), false, extUri);
      assert.ok(item.iconPath);
      assert.ok(item.iconPath.light.fsPath.endsWith('file.svg'));
    });

    it('assigns opened dot icon according to file kind when opened', () => {
      const provider = new FolderTreeProvider();
      const codeUri = vscode.Uri.file('/workspace/main.py');
      const imgUri = vscode.Uri.file('/workspace/banner.jpg');
      provider.setOpenedPaths([codeUri.fsPath, imgUri.fsPath]);

      const codeItem = provider.getFolderItem(codeUri, false);
      assert.strictEqual(codeItem.isOpened, true);
      assert.ok(codeItem.iconPath.light.fsPath.includes('code-dot-'));

      const imgItem = provider.getFolderItem(imgUri, false);
      assert.strictEqual(imgItem.isOpened, true);
      assert.ok(imgItem.iconPath.light.fsPath.includes('image-dot-'));
    });
  });
});
