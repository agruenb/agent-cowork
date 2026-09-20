import assert from 'assert';
import { vscodeMockState, resetVscodeMock } from './vscodeMock';

// Load i18n dynamically after the loader hooks are active
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getEffectiveLanguage, t, translate } = require('../src/i18n');

describe('Extension Host i18n Module', () => {
  beforeEach(() => {
    resetVscodeMock();
  });

  describe('getEffectiveLanguage', () => {
    it('forces English when setting is "en" regardless of env language', () => {
      vscodeMockState.languageSetting = 'en';
      vscodeMockState.envLanguage = 'de-DE';
      assert.strictEqual(getEffectiveLanguage(), 'en');
    });

    it('forces German when setting is "de" regardless of env language', () => {
      vscodeMockState.languageSetting = 'de';
      vscodeMockState.envLanguage = 'en-US';
      assert.strictEqual(getEffectiveLanguage(), 'de');
    });

    it('detects German when setting is "auto" and env language starts with "de"', () => {
      vscodeMockState.languageSetting = 'auto';
      vscodeMockState.envLanguage = 'de';
      assert.strictEqual(getEffectiveLanguage(), 'de');

      vscodeMockState.envLanguage = 'de-DE';
      assert.strictEqual(getEffectiveLanguage(), 'de');

      vscodeMockState.envLanguage = 'de-AT';
      assert.strictEqual(getEffectiveLanguage(), 'de');
    });

    it('defaults to English when setting is "auto" and env language is English or other', () => {
      vscodeMockState.languageSetting = 'auto';
      vscodeMockState.envLanguage = 'en';
      assert.strictEqual(getEffectiveLanguage(), 'en');

      vscodeMockState.envLanguage = 'en-US';
      assert.strictEqual(getEffectiveLanguage(), 'en');

      vscodeMockState.envLanguage = 'fr';
      assert.strictEqual(getEffectiveLanguage(), 'en');

      vscodeMockState.envLanguage = 'es';
      assert.strictEqual(getEffectiveLanguage(), 'en');
    });
  });

  describe('t and translate', () => {
    it('translates known keys to English when effective language is "en"', () => {
      vscodeMockState.languageSetting = 'en';
      assert.strictEqual(t('Willkommen bei Agent Cowork'), 'Welcome to Agent Cowork');
      assert.strictEqual(t('Theme aktivieren'), 'Activate Theme');
      assert.strictEqual(t('Erste Schritte'), 'Getting Started');
    });

    it('keeps German keys when effective language is "de"', () => {
      vscodeMockState.languageSetting = 'de';
      assert.strictEqual(t('Willkommen bei Agent Cowork'), 'Willkommen bei Agent Cowork');
      assert.strictEqual(t('Theme aktivieren'), 'Theme aktivieren');
      assert.strictEqual(t('Erste Schritte'), 'Erste Schritte');
    });

    it('interpolates arguments into translated templates', () => {
      vscodeMockState.languageSetting = 'en';
      const resEn = t('Möchten Sie "{0}" wirklich löschen?', 'test.md');
      assert.strictEqual(resEn, 'Are you sure you want to delete "{0}"?'.replace('{0}', 'test.md'));

      vscodeMockState.languageSetting = 'de';
      const resDe = t('Möchten Sie "{0}" wirklich löschen?', 'test.md');
      assert.strictEqual(resDe, 'Möchten Sie "test.md" wirklich löschen?');
    });

    it('falls back to key if translation is missing', () => {
      vscodeMockState.languageSetting = 'en';
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
