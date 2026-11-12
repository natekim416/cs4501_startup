// US-23 (#24) · Sort by the first page (opt-in, Could).
const test = require('node:test');
const assert = require('node:assert');

test('US-23 without opting in, only file names are used', () => {
  const { courseFor } = require('../../backend/first-page');
  assert.strictEqual(courseFor({ name: 'Lecture 7.pdf', firstPage: 'CS 2150 Program and Data Representation' }, { optIn: false }), null);
});

test('US-23 when opted in, the first page finds the course code and the reason says so', () => {
  const { courseFor } = require('../../backend/first-page');
  const r = courseFor({ name: 'Lecture 7.pdf', firstPage: 'CS 2150 Program and Data Representation' }, { optIn: true });
  assert.strictEqual(r.course, 'CS2150');
  assert.match(r.reason, /course code on page 1: CS 2150/);
});

test('US-23 no course code found means Unsorted or a question', () => {
  const { courseFor } = require('../../backend/first-page');
  assert.strictEqual(courseFor({ name: 'scan.pdf', firstPage: 'hello' }, { optIn: true }).course, 'Unsorted');
});
