import assert from 'assert';
import Module from 'module';

// Configure a controllable vscode mock before loading i18n
let mockLanguageSetting: string = 'auto';
let mockEnvLanguage: string = 'en';

const origResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string) {
  if (request === 'vscode') {
    return 'vscode';
  }
  return origResolve.apply(this, arguments);
};

const origLoad = (Module as any)._load;
(Module as any)._load = function (request: string, parent: any, isMain: boolean) {
  if (request === 'vscode') {
    return {
      workspace: {
        getConfiguration: (section: string) => {
          if (section === 'agentCowork') {
            return {
              get: (key: string, defaultValue?: any) => {
                if (key === 'language') {
                  return mockLanguageSetting;
                }
                return defaultValue;
              },
            };
          }
          return { get: (_k: string, def?: any) => def };
        },
      },
      env: {
        get language() {
          return mockEnvLanguage;
        },
      },
    };
  }
  return origLoad.apply(this, arguments);
};

// Load i18n dynamically after the loader hooks are active
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getEffectiveLanguage, t, translate } = require('../src/i18n');

describe('Extension Host i18n Module', () => {
  beforeEach(() => {
    mockLanguageSetting = 'auto';
    mockEnvLanguage = 'en';
  });

  describe('getEffectiveLanguage', () => {
    it('forces English when setting is "en" regardless of env language', () => {
      mockLanguageSetting = 'en';
      mockEnvLanguage = 'de-DE';
      assert.strictEqual(getEffectiveLanguage(), 'en');
    });

    it('forces German when setting is "de" regardless of env language', () => {
      mockLanguageSetting = 'de';
      mockEnvLanguage = 'en-US';
      assert.strictEqual(getEffectiveLanguage(), 'de');
    });

    it('detects German when setting is "auto" and env language starts with "de"', () => {
      mockLanguageSetting = 'auto';
      mockEnvLanguage = 'de';
      assert.strictEqual(getEffectiveLanguage(), 'de');

      mockEnvLanguage = 'de-DE';
      assert.strictEqual(getEffectiveLanguage(), 'de');

      mockEnvLanguage = 'de-AT';
      assert.strictEqual(getEffectiveLanguage(), 'de');
    });

    it('defaults to English when setting is "auto" and env language is English or other', () => {
      mockLanguageSetting = 'auto';
      mockEnvLanguage = 'en';
      assert.strictEqual(getEffectiveLanguage(), 'en');

      mockEnvLanguage = 'en-US';
      assert.strictEqual(getEffectiveLanguage(), 'en');

      mockEnvLanguage = 'fr';
      assert.strictEqual(getEffectiveLanguage(), 'en');

      mockEnvLanguage = 'es';
      assert.strictEqual(getEffectiveLanguage(), 'en');
    });
  });

  describe('t and translate', () => {
    it('translates known keys to English when effective language is "en"', () => {
      mockLanguageSetting = 'en';
      assert.strictEqual(t('Willkommen bei Agent Cowork'), 'Welcome to Agent Cowork');
      assert.strictEqual(t('Theme aktivieren'), 'Activate Theme');
      assert.strictEqual(t('Erste Schritte'), 'Getting Started');
    });

    it('keeps German keys when effective language is "de"', () => {
      mockLanguageSetting = 'de';
      assert.strictEqual(t('Willkommen bei Agent Cowork'), 'Willkommen bei Agent Cowork');
      assert.strictEqual(t('Theme aktivieren'), 'Theme aktivieren');
      assert.strictEqual(t('Erste Schritte'), 'Erste Schritte');
    });

    it('interpolates arguments into translated templates', () => {
      mockLanguageSetting = 'en';
      const resEn = t('Möchten Sie "{0}" wirklich löschen?', 'test.md');
      assert.strictEqual(resEn, 'Are you sure you want to delete "{0}"?'.replace('{0}', 'test.md'));

      mockLanguageSetting = 'de';
      const resDe = t('Möchten Sie "{0}" wirklich löschen?', 'test.md');
      assert.strictEqual(resDe, 'Möchten Sie "test.md" wirklich löschen?');
    });

    it('falls back to key if translation is missing', () => {
      mockLanguageSetting = 'en';
      const unknownKey = 'Ein völlig unbekannter Text für Tests';
      assert.strictEqual(t(unknownKey), unknownKey);
    });

    it('translate allows explicit language overrides', () => {
      assert.strictEqual(
        translate('en', 'Willkommen bei Agent Cowork'),
        'Welcome to Agent Cowork'
      );
      assert.strictEqual(
        translate('de', 'Willkommen bei Agent Cowork'),
        'Willkommen bei Agent Cowork'
      );
    });
  });
});
