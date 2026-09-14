import {it,expect,afterEach} from 'vitest';
import {generateKeyPairSync,verify} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {initReceipts,issueLedgerReceipt} from '../receipts.js';
import {computeGrade} from '../grade.js';
import {hashTranscriptGradeProjection} from '../transcript-canonical.js';
import {PHASE3_CONFIG} from '../grade-config.js';
afterEach(()=>{delete process.env.RECEIPT_ISSUER_PRIVATE_KEY;initReceipts();});
it.each([['lesson-check',10],['try-it',2],['topic-assessment',100],['flashcard',80]])('signs and verifies the %s ledger source without changing its score scale',(source,score)=>{
 const keys=generateKeyPairSync('ed25519');
 process.env.RECEIPT_ISSUER_PRIVATE_KEY=keys.privateKey.export({format:'der',type:'pkcs8'}).toString('base64');initReceipts();
 const receipt=issueLedgerReceipt({studentId:'a2-student',source,itemId:'fixture-item',score,attempt:1,evidenceTier:'practice',response:'fixture'});
 const [body,sig]=receipt.compact.split('.');const bytes=Buffer.from(body,'base64url');
 expect(verify(null,bytes,keys.publicKey,Buffer.from(sig,'base64url'))).toBe(true);
 expect(JSON.parse(bytes).src).toBe(source);expect(JSON.parse(bytes).sc).toBe(score);
});
it('binds district category scores into the transcript grade hash',()=>{
 const cfg={...PHASE3_CONFIG,useDistrictFormula:true};
 const opts={items:[{itemId:'TA-U1',source:'topic-assessment',dueDate:'2026-10-01'}],asOf:new Date('2026-10-10T16:00:00Z')};
 const grade=computeGrade([{item_id:'TA-U1',source:'topic-assessment',score:80}],{},cfg,opts);
 expect(hashTranscriptGradeProjection(grade)).not.toBe(hashTranscriptGradeProjection({...grade,quarters:{...grade.quarters,Q1:{...grade.quarters.Q1,quarterGrade:90}}}));
});
it('defaults district ON and v3 OFF',()=>{
 const env={...process.env};delete env.USE_DISTRICT_FORMULA;delete env.USE_V3_GRADING;
 const cmd="import('./grade-config.js').then(m=>console.log(JSON.stringify([m.PHASE3_CONFIG.useDistrictFormula,m.PHASE3_CONFIG.useV3])))";
 expect(execFileSync(process.execPath,['-e',cmd],{env,encoding:'utf8'}).trim()).toBe('[true,false]');
});
