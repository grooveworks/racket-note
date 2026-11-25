const test=require('node:test'),assert=require('node:assert/strict');
const M=require('./dist/model.js'),P=require('./dist/protocol.js'),F=require('./dist/workspace-forms.js'),V=require('./dist/voice-input.js');
const base=()=>M.validate({app:'racket-note',version:1,rackets:[{id:'first',name:'同型 A',individual:'',maker:'試験',gripSize:'G2',records:[{id:'old',date:'2026-10-27',kind:'measured',state:'strung',sw:318.37,baseGrip:'旧グリップ',tensionUnit:'lb'}]}]});
test('同型の2本目は基本情報だけ再利用し、旧数値・条件・履歴を複写しない',()=>{
 const old=base(),values=F.newRacketValues(old,'first');assert.equal(values.name,'同型 A');assert.equal(values.individual,'2号機');assert.equal(values.maker,'試験');assert.equal(values.gripSize,'G2');for(const k of ['sw','tw','balance','weight','baseGrip','overgrip','custom'])assert.ok(values[k]===undefined||values[k]==='');
 const next=F.buildChange({type:'racket',cloneFromId:'first',targetId:'second',initialRecordId:'unused',createdAt:'2026-11-25T00:00:00Z',base:old},values);
 assert.equal(next.rackets[0].individual,'1号機');assert.deepEqual(next.rackets[0].records,old.rackets[0].records);assert.equal(next.rackets[1].id,'second');assert.deepEqual(next.rackets[1].records,[]);assert.equal(P.plan(old,next).length,2);
});
test('同型の個体名重複を拒否し、別個体名への訂正は履歴を移さない',()=>{
 const old=base(),meta={type:'racket',targetId:'second',initialRecordId:'unused',createdAt:'2026-11-25T00:00:00Z',base:old};assert.throws(()=>F.buildChange(meta,{name:'同型A',individual:'1号機'}),/使用済み/);const next=F.buildChange(meta,{name:'同型A',individual:'青テープ'});assert.deepEqual(next.rackets[0],old.rackets[0]);assert.equal(next.rackets[1].records.length,0);const more=F.newRacketValues(next,'first');assert.equal(more.individual,'2号機');
});
test('複数の確定発話を一度で反映し、途中結果を保存値にしない',()=>{
 let current;global.SpeechRecognition=class{constructor(){current=this;}start(){this.onstart();}stop(){this.onend();}abort(){this.onend();}};
 const handlers={},status={textContent:''},input={value:''},mic={textContent:'',setAttribute(){},addEventListener(k,fn){handlers.mic=fn;}},apply={addEventListener(){}},fields=Object.fromEntries(['sw','balance','condition','inputTranscript'].map(k=>[k,{value:'',dataset:{}}]));
 const form={querySelector(q){return {'[data-voice-text]':input,'[data-voice-status]':status,'[data-voice-mic]':mic,'[data-voice-apply]':apply}[q]||null;},elements:{namedItem:k=>fields[k]},dispatchEvent(){}};
 const stop=V.attach(form);try{handlers.mic();const result=(s,final)=>Object.assign([{transcript:s}],{isFinal:final});current.onresult({results:[result('SW318.37',true),result('BP',false)]});assert.equal(fields.sw.value,'');current.onresult({results:[result('SW318.37',true),result('BP320ミリ',true)]});current.onend();assert.equal(fields.sw.value,318.37);assert.equal(fields.balance.value,320);assert.match(fields.inputTranscript.value,/SW318.37/);assert.match(fields.inputTranscript.value,/BP320/);}finally{stop();delete global.SpeechRecognition;}
});
