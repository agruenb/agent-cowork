import './vscodeMock';
import assert from 'assert';
import * as path from 'path';
import { getGitHeadContent, getOriginalContent } from '../src/markdownEditorProvider';

describe('Document Original Content & Git Diff Resolution', () => {
  it('retrieves Git HEAD content for tracked files in git repository', async () => {
    const filePath = path.resolve(__dirname, '../package.json');
    const mockUri = {
      fsPath: filePath,
      path: filePath,
      toString: () => `file://${filePath}`,
    } as any;

    const headContent = await getGitHeadContent(mockUri);
    assert.notStrictEqual(headContent, null);
    assert.ok(typeof headContent === 'string');
    assert.ok(headContent.includes('agent-cowork'));
  });

  it('returns null for non-existent or untracked files gracefully', async () => {
    const mockUri = {
      fsPath: '/non/existent/path/never_exists.md',
      path: '/non/existent/path/never_exists.md',
      toString: () => 'file:///non/existent/path/never_exists.md',
    } as any;

    const headContent = await getGitHeadContent(mockUri);
    assert.strictEqual(headContent, null);
  });

  it('does not treat Git HEAD differences as AI edits (returns null)', async () => {
    const filePath = path.resolve(__dirname, '../package.json');
    const mockUri = {
      fsPath: filePath,
      path: filePath,
      toString: () => `file://${filePath}`,
    } as any;

    const headContent = await getGitHeadContent(mockUri);
    assert.ok(headContent !== null);

    // Mock document with uncommitted git content
    const mockDoc = {
      uri: mockUri,
      isDirty: false,
      getText: () => headContent + '\n// modified locally or uncommitted in git',
    } as any;

    const original = await getOriginalContent(mockDoc);
    assert.strictEqual(original, null);
  });

  it('detects original content from virtual chat editing documents', async () => {
    const filePath = '/virtual/test/file.md';
    const mockUri = {
      fsPath: filePath,
      path: filePath,
      toString: () => `file://${filePath}`,
    } as any;

    const originalText = '# Original Version\nPre-AI content';
    const modifiedText = '# Modified Version\nAI updated content';

    const mockDoc = {
      uri: mockUri,
      isDirty: false,
      getText: () => modifiedText,
    } as any;

    const { vscodeMockState } = require('./vscodeMock');
    vscodeMockState.textDocuments = [
      {
        uri: {
          scheme: 'chat-editing-snapshot-text-model',
          path: filePath,
          fsPath: filePath,
          query: JSON.stringify({ session: 'session-123' }),
          toString: () => `chat-editing-snapshot-text-model://${filePath}`,
        },
        getText: () => originalText,
      },
    ];

    try {
      const detected = await getOriginalContent(mockDoc);
      assert.strictEqual(detected, originalText);
    } finally {
      vscodeMockState.textDocuments = [];
    }
  });

  it('does not treat dirty in-memory disk changes as AI edits (returns null)', async () => {
    const filePath = path.resolve(__dirname, '../package.json');
    const mockUri = {
      fsPath: filePath,
      path: filePath,
      toString: () => `file://${filePath}`,
    } as any;

    const mockDoc = {
      uri: mockUri,
      isDirty: true,
      getText: () => '{"name": "dirty-in-memory"}',
    } as any;

    const original = await getOriginalContent(mockDoc);
    assert.strictEqual(original, null);
  });
});

