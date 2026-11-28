const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=name=>fs.readFileSync(path.join(__dirname,'dist',name),'utf8'),waitFor=async(check,what,limit=3000)=>{const start=Date.now();let last;while(Date.now()-start<limit){try{if(check())return;}catch(error){last=error;}await new Promise(resolve=>setTimeout(resolve,5));}throw new Error('Timed out waiting for: '+what+(last?' (last error: '+last.message+')':''));};
(async()=>{
 const dom=new JSDOM(read('index.html'),{url:'https://grooveworks.github.io/racket-note/#/',runScripts:'outside-only'}),w=dom.window,errors=[];
 w.structuredClone=structuredClone;w.CSS={escape:value=>String(value).replace(/[^a-zA-Z0-9_-]/g,'\\$&')};w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.addEventListener('error',event=>errors.push(event.message));
 for(const name of ['model.js','protocol.js','workspace-ui.js','workspace-forms.js','voice-input.js','history-ledger.js'])w.eval(read(name));
 const M=w.RacketLedgerModel,P=w.RacketNoteProtocol,rec=(id,extra)=>({id,kind:'measured',state:'bare',tensionUnit:'lb',createdAt:'2026-11-01T00:00:00.000Z',date:'2026-11-01',...extra});
 let data=M.validate({app:'racket-note',version:1,rackets:[
  {id:'empty',name:'DEFYER98PROV1',individual:'2号機',records:[]},
  {id:'prev',name:'DEFYER98PROV1',individual:'1号機',records:[rec('p1',{date:'2026-11-20',condition:'初回',sw:310,balance:316,tw:12.3,weight:308}),rec('p2',{date:'2026-11-21',condition:'二回目',sw:311}),rec('p3',{date:'2026-11-22',condition:'三回目',sw:312})]},
  {id:'other',name:'別のラケット',individual:'1号機',records:[rec('o1',{date:'2026-10-01',condition:'別',sw:300})]}
 ]});
 let callback,plans=[];const emit=()=>callback({user:{uid:'synthetic',email:'test@example.test'},ready:true,status:'connected',data:structuredClone(data)});
 w.RacketLedgerCloud={init(fn){callback=fn;emit();},data:()=>structuredClone(data),revisions:()=>({}),async commit(previous,next){plans.push(P.plan(previous,next));data=M.validate(next);emit();return structuredClone(data);}};w.RacketReportReader={read:(user,fn)=>fn([])};w.eval(read('workspace-app.js'));
 const q=selector=>{const node=w.document.querySelector(selector);assert(node,'Missing '+selector);return node;},click=selector=>q(selector).click(),all=selector=>[...w.document.querySelectorAll(selector)],has=selector=>Boolean(w.document.querySelector(selector));
 const typeIn=(node,value)=>{node.value=value;node.dispatchEvent(new w.Event('input',{bubbles:true}));},set=(name,value)=>typeIn(q('#edit-form [name="'+name+'"]'),value),submit=()=>q('#edit-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 const tick=check=>check(),pressed=selector=>q(selector).getAttribute('aria-pressed')==='true';
 const showDetail=id=>{if(!pressed(`[data-hl-detail="${id}"]`))click(`[data-hl-detail="${id}"]`);},check=(id,on)=>{const box=q(`[data-compare="${id}"]`);box.checked=on;box.dispatchEvent(new w.Event('change',{bubbles:true}));};
 const checkedIds=()=>all('[data-compare]').filter(n=>n.checked).map(n=>n.dataset.compare);
 try{
  // ---- delete: confirmation first ----
  check('p1',true);check('o1',true);assert.deepEqual(checkedIds(),['p1','o1']);
  showDetail('p3');
  assert.deepEqual([...q('[data-hl-detail-frame] .hl-detail-actions').children].map(n=>n.textContent),['訂正','削除','閉じる']);
  click('[data-hl-detail-frame] [data-action="delete-record"]');
  assert.equal(q('#confirm-dialog').open,true);assert.equal(q('#confirm-yes').textContent,'削除する');assert.equal(plans.length,0,'nothing saved before the confirmation');
  click('#confirm-no');assert.equal(q('#confirm-dialog').open,false);assert.equal(plans.length,0);assert(has('[data-hl-record="p3"]'));assert(has('[data-hl-detail-frame]'));
  click('[data-hl-detail-frame] [data-action="delete-record"]');click('#confirm-yes');
  await waitFor(()=>plans.length===1&&!has('[data-hl-record="p3"]'),'record deleted');
  assert.equal(plans[0].length,1);assert.equal(plans[0][0].key,'m_p3');assert.equal(plans[0][0].next,null);
  assert.equal(has('[data-hl-detail-frame]'),false);assert.equal(data.rackets.find(r=>r.id==='prev').records.length,2);
  // deleting a selected record also drops it from the selection
  showDetail('p1');click('[data-hl-detail-frame] [data-action="delete-record"]');click('#confirm-yes');
  await waitFor(()=>plans.length===2&&!has('[data-hl-record="p1"]'),'selected record deleted');
  assert.deepEqual(checkedIds(),['o1']);assert.equal(q('#nav-compare-count').textContent,'1');
  click('[data-action="clear-compare"]');

  // ---- F3 save: new mark, detail open, two-record selection, bar ----
  click('[data-hl-group="prev"] .hl-add-button');set('sw','313');submit();
  await waitFor(()=>plans.length===3&&has('#saved-bar'),'F3 saved with bar');
  const added=data.rackets.find(r=>r.id==='prev').records.find(r=>!['p1','p2','p3'].includes(r.id));assert(added);
  assert.equal(q('#saved-bar').textContent.replace(/\s+/g,''),'✓保存した·前回と2件を比較に選択済み選択を外す比較を見る');
  assert.deepEqual(all('#saved-bar button').map(b=>b.textContent),['選択を外す','比較を見る']);
  assert.deepEqual(checkedIds().sort(),['p2',added.id].sort());assert.equal(q('#compare-tray').hidden,true);
  assert.equal(q(`[data-hl-record="${added.id}"]`).classList.contains('is-new'),true);assert.equal(q(`[data-hl-record="${added.id}"] .hl-new-mark`).textContent,'新');assert.equal(all('.hl-new-mark').length,1);
  assert.equal(q('[data-hl-detail-frame]').dataset.record,added.id);assert.equal(q('[data-hl-base="prev"]').value,q('[data-hl-base="prev"]').value);
  // the previous record is the baseline: the new row shows the difference to it
  assert.match(q(`[data-hl-record="${added.id}"] .hl-delta`).textContent,/\+2/);
  click('#saved-bar [data-action="saved-clear"]');assert.equal(has('#saved-bar'),false);assert.deepEqual(checkedIds(),[]);assert(has(`[data-hl-record="${added.id}"].is-new`),'new mark stays until the next save');
  // second F3: "view comparison" opens the comparison and removes the bar
  click('[data-hl-group="prev"] .hl-add-button');set('sw','315');submit();
  await waitFor(()=>plans.length===4&&has('#saved-bar'),'second F3 saved');
  const added2=data.rackets.find(r=>r.id==='prev').records.find(r=>!['p1','p2','p3',added.id].includes(r.id));
  assert.equal(all('.hl-new-mark').length,1);assert.equal(q('.hl-new-mark').closest('tr').dataset.hlRecord,added2.id,'the mark moves to the latest save');
  click('#saved-bar [data-action="saved-compare"]');await waitFor(()=>w.location.hash==='#/compare'&&has('.cmp-table'),'comparison shown');assert.equal(has('#saved-bar'),false);
  click('.main-nav [data-nav=rackets]');await waitFor(()=>w.location.hash==='#/'&&has('[data-hl-body]'),'list again');

  // ---- F2 save: only the notice, selection kept, new mark added ----
  check('o1',true);const selBefore=checkedIds().join();
  click('[data-hl-group="empty"] .hl-add-button');set('sw','320');submit();
  await waitFor(()=>plans.length===5&&has('#saved-bar'),'F2 saved with bar');
  const f2=data.rackets.find(r=>r.id==='empty').records[0];
  assert.equal(q('#saved-bar').textContent.replace(/\s+/g,''),'✓保存した');assert.equal(all('#saved-bar button').length,0);
  assert.equal(checkedIds().join(),selBefore,'selection untouched by F2');assert(checkedIds().includes('o1'));
  assert.equal(q(`[data-hl-record="${f2.id}"] .hl-new-mark`).textContent,'新');assert.equal(all('.hl-new-mark').length,1);
  // the next operation removes the notice
  click('[data-hl-toggle="other"]');assert.equal(has('#saved-bar'),false);

  // ---- correction: notice without buttons, no new mark ----
  showDetail('p2');click('[data-hl-detail-frame] [data-action="edit-record"]');set('note','直した');const before=checkedIds().join();submit();
  await waitFor(()=>plans.length===6&&has('#saved-bar'),'correction saved');
  assert.equal(q('#saved-bar').textContent.replace(/\s+/g,''),'✓保存した');assert.equal(all('#saved-bar button').length,0);assert.equal(all('.hl-new-mark').length,0);assert.equal(checkedIds().join(),before);
  assert.equal(data.rackets.find(r=>r.id==='prev').records.find(r=>r.id==='p2').note,'直した');
  // opening another input removes the notice
  click('[data-hl-group="other"] .hl-add-button');assert.equal(has('#saved-bar'),false);click('#cancel-edit');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({deleteConfirm:true,deleteOnce:true,f3Bar:true,f2Bar:true,correctionBar:true,plans:plans.length,errors}));
 }catch(error){console.error(error);process.exitCode=1;}
})();
