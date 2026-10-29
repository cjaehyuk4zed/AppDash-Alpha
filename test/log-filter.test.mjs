import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logFilter } from '../server/log-filter.mjs';

test('log masking handles chunk boundaries, multiline values and overlapping secrets',()=>{
 const values=['abc\ndef','abc','token-123'];let output='';const filter=logFilter(values,s=>output+=s);
 for(const char of 'ready\nabc\ndef and token-123 and abc!')filter.write(char);
 filter.end();assert.equal(output,'ready\n[REDACTED] and [REDACTED] and [REDACTED]!');
});
test('log masking displays ordinary output immediately and masks newly granted values',()=>{
 const values=['secret'];let output='';const filter=logFilter(values,s=>output+=s);
 filter.write('ready\n');assert.equal(output,'ready\n');values.push('rotated');filter.write('rot');assert.equal(output,'ready\n');filter.write('ated\nse');filter.end();assert.equal(output,'ready\n[REDACTED]\nse');
});
