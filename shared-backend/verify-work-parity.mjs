#!/usr/bin/env node
// Private source payload versus D1 export. Never commit either input.
import fs from 'node:fs';
import { compareWorkState } from './work-parity-core.mjs';
const [sourcePath,targetPath]=process.argv.slice(2);
if(!sourcePath||!targetPath){console.error('Usage: node shared-backend/verify-work-parity.mjs source.json target.json');process.exit(2);}
const result=compareWorkState(JSON.parse(fs.readFileSync(sourcePath,'utf8')),JSON.parse(fs.readFileSync(targetPath,'utf8')));
console.log(JSON.stringify(result,null,2));
process.exit(result.summary.pass?0:1);
