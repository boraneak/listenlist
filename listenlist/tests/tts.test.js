import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_WORDS, countWords, generateAudio, isWithinWordLimit, planChunks } from '../src/tts.js';

test('counts words separated by whitespace', () => {
  assert.equal(countWords('  one\n two\tthree  '), 3);
  assert.equal(countWords(' \n\t'), 0);
});

test('keeps over-limit text intact while rejecting it for generation', async () => {
  const text = Array.from({ length: MAX_WORDS + 1 }, (_, i) => `word${i}`).join(' ');

  assert.equal(isWithinWordLimit(text), false);
  assert.equal(countWords(text), MAX_WORDS + 1);
  await assert.rejects(
    generateAudio({ text, voiceId: 'en_US-hfc_female-medium', onStatus() {} }),
    /Shorten the text to create audio; your full draft is preserved/
  );
});

test('accepts text at the word limit', () => {
  const text = Array.from({ length: MAX_WORDS }, (_, i) => `word${i}`).join(' ');
  assert.equal(isWithinWordLimit(text), true);
});

test('plans sentence cues at the original text offsets', () => {
  const text = 'First sentence. Second sentence!\n\nThird sentence?';
  const sentences = planChunks(text).flatMap((chunk) => chunk.sents);

  assert.deepEqual(
    sentences.map(({ start, end }) => text.slice(start, end)),
    ['First sentence.', 'Second sentence!', 'Third sentence?']
  );
});
