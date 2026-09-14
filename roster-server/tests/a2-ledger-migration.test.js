import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
it('A2 migration admits four sources, preserves best assessments atomically and replaces Try-Its',async()=>{
 const pg=new PGlite();
 try {
  await pg.exec('CREATE TABLE item_ledger (item_id text PRIMARY KEY, source text, score numeric);');
  await pg.exec(readFileSync(new URL('../migrations/0037_a2_ledger_sources.sql',import.meta.url),'utf8'));
  for(const [source,score] of [['lesson-check',10],['topic-assessment',100],['try-it',2],['flashcard',80]]) {
   await pg.query('INSERT INTO item_ledger VALUES ($1,$2,$3)',[source,source,score]);
   await pg.query('UPDATE item_ledger SET score=0 WHERE item_id=$1',[source]);
   const out=await pg.query('SELECT score FROM item_ledger WHERE item_id=$1',[source]);
   expect(Number(out.rows[0].score)).toBe(source==='try-it'?0:score);
  }
  await expect(pg.query("INSERT INTO item_ledger VALUES ('retired','pc',1)")).rejects.toThrow();
 } finally {await pg.close();}
});
