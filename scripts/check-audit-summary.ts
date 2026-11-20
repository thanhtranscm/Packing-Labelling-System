import assert from 'node:assert/strict';
import {auditSummary} from '../lib/audit-summary';
const dates={changes:Array.from({length:132},(_,i)=>({path:'months / November 2026.orders / WSV'+i+'.createDate',before:'2026-06-01 00:00:00',after:'2026-06-01'}))};
assert.deepEqual(auditSummary(dates),[]);
const imported=auditSummary(dates,'Imported 132 POs from master.xlsx');assert.equal(imported.length,2);assert.equal(imported[0].after,'132');assert.equal(imported[1].after,'master.xlsx');
assert.equal(auditSummary({changes:[{path:'months / November 2026.orders / A.createDate',before:'2026-06-01',after:'2026-06-02'}]}).length,1);
assert.equal(auditSummary({summary:imported})[0].after,'132');
assert.equal(auditSummary({changes:[{path:'months / November 2026.status',before:'Active',after:'Reroute'}]})[0].after,'Reroute');
console.log('Audit summaries: import compaction, equivalent dates, real date changes, API summary and status passed.');
