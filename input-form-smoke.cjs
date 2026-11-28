const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=name=>fs.readFileSync(path.join(__dirname,'dist',name),'utf8'),waitFor=async(check,what,limit=3000)=>{const start=Date.now();let last;while(Date.now()-start<limit){try{if(check())return;}catch(error){last=error;}await new Promise(resolve=>setTimeout(resolve,5));}throw new Error('Timed out waiting for: '+what+(last?' (last error: '+last.message+')':''));};
(async()=>{
 const dom=new JSDOM(read('index.html'),{url:'https://grooveworks.github.io/racket-note/#/',runScripts:'outside-only'}),w=dom.window,errors=[];
 w.structuredClone=structuredClone;w.CSS={escape:value=>String(value).replace(/[^a-zA-Z0-9_-]/g,'\\$&')};w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.addEventListener('error',event=>errors.push(event.message));
 for(const name of ['model.js','protocol.js','workspace-ui.js','workspace-forms.js','voice-input.js','history-ledger.js'])w.eval(read(name));
 const M=w.RacketLedgerModel,rec=(id,extra)=>({id,kind:'measured',state:'strung',tensionUnit:'lb',createdAt:'2026-11-01T00:00:00.000Z',date:'2026-11-01',...extra});
 const arch={system:'tennis-db',key:'k',path:'p',raw:'{"a":1}',importedAt:'2026-10-01',current:false};
 // Fictional data. "old" has none of the new fields; "rich" has all of them.
 let data=M.validate({app:'racket-note',version:1,rackets:[
  {id:'empty',name:'DEFYER98PROV1',individual:'2号機',records:[]},
  {id:'prev',name:'DEFYER98PROV1',individual:'1号機',records:[
   rec('p1',{date:'2026-11-20',condition:'初回',state:'bare',sw:310,balance:316,tw:12.3,weight:308,baseGrip:'純正',overgrip:'なし',customParts:[{position:'3時',grams:1,material:'鉛'},{position:'9時',grams:1,material:'鉛'}],gripSizeCustom:'テーピング',stringMainGauge:1.25}),
   rec('p0',{date:'2026-11-01',condition:'',baseGrip:'レザー',overgrip:'YONEX ウェットスーパーグリップ'})]},
  {id:'old',name:'古い記録',individual:'1号機',records:[
   rec('o1',{date:'2026-10-01',kind:'estimated',state:'ready',condition:'',sw:329,weight:327.5,note:'メモ'}),
   rec('o2',{date:'2026-10-02',kind:'lab',state:'other',custom:'鉛1g',stringMain:'X',tensionMain:48})]},
  {id:'rich',name:'新しい欄の記録',individual:'1号機',records:[
   rec('r1',{date:'2026-11-10',condition:'前',sw:320,stringMainGauge:1.3,stringCrossGauge:1.25,customMaterial:'鉛テープ',customParts:[{position:'3時',grams:1,material:'鉛'}],gripSizeCustom:'シム',inputTranscript:'3時に1g',archive:arch})]}
 ]});
 let callback,saved=[],fail=false;const emit=()=>callback({user:{uid:'synthetic',email:'test@example.test'},ready:true,status:'connected',data:structuredClone(data)});
 w.RacketLedgerCloud={init(fn){callback=fn;emit();},data:()=>structuredClone(data),revisions:()=>({}),async commit(previous,next){if(fail)throw Error('synthetic failure');saved.push(structuredClone(next));data=M.validate(next);emit();return structuredClone(data);}};w.RacketReportReader={read:(user,fn)=>fn([])};w.eval(read('workspace-app.js'));
 const q=selector=>{const node=w.document.querySelector(selector);assert(node,'Missing '+selector);return node;},click=selector=>q(selector).click(),all=selector=>[...w.document.querySelectorAll(selector)];
 const typeIn=(node,value)=>{node.value=value;node.dispatchEvent(new w.Event('input',{bubbles:true}));},set=(name,value)=>typeIn(q('#edit-form [name="'+name+'"]'),value),submit=()=>q('#edit-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 const pressed=selector=>q(selector).getAttribute('aria-pressed')==='true',get=(id,rid)=>data.rackets.find(r=>r.id===id).records.find(r=>r.id===rid);
 const cancel=()=>click('#cancel-edit'),leave=async()=>{if(w.document.getElementById('edit-form')){cancel();if(w.document.getElementById('confirm-dialog').open)click('#confirm-yes');}await waitFor(()=>!w.document.getElementById('edit-form'),'form closed');};
 const edit=id=>{if(!pressed(`[data-hl-detail="${id}"]`))click(`[data-hl-detail="${id}"]`);click('[data-hl-detail-frame] [data-action="edit-record"]');};
 const partsInForm=()=>{const n=q('#edit-form [data-parts-json]');return n.name==='customPartsJson'?JSON.parse(n.value):null;};
 try{
  // ---- F2: a racket with no records ----
  click('[data-hl-group="empty"] .hl-add-button');
  assert.match(q('.hl-editor-head').textContent,/加工前を測る/);assert.match(q('.hl-editor-head').textContent,/2号機/);
  assert.equal(q('.hl-f-aside .hl-f-card-head').textContent.replace(/\s+/g,' ').trim(),'2号機履歴 0件 · これが初回');
  assert.deepEqual(all('[data-seg="kind"]').map(b=>b.textContent),['実測','公称値','その他']);assert(pressed('[data-seg="kind"][data-values="measured"]'));
  assert.deepEqual(all('[data-seg="state"]').map(b=>b.textContent),['なし','張上げ']);assert(pressed('[data-seg="state"][data-values="bare"]'));assert.equal(q('[name=overgrip]').value,'なし');
  assert.equal(q('[data-hl-strings]').hidden,true);assert.equal(q('.hl-editor-actions [type=submit]').textContent,'保存');assert.equal(q('#cancel-edit').textContent,'キャンセル');
  assert.equal(q('[data-parts-json]').hasAttribute('name'),false,'untouched weights are not sent');assert.equal(q('[data-parts-total]').textContent,'計 0 g');
  assert(q('[data-voice-mic]'));
  // candidates: newest first, raw values, empty excluded; pressing one fills the field
  assert.deepEqual(all('[data-hl-set="baseGrip"]').map(b=>b.textContent),['純正','レザー']);
  assert.deepEqual(all('[data-hl-set="overgrip"]').map(b=>b.textContent),['なし','YONEX ウェットスーパーグリップ']);
  click('[data-hl-set="baseGrip"][data-value="レザー"]');assert.equal(q('[name=baseGrip]').value,'レザー');
  assert.equal(q('[data-rw]').textContent,'自動計算');
  // the existing voice component still fills the same fields and the screen follows
  typeIn(q('[data-voice-text]'),'SW322、BP320ミリ、重量335、張り上げ');click('[data-voice-apply]');assert.equal(q('[name=sw]').value,'322');assert.equal(q('[name=state]').value,'strung');assert(pressed('[data-seg="state"][data-values="strung ready"]'));assert.equal(q('[data-hl-strings]').hidden,false);assert.equal(q('[data-rw]').textContent,(322-0.335*(32-10)**2).toFixed(1));
  click('[data-seg="state"][data-values="bare"]');assert.equal(q('[data-hl-strings]').hidden,true);
  // RW appears as values are typed
  set('sw','310');set('balance','316');set('weight','308');assert.equal(q('[data-rw]').textContent,'166.3');
  // string fields open with 張上げ
  click('[data-seg="state"][data-values="strung ready"]');assert.equal(q('[data-hl-strings]').hidden,false);assert.equal(q('[name=state]').value,'strung');assert(pressed('[data-seg="state"][data-values="strung ready"]'));
  // dial: point mode adds a row, a second press removes it
  click('[data-dial="3"]');assert(pressed('[data-dial="3"]'));assert.equal(all('[data-part]').length,1);assert.equal(q('[data-part] .hl-f-pos').textContent,'3時');
  assert.deepEqual(partsInForm(),[{position:'3時',grams:'',}]);
  click('[data-dial="3"]');assert.equal(all('[data-part]').length,0);assert.equal(pressed('[data-dial="3"]'),false);
  // an empty amount stops the save and says so
  click('[data-dial="3"]');submit();await waitFor(()=>!q('#form-error').hidden,'error shown');assert.match(q('#form-error').textContent,/量が空/);assert.equal(saved.length,0);
  typeIn(q('[data-part-grams]'),'1');typeIn(q('[data-part-material]'),'鉛');assert.equal(q('[data-parts-total]').textContent,'計 1.0 g');
  click('[data-dial="9"]');typeIn(all('[data-part-grams]')[1],'1');
  // range mode
  click('[data-mode-set="range"]');assert(pressed('[data-mode-set="range"]'));click('[data-dial="2"]');assert(pressed('[data-dial="2"]'));assert.equal(all('[data-part]').length,2);click('[data-dial="4"]');
  assert.equal(all('[data-part]').length,3);assert.equal(all('[data-part] .hl-f-pos')[2].textContent,'2〜4時');typeIn(all('[data-part-grams]')[2],'0.5');
  click('[data-mode-set="point"]');
  // fixed places and a free place
  click('[data-place="スロート"]');assert(pressed('[data-place="スロート"]'));typeIn(all('[data-part-grams]')[3],'2');
  click('[data-place-free]');assert.equal(all('[data-part-pos]').length,1);typeIn(q('[data-part-pos]'),'フレーム上');typeIn(all('[data-part-grams]')[4],'0.2');
  assert.equal(q('[data-parts-total]').textContent,'計 4.7 g');
  set('gripSizeCustom','テーピング1周');set('stringMain','POLYTOUR');set('stringMainGauge','1.25');set('tensionMain','46');
  submit();await waitFor(()=>saved.length===1,'F2 saved');
  const f2=saved[0].rackets.find(r=>r.id==='empty').records[0];
  assert.deepEqual(f2.customParts,[{position:'3時',grams:1,material:'鉛'},{position:'9時',grams:1},{position:'2〜4時',grams:0.5},{position:'スロート',grams:2},{position:'フレーム上',grams:0.2}]);
  assert.equal(f2.kind,'measured');assert.equal(f2.state,'strung');assert.equal(f2.gripSizeCustom,'テーピング1周');assert.equal(f2.stringMainGauge,1.25);assert.equal(f2.sw,310);assert.equal(f2.baseGrip,'レザー');assert.equal(Object.hasOwn(f2,'stringCrossGauge'),false);
  await waitFor(()=>!w.document.getElementById('edit-form'),'F2 closed');

  // ---- F2: nothing touched in the weights card -> no customParts key; 「なし」-> [] ----
  click('[data-hl-group="empty"] .hl-add-button');set('sw','300');click('[data-parts-none]');assert.deepEqual(partsInForm(),[]);assert(pressed('[data-parts-none]'));
  submit();await waitFor(()=>saved.length===2,'none saved');assert.deepEqual(saved[1].rackets.find(r=>r.id==='empty').records.at(-1).customParts,[]);
  await waitFor(()=>!w.document.getElementById('edit-form'),'closed');
  click('[data-hl-group="old"] .hl-add-button');assert.equal(q('[data-parts-json]').hasAttribute('name'),false);set('sw','301');submit();await waitFor(()=>saved.length===3,'untouched saved');
  {const added=saved[2].rackets.find(r=>r.id==='old').records.at(-1);assert.equal(added.sw,301);for(const key of ['customParts','gripSizeCustom','stringMainGauge','stringCrossGauge','customMaterial'])assert.equal(Object.hasOwn(added,key),false,key);}
  await waitFor(()=>!w.document.getElementById('edit-form'),'closed');

  // ---- F3: a racket with a previous record ----
  click('[data-hl-group="prev"] .hl-add-button');
  assert.match(q('.hl-editor-head').textContent,/測定を追加/);assert.equal(q('.hl-f-aside .hl-f-card-head h2').textContent,'引き継ぎ元');
  assert.match(q('.hl-f-aside .hl-f-card-head').textContent,/2026\/11\/20 · 初回/);assert.deepEqual(all('.hl-f-prev-v').map(n=>n.textContent),['310','316','12.3','308']);
  assert.match(q('.hl-f-sub').textContent,/弦なし · 純正\/なし · 加重 計 2.0 g/);
  assert.equal(q('[name=sw]').placeholder,'前回 310');assert.equal(q('[name=balance]').placeholder,'前回 316');assert.equal(q('[name=tw]').placeholder,'前回 12.3');assert.equal(q('[name=weight]').placeholder,'前回 308');
  assert.equal(q('[name=sw]').value,'');set('sw','313');assert.equal(q('[data-sw-diff]').textContent,'SW 前回比 +3');
  assert.deepEqual(all('[data-part] .hl-f-pos').map(n=>n.textContent),['3時','9時']);assert.deepEqual(all('[data-part-material]').map(n=>n.value),['鉛','鉛']);assert.equal(q('[data-parts-total]').textContent,'計 2.0 g');
  assert.deepEqual(partsInForm(),[{position:'3時',grams:1,material:'鉛'},{position:'9時',grams:1,material:'鉛'}],'inherited rows are sent as the values shown');
  assert.equal(q('[name=gripSizeCustom]').value,'テーピング');assert.equal(q('[name=stringMainGauge]').value,'1.25');
  assert.equal(q('.hl-editor-actions [type=submit]').textContent,'保存して比較');
  click('[data-part-remove]');assert.equal(all('[data-part]').length,1);click('[data-part-remove]');assert.deepEqual(partsInForm(),[]);
  await leave();

  // ---- correction of old records: untouched save changes nothing ----
  for(const [rid,rack] of [['o1','old'],['o2','old'],['p0','prev']]){
   const before=JSON.stringify(get(rack,rid));edit(rid);
   assert.match(q('.hl-editor-head').textContent,/記録を訂正/);assert.equal(q('.hl-editor-actions [type=submit]').textContent,'訂正を保存');
   if(rid==='o1'){assert.deepEqual(all('[data-seg="kind"]').map(b=>b.getAttribute('aria-pressed')),['false','false','false']);assert.equal(q('[data-kind-note]').hidden,false);assert.match(q('[data-kind-note]').textContent,/推定値/);assert(pressed('[data-seg="state"][data-values="strung ready"]'));assert.equal(q('[data-hl-strings]').hidden,false);}
   if(rid==='o2'){assert.deepEqual(all('[data-seg="state"]').map(b=>b.getAttribute('aria-pressed')),['false','false']);assert.equal(q('[name=custom]').value,'鉛1g');assert.equal(q('.hl-form-extra summary').textContent,'その他の項目');assert.equal(q('.hl-form-extra').open,false);assert.match(q('.hl-form-extra').textContent,/カスタム（記録の原文）/);}
   assert.equal(q('[data-parts-json]').hasAttribute('name'),false);
   const n=saved.length;submit();await waitFor(()=>saved.length===n+1,'untouched correction saved '+rid);
   assert.equal(JSON.stringify(data.rackets.find(r=>r.id===rack).records.find(r=>r.id===rid)),before,'unchanged '+rid);
   await waitFor(()=>!w.document.getElementById('edit-form'),'closed');
  }
  // touching only an unrelated field keeps kind/state, and no new keys appear
  edit('o1');set('note','直した');const n1=saved.length;submit();await waitFor(()=>saved.length===n1+1,'o1 note');
  {const a=get('old','o1');assert.equal(a.note,'直した');assert.equal(a.kind,'estimated');assert.equal(a.state,'ready');for(const key of ['stringMainGauge','stringCrossGauge','customMaterial','customParts','gripSizeCustom','baseGrip','overgrip','inputTranscript','source','archive'])assert.equal(Object.hasOwn(a,key),false,key);}
  await waitFor(()=>!w.document.getElementById('edit-form'),'closed');
  // pressing a kind changes only the kind
  edit('o2');click('[data-seg="kind"][data-values="catalog"]');assert(pressed('[data-seg="kind"][data-values="catalog"]'));assert.equal(q('[data-kind-note]').hidden,true);const n2=saved.length;submit();await waitFor(()=>saved.length===n2+1,'o2 kind');
  assert.equal(get('old','o2').kind,'catalog');assert.equal(get('old','o2').state,'other');await waitFor(()=>!w.document.getElementById('edit-form'),'closed');

  // ---- correction of a record with the new fields: other fields stay ----
  const rich=get('rich','r1');edit('r1');
  assert.deepEqual(all('[data-part] .hl-f-pos').map(n=>n.textContent),['3時']);assert.equal(q('[name=gripSizeCustom]').value,'シム');assert.equal(q('[name=stringCrossGauge]').value,'1.25');assert.equal(q('[data-parts-json]').hasAttribute('name'),false);
  set('note','変えた');const n3=saved.length;submit();await waitFor(()=>saved.length===n3+1,'rich saved');
  {const a=get('rich','r1');for(const key of ['stringMainGauge','stringCrossGauge','customMaterial','customParts','gripSizeCustom','inputTranscript','archive','sw'])assert.equal(JSON.stringify(a[key]),JSON.stringify(rich[key]),key);assert.equal(a.note,'変えた');}
  await waitFor(()=>!w.document.getElementById('edit-form'),'closed');
  edit('r1');click('[data-dial="6"]');typeIn(all('[data-part-grams]')[1],'0.5');const n4=saved.length;submit();await waitFor(()=>saved.length===n4+1,'rich parts');
  assert.equal(JSON.stringify(get('rich','r1').customParts),JSON.stringify([{position:'3時',grams:1,material:'鉛'},{position:'6時',grams:0.5}]));assert.equal(get('rich','r1').gripSizeCustom,'シム');
  await waitFor(()=>!w.document.getElementById('edit-form'),'closed');

  // ---- display side ----
  if(!pressed('[data-hl-detail="r1"]'))click('[data-hl-detail="r1"]');assert.match(q('[data-hl-detail-frame]').textContent,/グリップサイズのカスタム\s*シム/);assert.match(q('[data-hl-detail-frame] .hl-detail-side').textContent,/加重\s*3時 鉛 1\.0 g \+ 6時 0\.5 g/);click('[data-hl-detail-close]');
  if(!pressed('[data-hl-detail="p1"]'))click('[data-hl-detail="p1"]');assert.match(q('[data-hl-detail-frame] .hl-detail-side').textContent,/加重\s*鉛 · 3時 1\.0 g \+ 9時 1\.0 g \(計 2\.0 g\)/);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({f2:true,f3:true,correctionUnchanged:true,saves:saved.length,errors}));
 }catch(error){console.error(error);process.exitCode=1;}
})();
