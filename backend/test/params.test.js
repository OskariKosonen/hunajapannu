const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { parseListParams } = require('../lib/params');

const req = (query) => ({ query });
const opts = { defaultLimit: 100, maxLimit: 1000 };

describe('parseListParams', () => {
  describe('limit', () => {
    test('falls back to the default when absent or unparseable', () => {
      assert.equal(parseListParams(req({}), opts).limit, 100);
      assert.equal(parseListParams(req({ limit: 'abc' }), opts).limit, 100);
    });

    test('clamps to maxLimit so one request cannot pull the whole table', () => {
      assert.equal(parseListParams(req({ limit: '999999' }), opts).limit, 1000);
    });

    test('floors at 1, since LIMIT 0 and LIMIT -1 are useless or invalid', () => {
      assert.equal(parseListParams(req({ limit: '0' }), opts).limit, 1);
      assert.equal(parseListParams(req({ limit: '-5' }), opts).limit, 1);
    });
  });

  describe('offset', () => {
    test('defaults to 0 and never goes negative', () => {
      assert.equal(parseListParams(req({}), opts).offset, 0);
      assert.equal(parseListParams(req({ offset: '-10' }), opts).offset, 0);
    });

    test('passes a valid offset through for pagination', () => {
      assert.equal(parseListParams(req({ offset: '250' }), opts).offset, 250);
    });
  });

  describe('search escaping', () => {
    test('is null when no search was given, so the query skips the filter', () => {
      assert.equal(parseListParams(req({}), opts).like, null);
      assert.equal(parseListParams(req({ search: '   ' }), opts).like, null);
    });

    test('wraps a plain term in wildcards', () => {
      assert.equal(parseListParams(req({ search: 'wget' }), opts).like, '%wget%');
    });

    test('escapes % so a user typing it does not match every row', () => {
      // This is the bug worth guarding: unescaped, '%' makes ILIKE '%%%'
      // which matches everything and looks like a working search.
      assert.equal(parseListParams(req({ search: '%' }), opts).like, '%\\%%');
      assert.equal(parseListParams(req({ search: '50%' }), opts).like, '%50\\%%');
    });

    test('escapes _ , which otherwise matches any single character', () => {
      assert.equal(parseListParams(req({ search: 'a_b' }), opts).like, '%a\\_b%');
    });

    test('escapes the backslash itself, so it cannot escape our escapes', () => {
      assert.equal(parseListParams(req({ search: '\\' }), opts).like, '%\\\\%');
      // A crafted "\%" must stay two literal characters, not become an
      // escaped-backslash followed by a live wildcard.
      assert.equal(parseListParams(req({ search: '\\%' }), opts).like, '%\\\\\\%%');
    });

    test('trims surrounding whitespace but keeps the term intact', () => {
      const { search, like } = parseListParams(req({ search: '  root  ' }), opts);
      assert.equal(search, 'root');
      assert.equal(like, '%root%');
    });

    test('caps the term at 200 characters', () => {
      const { search } = parseListParams(req({ search: 'x'.repeat(500) }), opts);
      assert.equal(search.length, 200);
    });

    test('ignores a non-string search (?search=a&search=b arrives as an array)', () => {
      assert.equal(parseListParams(req({ search: ['a', 'b'] }), opts).like, null);
      assert.equal(parseListParams(req({ search: { $ne: null } }), opts).like, null);
    });
  });
});
