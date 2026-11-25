const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=__dirname,dist=path.join(root,'dist'),manifest=JSON.parse(fs.readFileSync(path.join(root,'release-manifest.json'),'utf8'));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const files=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(path.join(directory,item.name)):[path.join(directory,item.name)]);
const expected=manifest.assets.map(item=>item.name).sort(),actual=files(dist).map(file=>path.relative(dist,file).replaceAll('\\','/')).sort();assert.deepEqual(actual,expected,'Unexpected published files');
for(const item of manifest.assets){const data=fs.readFileSync(path.join(dist,item.name));assert.equal(hash(data),item.sha256,item.name);if(item.name.endsWith('.js'))new vm.Script(data.toString(),{filename:item.name});}
for(const page of ['index.html','diagnostics.html','voice-check.html']){
 const html=fs.readFileSync(path.join(dist,page),'utf8');
 for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)){const ref=match[1];if(/^(?:#|data:|https?:)/.test(ref))continue;assert(!ref.startsWith('/'),page+' must preserve /racket-note/');assert(fs.existsSync(path.join(dist,ref)),page+' missing '+ref);}
 assert(!/<script[^>]+src="(?:tennisdb-workspace|tennisdb-link|legacy-bridge|app)\.js"/.test(html),page+' must use the independent workspace');
}
for(const name of ['cloud.js','model.js','protocol.js','history-ledger.js','workspace-forms.js','voice-input.js']){const asset=manifest.assets.find(item=>item.name===name);assert.equal(asset.sha256,asset.previousPublishedSha256,name+' must retain published behavior and storage');}
const cloud=fs.readFileSync(path.join(dist,'cloud.js'),'utf8');assert(cloud.includes("projectId:'tennis-db-ca9ae'"));assert(cloud.includes("collection('racketNoteEntries')"));
assert.match(fs.readFileSync(path.join(dist,'voice-check.html'),'utf8'),/href="\.\/">ラケットノートへ戻る/);
console.log('Static release checks passed: '+expected.length+' assets, subpath links, independent entry points, unchanged storage and measurement code.');
