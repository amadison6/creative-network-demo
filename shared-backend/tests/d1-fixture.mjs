import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

export function fixture() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON; CREATE TABLE profiles (id TEXT PRIMARY KEY, archived_at TEXT, notes TEXT); INSERT INTO profiles VALUES (\'person_fixture\',NULL,\'legacy sentinel\');');
  for(const file of ['001_work_layer.sql','002_work_operations.sql'])sqlite.exec(fs.readFileSync(fileURLToPath(new URL('../schema/'+file,import.meta.url)),'utf8'));
  sqlite.prepare('INSERT INTO work_schema_meta (key,value,updated_at) VALUES (?,?,?)').run('phase2_environment','isolated-test','fixture');
  let failNextBatch=false;
  function execute(sql,args,method) {const st=sqlite.prepare(sql);return method==='all'?{results:st.all(...args)}:method==='first'?st.get(...args)||null:st.run(...args);}
  function statement(sql,args=[]) {return {sql,params:args,bind(...p){return statement(sql,p);},async all(){return execute(sql,args,'all');},async first(){return execute(sql,args,'first');},async run(){return execute(sql,args,'run');}};}
  const DB={prepare:sql=>statement(sql),async batch(items) {
    sqlite.exec('BEGIN');
    try {const results=[];for(const [i,item] of items.entries()){results.push(execute(item.sql,item.params,'run'));if(failNextBatch && i===1){failNextBatch=false;throw new Error('injected failure');}}sqlite.exec('COMMIT');return results;}
    catch(error){sqlite.exec('ROLLBACK');throw error;}
  }};
  return {sqlite,DB,failBatch:()=>{failNextBatch=true;},env:{DB,WORK_API_TOKEN:'test-only-never-live',WORK_WRITE_MODE:'isolated-test'}};
}
