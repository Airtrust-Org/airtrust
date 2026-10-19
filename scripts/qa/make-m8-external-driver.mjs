#!/usr/bin/env node
// Only for exercising the independent real-ZIP ingestion path with a synthetic,
// hand-authored QA course. Never use its answers for operational packages.
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {strToU8,zipSync} from 'fflate';
import {buildInteractiveM8QaFiles} from '../staging/lms-scorm-m8-fixture.mjs';

const dir=resolve(process.argv[2]||'/tmp/scorm-m8-real-zip-qa');
mkdirSync(dir,{recursive:true});
const files=buildInteractiveM8QaFiles('qa-external','qa-version-1');
const manifest='<manifest xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2" identifier="QA-EXTERNAL"><organizations/><resources><resource identifier="R" type="webcontent" adlcp:scormtype="sco" href="index.html"><file href="index.html"/></resource></resources></manifest>';
const zip=zipSync({...files,'imsmanifest.xml':strToU8(manifest)},{level:6});
const packageSha256=createHash('sha256').update(zip).digest('hex');
const driver={
 schemaVersion:1,packageSha256,launchFile:'index.html',scormVersion:'1.2',
 requiresAssessment:true,masteryScore:70,
 requiredContent:[{selector:'h1'},{selector:'img[alt="Fluxo de verificação"]'}],
 resume:{actions:[{op:'click',selector:'button[data-answer="1"]'}],
   assertion:{selector:'#submitAssessment',state:'enabled'}},
 fail:{actions:[{op:'click',selector:'button[data-answer="0"]'},
   {op:'click',selector:'#submitAssessment'}],expectedStatus:'failed'},
 pass:{actions:[{op:'click',selector:'button[data-answer="1"]'},
   {op:'click',selector:'#submitAssessment'},
   {op:'click',selector:'#completeCourse'}],expectedStatus:'passed'},
};
writeFileSync(join(dir,'candidate.zip'),zip,{mode:0o600});
writeFileSync(join(dir,'driver.json'),JSON.stringify(driver,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({zipPath:join(dir,'candidate.zip'),
 driverPath:join(dir,'driver.json'),packageSha256,
 source:'AUTHORED_SYNTHETIC_NOT_PORTFOLIO_ZIP'}));
