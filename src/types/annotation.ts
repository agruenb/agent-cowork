/**
 * Document annotation interface representing user comments attached to document text.
 * Annotations are stored outside of the Markdown document itself (in VS Code workspaceState
 * and webview state) to ensure the Markdown file on disk remains clean.
 */
export interface DocumentAnnotation {
  /** Unique ID of the annotation */
  id: string;
  /** Exact selected text snippet */
  selectedText: string;
  /** Context preceding the selected text (used for disambiguation) */
  prefix: string;
  /** Context following the selected text (used for disambiguation) */
  suffix: string;
  /** User's annotation / comment */
  comment: string;
  /** Timestamp when annotation was created */
  createdAt: number;
}

/**
 * Formats the document content and annotations into a clean chat prompt
 * without any pre-baked or directive instructions.
 */
export function formatAnnotationsChatPrompt(
  fileName: string,
  annotations: DocumentAnnotation[],
  markdownContent: string
): string {
  let output = `# ${fileName}\n\n`;

  if (annotations.length > 0) {
    output += `## Annotations\n`;
    for (let i = 0; i < annotations.length; i++) {
      const ann = annotations[i];
      output += `${i + 1}. **"${ann.selectedText}"**: ${ann.comment}\n`;
    }
    output += `\n`;
  }

  output += `## Document\n\n`;
  output += markdownContent.trim();
  output += `\n`;

  return output;
}

