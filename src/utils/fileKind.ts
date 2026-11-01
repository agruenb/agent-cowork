import * as path from 'path';

export type FileKind = 'markdown' | 'code' | 'image' | 'file';

export const MARKDOWN_EXTENSIONS: readonly string[] = [
  '.md',
  '.markdown',
  '.mdown',
  '.mkdn',
  '.mdx',
];

export const IMAGE_EXTENSIONS: readonly string[] = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.bmp',
  '.ico',
  '.tif',
  '.tiff',
  '.avif',
  '.heic',
  '.heif',
  '.apng',
];

export const CODE_EXTENSIONS: readonly string[] = [
  // JavaScript & TypeScript
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.mts',
  '.cts',
  '.tsx',
  // Web & UI
  '.html',
  '.htm',
  '.xhtml',
  '.vue',
  '.svelte',
  '.astro',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.styl',
  // Python
  '.py',
  '.pyw',
  '.pyi',
  '.ipynb',
  // Systems & Compiled
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cc',
  '.hh',
  '.cxx',
  '.hxx',
  '.cp',
  '.rs',
  '.go',
  '.java',
  '.class',
  '.jar',
  '.kt',
  '.kts',
  '.cs',
  '.csx',
  '.swift',
  '.m',
  '.mm',
  // Shell & Scripting
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.ksh',
  '.csh',
  '.bat',
  '.cmd',
  '.ps1',
  '.psm1',
  '.psd1',
  // Other Languages
  '.rb',
  '.erb',
  '.rake',
  '.php',
  '.phtml',
  '.lua',
  '.r',
  '.pl',
  '.pm',
  '.t',
  '.dart',
  '.scala',
  '.sc',
  '.clj',
  '.cljs',
  '.cljc',
  '.edn',
  '.ex',
  '.exs',
  '.erl',
  '.hrl',
  '.hs',
  '.lhs',
  '.zig',
  '.nim',
  '.v',
  '.d',
  '.jl',
  '.fs',
  '.fsi',
  '.fsx',
  '.vb',
  '.asm',
  '.s',
  // Structured Data, Config & Query
  '.json',
  '.jsonc',
  '.json5',
  '.yaml',
  '.yml',
  '.toml',
  '.xml',
  '.xsd',
  '.xsl',
  '.xslt',
  '.sql',
  '.graphql',
  '.gql',
  '.proto',
  '.prisma',
  '.cmake',
  '.env',
];

export const CODE_FILENAMES: readonly string[] = [
  'dockerfile',
  'containerfile',
  'makefile',
  'gnumakefile',
  'cmakelists.txt',
  'gemfile',
  'rakefile',
  'jenkinsfile',
  'vagrantfile',
  '.gitignore',
  '.npmrc',
  '.editorconfig',
  '.prettierrc',
  '.eslintrc',
];

/**
 * Determines the file kind ('markdown', 'code', 'image', or generic 'file') for a given path.
 */
export function getFileKind(filePath: string): FileKind {
  if (!filePath) {
    return 'file';
  }

  const ext = path.extname(filePath).toLowerCase();
  if (MARKDOWN_EXTENSIONS.includes(ext)) {
    return 'markdown';
  }

  if (IMAGE_EXTENSIONS.includes(ext)) {
    return 'image';
  }

  if (CODE_EXTENSIONS.includes(ext)) {
    return 'code';
  }

  const baseName = path.basename(filePath).toLowerCase();
  if (
    CODE_FILENAMES.includes(baseName) ||
    baseName.startsWith('.env') ||
    baseName.startsWith('dockerfile')
  ) {
    return 'code';
  }

  return 'file';
}

