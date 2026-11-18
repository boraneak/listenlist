import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLocalAIResult, getLocalAIAvailability } from '../src/local-ai.js';

test('reports unavailable when the browser has no built-in model API', async () => {
  const original = globalThis.LanguageModel;
  try {
    delete globalThis.LanguageModel;
    assert.equal(await getLocalAIAvailability(), 'unavailable');
    await assert.rejects(
      generateLocalAIResult({ action: 'title', text: 'Some text', onProgress() {} }),
      /does not provide its built-in/
    );
  } finally {
    if (original === undefined) delete globalThis.LanguageModel;
    else globalThis.LanguageModel = original;
  }
});

test('uses the browser model to suggest a title and releases the session', async () => {
  const original = globalThis.LanguageModel;
  let promptText;
  let destroyed = false;
  globalThis.LanguageModel = {
    create: async () => ({
      prompt: async (value) => {
        promptText = value;
        return '"A Helpful Title"';
      },
      destroy() {
        destroyed = true;
      },
    }),
  };

  try {
    const result = await generateLocalAIResult({ action: 'title', text: 'A short article.', onProgress() {} });
    assert.equal(result, 'A Helpful Title');
    assert.match(promptText, /A short article/);
    assert.equal(destroyed, true);
  } finally {
    if (original === undefined) delete globalThis.LanguageModel;
    else globalThis.LanguageModel = original;
  }
});

test('organizes source passages without accepting incomplete boundaries', async () => {
  const original = globalThis.LanguageModel;
  globalThis.LanguageModel = {
    create: async () => ({
      prompt: async (_value, options) => {
        assert.deepEqual(options.responseConstraint.required, ['sections']);
        return JSON.stringify({ sections: [{ title: 'Opening', start: 1, end: 1 }, { title: 'Next', start: 2, end: 2 }] });
      },
      destroy() {},
    }),
  };

  try {
    const result = await generateLocalAIResult({
      action: 'sections',
      text: 'First passage.\n\nSecond passage.',
      onProgress() {},
    });
    assert.equal(result, '## Opening\n\nFirst passage.\n\n## Next\n\nSecond passage.');
  } finally {
    if (original === undefined) delete globalThis.LanguageModel;
    else globalThis.LanguageModel = original;
  }
});

test('rejects section output that skips source passages', async () => {
  const original = globalThis.LanguageModel;
  globalThis.LanguageModel = {
    create: async () => ({
      prompt: async () => JSON.stringify({ sections: [{ title: 'Opening', start: 1, end: 1 }] }),
      destroy() {},
    }),
  };

  try {
    await assert.rejects(
      generateLocalAIResult({
        action: 'sections',
        text: 'First passage.\n\nSecond passage.',
        onProgress() {},
      }),
      /did not organize all of the text/
    );
  } finally {
    if (original === undefined) delete globalThis.LanguageModel;
    else globalThis.LanguageModel = original;
  }
});
