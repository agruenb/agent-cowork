export type WebviewLanguage = 'en' | 'de';

let currentLanguage: WebviewLanguage = 'de';

/**
 * Returns the active language in the webview context.
 * Reads document.documentElement.lang; defaults to 'de' if unspecified or in tests.
 */
export function getWebviewLanguage(): WebviewLanguage {
  if (typeof document !== 'undefined' && document.documentElement) {
    const docLang =
      document.documentElement.lang || document.documentElement.getAttribute('lang');
    if (docLang) {
      const lower = docLang.toLowerCase();
      if (lower.startsWith('en')) {
        return 'en';
      }
      if (lower.startsWith('de')) {
        return 'de';
      }
    }
  }
  return currentLanguage;
}

/**
 * Explicitly sets the webview language and updates document.documentElement.lang.
 */
export function setWebviewLanguage(lang: WebviewLanguage): void {
  currentLanguage = lang;
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = lang;
  }
}

const enWebviewTranslations: Record<string, string> = {
  // Toolbar and general labels
  'Editor Werkzeugleiste': 'Editor Toolbar',
  'Textformatierung': 'Text formatting',
  'Normaler Text': 'Normal text',
  'Überschrift 1 (Groß)': 'Heading 1 (Large)',
  'Überschrift 2 (Mittel)': 'Heading 2 (Medium)',
  'Überschrift 3 (Klein)': 'Heading 3 (Small)',
  'Fett (Cmd+B)': 'Bold (Cmd+B)',
  'Kursiv (Cmd+I)': 'Italic (Cmd+I)',
  'Durchgestrichen': 'Strikethrough',
  'Aufgabenliste (Checkliste)': 'Task list (Checklist)',
  'Aufgabe': 'Task',
  'Aufzählungsliste': 'Bulleted list',
  'Liste': 'List',
  'Nummerierte Liste': 'Numbered list',
  'Nummeriert': 'Numbered',
  'Zitat / Info-Kasten': 'Quote / Callout',
  '❝ Zitat': '❝ Quote',
  'Tabelle einfügen': 'Insert table',
  '田 Tabelle': '田 Table',
  'Code-Block': 'Code block',
  '<> Code': '<> Code',
  'Markdown-Quelltext anzeigen oder bearbeiten': 'View or edit Markdown source',
  'Mit KI-Agent an diesem Dokument zusammenarbeiten': 'Cowork with AI Agent on this document',
  'Mit KI-Agent an den ausgewählten Zeilen zusammenarbeiten': 'Cowork with AI Agent on selected lines',
  'Symbolleiste einklappen': 'Collapse toolbar',
  'Symbolleiste ausklappen': 'Expand toolbar',
  'Schließen': 'Close',
  'Markdown eingeben...': 'Enter Markdown...',

  // Code block
  'Code': 'Code',
  'Code-Typ bearbeiten': 'Edit code language',
  '// Code hier eingeben...': '// Enter code here...',

  // Quote
  'Zitat...': 'Quote...',

  // Block delete
  'Block löschen': 'Delete block',
  'Tabelle löschen?': 'Delete table?',
  'Möchten Sie diese Tabelle wirklich löschen?': 'Are you sure you want to delete this table?',
  'Code-Block löschen?': 'Delete code block?',
  'Möchten Sie diesen Code-Block wirklich löschen?': 'Are you sure you want to delete this code block?',
  'Zitat löschen?': 'Delete quote?',
  'Möchten Sie dieses Zitat wirklich löschen?': 'Are you sure you want to delete this quote?',
  'Trennlinie löschen?': 'Delete divider?',
  'Möchten Sie diese Trennlinie wirklich löschen?': 'Are you sure you want to delete this divider?',
  'Block löschen?': 'Delete block?',
  'Möchten Sie diesen Block wirklich löschen?': 'Are you sure you want to delete this block?',
  'Abbrechen': 'Cancel',
  'Löschen': 'Delete',

  // Table controls
  'Spalte ziehen zum Verschieben': 'Drag column to reorder',
  'Spalte löschen': 'Delete column',
  'Spalte löschen?': 'Delete column?',
  'Inhalte in dieser Spalte gehen verloren.': 'Contents in this column will be lost.',
  'Spalte hinzufügen': 'Add column',
  'Spalte hier einfügen': 'Insert column here',
  'Spalte {0}': 'Column {0}',
  'Zeile ziehen zum Verschieben': 'Drag row to reorder',
  'Zeile löschen': 'Delete row',
  'Zeile löschen?': 'Delete row?',
  'Inhalte in dieser Zeile gehen verloren.': 'Contents in this row will be lost.',
  'Zeile hinzufügen': 'Add row',
  'Zeile hier einfügen': 'Insert row here',

  // Table default templates
  'Spalte 1': 'Column 1',
  'Spalte 2': 'Column 2',
  'Spalte 3': 'Column 3',
  'Inhalt 1': 'Content 1',
  'Inhalt 2': 'Content 2',
  'Inhalt 3': 'Content 3',
  'Inhalt 4': 'Content 4',
  'Inhalt 5': 'Content 5',
  'Inhalt 6': 'Content 6',
};

/**
 * Translates a key for the webview.
 */
export function translateWebview(
  lang: WebviewLanguage,
  key: string,
  ...args: (string | number)[]
): string {
  let template = key;
  if (lang === 'en') {
    template = enWebviewTranslations[key] || key;
  }

  if (args.length > 0) {
    return template.replace(/\{(\d+)\}/g, (match, index) => {
      const idx = parseInt(index, 10);
      return idx >= 0 && idx < args.length ? String(args[idx]) : match;
    });
  }

  return template;
}

/**
 * Translates a key based on the current webview language.
 */
export function tWebview(key: string, ...args: (string | number)[]): string {
  const lang = getWebviewLanguage();
  return translateWebview(lang, key, ...args);
}
