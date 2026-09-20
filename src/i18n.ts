import * as vscode from 'vscode';

export type SupportedLanguage = 'en' | 'de';

/**
 * Returns the effective language for Agent Cowork.
 * Follows the 'agentCowork.language' configuration setting:
 * - 'en': force English
 * - 'de': force German
 * - 'auto' (or unspecified): automatically detect from the editor's display language (vscode.env.language)
 */
export function getEffectiveLanguage(): SupportedLanguage {
  try {
    const config = vscode.workspace.getConfiguration('agentCowork');
    const lang = config.get<string>('language', 'auto');
    if (lang === 'en') {
      return 'en';
    }
    if (lang === 'de') {
      return 'de';
    }
  } catch {
    // Fallback if workspace configuration is unavailable
  }

  const envLang = (vscode.env.language || '').toLowerCase();
  if (envLang.startsWith('de')) {
    return 'de';
  }
  return 'en';
}

const enTranslations: Record<string, string> = {
  'Willkommen bei Agent Cowork': 'Welcome to Agent Cowork',
  'Ihre intuitive Arbeitsumgebung für KI-gestütztes Arbeiten':
    'Your intuitive workspace for AI-powered collaboration',
  'Erste Schritte': 'Getting Started',
  'Arbeitsordner öffnen': 'Open Workspace Folder',
  'Ordner öffnen': 'Open Folder',
  'Wählen Sie einen Arbeitsordner für Ihre Projekte und Dokumente.':
    'Select a workspace folder for your projects and documents.',
  'Theme aktivieren': 'Activate Theme',
  'Stellen Sie das augenfreundliche, helle Design mit grünen Akzenten ein.':
    'Set the eye-friendly, light design with green accents.',
  'Agenten starten': 'Start AI Agent',
  'Öffnen Sie die Befehlspalette, um mit Ihren Agenten zu interagieren.':
    'Open the command palette to interact with your agents.',
  'Tipps für Einsteiger': 'Tips for Beginners',
  'Sie benötigen kein Programmierwissen. Formulieren Sie Ihre Aufgaben einfach in natürlicher Sprache.':
    "You don't need any programming knowledge. Simply formulate your tasks in plain language.",
  'Alle Ihre Änderungen und erstellten Dokumente bleiben sicher auf Ihrem Computer.':
    'All your changes and created documents stay safe on your computer.',
  'Beim Start immer anzeigen': 'Always show on startup',
  'Startseite anzeigen': 'Show Welcome Page',
  'Hallo von Agent Cowork!': 'Hello from Agent Cowork!',
  'Agent Cowork Light Theme angewendet!': 'Agent Cowork Light theme applied!',
  'Vereinfachte Ansicht aktiviert! Seitenleisten-Buttons wurden ausgeblendet.':
    'Simplified view activated! Side buttons have been hidden.',
  'Arbeitsordner auswählen': 'Select Workspace Folder',
  'Ordner auswählen': 'Select Folder',
  'Bitte öffnen Sie zuerst einen Ordner, um eine Datei zu erstellen.':
    'Please open a folder first to create a file.',
  'Dateinamen eingeben (z. B. aufgabe.md)': 'Enter file name (e.g. task.md)',
  'Der Dateiname darf nicht leer sein.': 'File name cannot be empty.',
  'Der Dateiname enthält ungültige Zeichen.': 'File name contains invalid characters.',
  'Eine Datei mit diesem Namen existiert bereits.': 'A file with this name already exists.',
  'Fehler beim Erstellen der Datei: {0}': 'Error creating file: {0}',
  'Bitte öffnen Sie zuerst einen Ordner, um einen Ordner zu erstellen.':
    'Please open a folder first to create a folder.',
  'Ordnernamen eingeben': 'Enter folder name',
  'Der Ordnername darf nicht leer sein.': 'Folder name cannot be empty.',
  'Der Ordnername enthält ungültige Zeichen.': 'Folder name contains invalid characters.',
  'Ein Ordner oder eine Datei mit diesem Namen existiert bereits.':
    'A folder or file with this name already exists.',
  'Fehler beim Erstellen des Ordners: {0}': 'Error creating folder: {0}',
  'Keine Datei oder Ordner zum Umbenennen ausgewählt.':
    'No file or folder selected for renaming.',
  'Neuen Namen eingeben': 'Enter new name',
  'Der Name darf nicht leer sein.': 'Name cannot be empty.',
  'Der Name enthält ungültige Zeichen.': 'Name contains invalid characters.',
  '"{0}" existiert bereits. Möchten Sie es ersetzen?':
    '"{0}" already exists. Do you want to replace it?',
  'Ersetzen': 'Replace',
  'Abbrechen': 'Cancel',
  'Speichern': 'Save',
  'Überspringen': 'Skip',
  'Löschen': 'Delete',
  'Fehler beim Umbenennen: {0}': 'Error renaming: {0}',
  'Keine Datei oder Ordner zum Duplizieren ausgewählt.':
    'No file or folder selected for duplicating.',
  'Fehler beim Duplizieren: {0}': 'Error duplicating: {0}',
  '"{0}" kopiert': '"{0}" copied',
  '"{0}" ausgeschnitten': '"{0}" cut',
  'Die Zwischenablage enthält keine Datei oder Ordner.':
    'Clipboard does not contain a file or folder.',
  'Kein Zielordner zum Einfügen gefunden.': 'No target folder found for pasting.',
  'Der Ordner kann nicht in sich selbst oder einen Unterordner eingefügt werden.':
    'The folder cannot be pasted into itself or a subfolder.',
  '"{0}" existiert am Zielort bereits. Möchten Sie es ersetzen?':
    '"{0}" already exists at target location. Do you want to replace it?',
  '"{0}" existiert am Zielort bereits. Möchten Sie die Datei ersetzen?':
    '"{0}" already exists at target location. Do you want to replace the file?',
  'Fehler beim Einfügen: {0}': 'Error pasting: {0}',
  'Möchten Sie "{0}" wirklich löschen?': 'Are you sure you want to delete "{0}"?',
  'Fehler beim Löschen: {0}': 'Error deleting: {0}',
  'Fehler beim Verschieben/Kopieren: {0}': 'Error moving/copying: {0}',
  'Der Ordner "{0}" kann nicht in sich selbst oder einen Unterordner verschoben werden.':
    'The folder "{0}" cannot be moved into itself or a subfolder.',
  'Ordner "{0}" ist bereit für Cowork. Bitte öffnen Sie das KI-Chatfenster (z. B. GitHub Copilot oder Gemini).':
    'Folder "{0}" is ready for Cowork. Please open the AI chat window (e.g. GitHub Copilot or Gemini).',
  'Datei "{0}" ist bereit für Cowork. Bitte öffnen Sie das KI-Chatfenster (z. B. GitHub Copilot oder Gemini).':
    'File "{0}" is ready for Cowork. Please open the AI chat window (e.g. GitHub Copilot or Gemini).',
  'Keine Datei und kein Ordner gefunden, um mit dem KI-Agenten zusammenzuarbeiten.':
    'No file or folder found to collaborate with the AI agent.',
  'Agent Cowork: Der gesamte Inhalt kann nicht gelöscht werden. Um den Text zu bearbeiten, verwenden Sie den Quelltext-Modus (Raw).':
    'Agent Cowork: The entire content cannot be deleted. To edit the text, use raw source mode.',
  'Agent Cowork: Das Dokument hat keinen Inhalt. Möchten Sie die leere Datei wirklich speichern?':
    'Agent Cowork: The document has no content. Do you really want to save the empty file?',
  'Agent Cowork: Formatierungsfehler im Markdown-Dokument ({0}). Es wurde in den Raw-Modus gewechselt, um Datenverlust zu verhindern.':
    'Agent Cowork: Formatting error in markdown document ({0}). Switched to raw mode to prevent data loss.',
  'Agent Cowork: Fehler beim Konvertieren der Formatierung ({0}). Die Änderung wurde nicht gespeichert, um Datenverlust zu verhindern.':
    'Agent Cowork: Error converting formatting ({0}). Changes were not saved to prevent data loss.',
  'Syntax-Fehler': 'Syntax error',
  'DOM-Fehler': 'DOM error',
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
  'Markdown-Quelltext anzeigen oder bearbeiten': 'View or edit Markdown source',
  'Mit KI-Agent an diesem Dokument zusammenarbeiten':
    'Cowork with AI Agent on this document',
  'Symbolleiste einklappen': 'Collapse toolbar',
  'Symbolleiste ausklappen': 'Expand toolbar',
  'Schließen': 'Close',
  'Markdown eingeben...': 'Enter Markdown...',
};

const deTranslations: Record<string, string> = {
  // German keys match default German string keys
};

/**
 * Translates a key for a given language, formatting arguments {0}, {1}, etc.
 */
export function translate(
  lang: SupportedLanguage,
  key: string,
  ...args: (string | number)[]
): string {
  let template = key;
  if (lang === 'en') {
    template = enTranslations[key] || key;
  } else if (lang === 'de') {
    template = deTranslations[key] || key;
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
 * Convenience translate function that automatically detects the effective language
 * from the editor configuration or environment.
 */
export function t(key: string, ...args: (string | number)[]): string {
  const lang = getEffectiveLanguage();
  return translate(lang, key, ...args);
}
