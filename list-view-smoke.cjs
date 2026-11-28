const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=name=>fs.readFileSync(path.join(__dirname,'dist',name),'utf8');
(async()=>{
 const dom=new JSDOM(read('index.html'),{url:'https://grooveworks.github.io/racket-note/#/',runScripts:'outside-only'}),w=dom.window,errors=[];
 w.structuredClone=structuredClone;w.CSS={escape:value=>String(value).replace(/[^a-zA-Z0-9_-]/g,'\\$&')};w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.addEventListener('error',event=>errors.push(event.message));
 for(const name of ['model.js','protocol.js','workspace-ui.js','workspace-forms.js','voice-input.js','history-ledger.js'])w.eval(read(name));
 const M=w.RacketLedgerModel,rec=(id,extra)=>({id,kind:'measured',tensionUnit:'lb',...extra});
 // Fictional data. Records are stored out of order on purpose.
 const data=M.validate({app:'racket-note',version:1,rackets:[
  {id:'a',name:'架空98',individual:'1号機',records:[
   rec('a3',{date:'2026-03-01',createdAt:'2026-03-01T00:00:00.000Z',state:'strung',condition:'張上げ',stringMain:'YONEX POLYTOUR REV',stringCross:'YONEX POLYTOUR PRO',stringMainGauge:1.3,stringCrossGauge:1.25,tensionMain:46,tensionCross:46,baseGrip:'レザー',overgrip:'YONEX ウェットスーパーグリップ',customMaterial:'鉛テープ',customParts:[{position:'3時',grams:1},{position:'9時',grams:1}],sw:337.3,balance:330,tw:14.1,weight:327.7,ra:62,gripW:33.5,gripT:29.7,note:'メモ本文'}),
   rec('a1',{date:'2026-01-01',createdAt:'2026-01-01T00:00:00.000Z',state:'bare',condition:'元の状態',baseGrip:'純正',customParts:[],sw:312.4,balance:315,tw:12.6,weight:307}),
   rec('a2',{date:'2026-02-01',createdAt:'2026-02-01T00:00:00.000Z',state:'unknown',condition:'旧記録',baseGrip:'KGL164',overgrip:'なし（元グリップ剥がし後）',custom:'テーピング1枚',sw:314.4,balance:317,tw:12.7})
  ]},
  {id:'b',name:'架空98',individual:'2号機',records:[
   rec('b4',{date:'2026-04-02',createdAt:'2026-04-02T09:00:00.000Z',state:'other',baseGrip:'',overgrip:'',custom:'',sw:300,balance:320,tw:13,weight:300}),
   rec('b3',{date:'2026-04-02',createdAt:'2026-04-02T08:00:00.000Z',state:'ready',sw:301,balance:320,tw:13,weight:300}),
   rec('b2',{date:'2026-04-01',createdAt:'2026-04-01T00:00:00.000Z',state:'strung',overgrip:'あり（品名未記録）',baseGrip:'とても長い元グリップの説明文がここに入ります',customParts:[{position:'12時',grams:0.5}],sw:302,balance:320,tw:13,weight:300}),
   rec('b1',{date:'2026-03-01',createdAt:'2026-03-01T00:00:00.000Z',state:'strung',overgrip:'なし',sw:303})
  ]}
 ]}),before=JSON.stringify(data);
 let callback,writes=0;const emit=()=>callback({user:{uid:'synthetic',email:'test@example.test'},ready:true,status:'connected',data:structuredClone(data)});
 w.RacketLedgerCloud={init(fn){callback=fn;emit();},data:()=>structuredClone(data),revisions:()=>({}),async commit(){writes++;throw Error('Display must not save records');}};w.RacketReportReader={read:(user,fn)=>fn([])};w.eval(read('workspace-app.js'));
 const q=selector=>{const node=w.document.querySelector(selector);assert(node,'Missing '+selector);return node;},click=selector=>q(selector).click(),rows=id=>[...q('[data-hl-body="'+id+'"]').querySelectorAll('tr.hl-record')].map(n=>n.dataset.hlRecord),cell=(id,selector)=>q('[data-hl-record="'+id+'"] '+selector).textContent.trim(),cells=id=>[...q('[data-hl-record="'+id+'"]').children].map(n=>n.textContent.trim().replace(/\s+/g,' '));
 try{
  // columns of the approved picture
  for(const id of ['a','b']){const heads=[...q('[data-hl-group="'+id+'"] thead tr').children].map(n=>n.textContent.trim());assert.equal(heads.length,9);assert.deepEqual(heads.slice(0,8),['弦','元／OG','加重','SW','BP (mm)','TW','重量 (g)','RW (計算)']);assert.equal(heads[8],'操作');assert.equal(q('[data-hl-group="'+id+'"] thead th:last-child span').className,'sr-only');}
  assert.doesNotMatch(q('#main').textContent,/測定条件/);assert.equal(w.document.querySelector('thead th small'),null);
  // oldest at the top: sequence-less records by date, then createdAt
  assert.deepEqual(rows('a'),['a1','a2','a3']);assert.deepEqual(rows('b'),['b1','b2','b3','b4']);
  // string state
  assert.equal(q('[data-hl-record="a1"] th.hl-string').firstChild.textContent,'なし');assert.equal(q('[data-hl-record="a3"] th.hl-string').firstChild.textContent,'張上げ');assert.equal(q('[data-hl-record="b3"] th.hl-string').firstChild.textContent,'張上げ');assert.equal(q('[data-hl-record="a2"] th.hl-string').firstChild.textContent,'未確認');assert.equal(q('[data-hl-record="b4"] th.hl-string').firstChild.textContent,'その他');
  // base grip / overgrip
  assert.equal(cell('a1','td.hl-grip'),'純正/—');                      // key missing for overgrip
  assert.equal(cell('b4','td.hl-grip'),'—/—');                         // both empty strings
  assert.equal(cell('a2','td.hl-grip'),'KGL164/なし');                 // starts with なし
  assert.equal(cell('a3','td.hl-grip'),'レザー/あり');                 // text present
  assert.equal(cell('b3','td.hl-grip'),'—/あり');                      // state ready, nothing written
  assert.equal(cell('b1','td.hl-grip'),'—/なし');
  assert.equal(q('[data-hl-record="b2"] .hl-grip-base').title,'とても長い元グリップの説明文がここに入ります');
  assert.equal(q('[data-hl-record="a2"] .hl-grip-og').title,'なし（元グリップ剥がし後）');
  // added weights
  assert.equal(cell('a1','td.hl-weights'),'なし');assert.equal(cell('a3','td.hl-weights'),'あり');assert.equal(cell('b2','td.hl-weights'),'あり');
  assert.equal(cell('a2','td.hl-weights'),'—');                        // old custom text must not become あり
  assert.equal(cell('b4','td.hl-weights'),'—');
  // numbers are not bold, RW has one decimal and is dash when a value is missing
  const rw=(sw,weight,balance)=>(sw-(weight/1000)*(balance/10-10)**2).toFixed(1);
  assert.equal(cell('a1','td.hl-rw'),rw(312.4,307,315));assert.equal(cell('a3','td.hl-rw'),rw(337.3,327.7,330));assert.equal(cell('a2','td.hl-rw'),'—');assert.equal(cell('b1','td.hl-rw'),'—');
  assert.match(cell('a1','td.hl-rw'),/^\d+\.\d$/);
  const css=read('history-ledger.css');assert.doesNotMatch(css,/\.hl-value\{[^}]*font-weight:\s*(6|7|bold)/);assert.doesNotMatch(css,/\.hl-table td[^{]*\{[^}]*background:#E1F0FF/i);
  assert.equal(cell('a2','td[data-label="SW"] .hl-value'),'314.4');assert.equal(cell('a2','td[data-label="重量 (g)"] .hl-value'),'記録なし');
  // differences against the base row are unchanged: base is a1 (first measured), other measured rows show a diff, base shows none
  assert.match(cell('a3','td[data-label="SW"]'),/337\.3\s*\+24\.9/);
  assert.equal(w.document.querySelector('[data-hl-record="a1"] .hl-delta'),null);assert.equal(w.document.querySelector('[data-hl-record="a3"] td.hl-rw .hl-delta'),null);
  assert(q('[data-hl-record="a1"] .hl-base-mark'));
  // detail frame under the table
  assert.equal(w.document.querySelector('[data-hl-detail-frame]'),null);for(const b of w.document.querySelectorAll('[data-hl-detail]'))assert.equal(b.getAttribute('aria-pressed'),'false');
  click('[data-hl-detail="a3"]');
  let frame=q('[data-hl-detail-frame]');assert.equal(frame.previousElementSibling.className,'hl-table-wrap');assert.equal(frame.closest('[data-hl-content]').dataset.hlContent,'a');assert.equal(q('[data-hl-detail="a3"]').getAttribute('aria-pressed'),'true');assert.equal(q('[data-hl-detail="a1"]').getAttribute('aria-pressed'),'false');
  assert.equal(frame.querySelector('h3').textContent,'架空98　1号機 · SW 337.3 の詳細');assert.deepEqual([...frame.querySelectorAll('.hl-detail-actions button')].map(n=>n.textContent),['訂正','削除','閉じる']);
  const main=frame.querySelector('.hl-detail-main').textContent;
  assert.match(main,/縦糸　YONEX POLYTOUR REV · 1\.30 mm \/ 46 lb/);assert.match(main,/横糸　YONEX POLYTOUR PRO · 1\.25 mm \/ 46 lb/);assert.match(main,/元グリップ　レザー/);assert.match(main,/オーバーグリップ　YONEX ウェットスーパーグリップ/);assert.match(main,/加重　鉛テープ · 3時 1\.0 g \+ 9時 1\.0 g \(計 2\.0 g\)/);
  const sub=frame.querySelector('.hl-detail-sub').textContent;for(const word of ['2026-03-01','実測','グリップ幅 (mm)','33.5','グリップ厚 (mm)','29.7','RA','メモ本文'])assert(sub.includes(word),'detail lower part lacks '+word);
  // switch rows in another racket: contents replaced, one frame only
  click('[data-hl-detail="a2"]');frame=q('[data-hl-detail-frame]');assert.equal(w.document.querySelectorAll('[data-hl-detail-frame]').length,1);assert.equal(frame.querySelector('h3').textContent,'架空98　1号機 · SW 314.4 の詳細');assert.equal(q('[data-hl-detail="a3"]').getAttribute('aria-pressed'),'false');assert.equal(q('[data-hl-detail="a2"]').getAttribute('aria-pressed'),'true');
  const old=frame.querySelector('.hl-detail-main').textContent;assert.match(old,/元グリップ　KGL164/);assert.match(old,/加重　未記録/);assert.match(old,/ストリング[\s\S]*未記録/);
  const names=[...frame.querySelectorAll('.hl-detail-sub dt')].map(n=>n.textContent);assert(names.includes('カスタム（記録の原文）'));assert.equal(names.includes('加重'),false);assert.equal([...frame.querySelectorAll('.hl-detail-sub div')].find(n=>n.querySelector('dt').textContent==='カスタム（記録の原文）').querySelector('dd').textContent,'テーピング1枚');
  click('[data-hl-detail="b1"]');assert.equal(q('[data-hl-detail-frame]').closest('[data-hl-content]').dataset.hlContent,'b');assert.equal(q('[data-hl-detail-frame] h3').textContent,'架空98　2号機 · SW 303 の詳細');assert.equal(w.document.querySelectorAll('[data-hl-detail-frame]').length,1);
  // bare racket shows "なし" for strings; empty parts show なし
  click('[data-hl-detail="a1"]');assert.match(q('[data-hl-detail-frame] .hl-detail-main').textContent,/ストリング\s*なし/);assert.match(q('[data-hl-detail-frame] .hl-detail-main').textContent,/加重　なし/);
  // same row again closes; close button closes
  click('[data-hl-detail="a1"]');assert.equal(w.document.querySelector('[data-hl-detail-frame]'),null);assert.equal(q('[data-hl-detail="a1"]').getAttribute('aria-pressed'),'false');
  click('[data-hl-detail="a3"]');click('[data-hl-detail-close]');assert.equal(w.document.querySelector('[data-hl-detail-frame]'),null);assert.equal(q('[data-hl-detail="a3"]').getAttribute('aria-pressed'),'false');
  // correction opens the existing record's input without saving
  click('[data-hl-detail="a3"]');click('[data-hl-detail-frame] [data-action="edit-record"]');assert.equal(q('#edit-form [name=sw]').value,'337.3');assert.equal(q('[data-hl-body="a"] .hl-inline-row').previousElementSibling.dataset.hlRecord,'a3');click('#cancel-edit');assert.equal(w.document.getElementById('edit-form'),null);
  // per-racket add button opens that racket's input; the per-row measure button remains
  assert(q('[data-hl-group="a"] .hl-add-button').textContent.includes('測定を追加'));assert(q('[data-hl-record="a1"] [data-action="reuse-record"]'));
  click('[data-hl-group="b"] .hl-add-button');assert(q('[data-hl-body="b"] #edit-form'));assert.equal(w.document.querySelectorAll('#edit-form').length,1);assert.match(q('.hl-editor-head').textContent,/2号機/);click('#cancel-edit');assert.equal(w.document.getElementById('edit-form'),null);
  click('[data-hl-group="a"] .hl-add-button');assert(q('[data-hl-body="a"] #edit-form'));assert.match(q('.hl-editor-head').textContent,/1号機/);click('#cancel-edit');
  // kept controls
  for(const selector of ['[data-action="new-racket"]','[data-action="start-measurement"]','#hl-racket','#search','[data-action="collapse-all"]','[data-action="expand-all"]','#hl-size','#hl-source','[data-hl-toggle="a"]','[data-hl-base="a"]','[data-action="edit-racket"][data-id="a"]','[data-action="clone-racket"][data-id="a"]','[data-compare="a1"]'])q(selector);
  assert.equal(q('#search').placeholder,'ラケット名・個体名・条件を検索');assert.equal(q('#hl-racket').options[0].textContent,'すべての一本');
  // data untouched, no save
  assert.equal(writes,0);assert.equal(JSON.stringify(data),before);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({columns9:true,stringStates:true,gripAndOvergrip:true,weightsFromPartsOnly:true,recoilWeightOneDecimal:true,oldestFirst:true,detailFrameOpenSwitchClose:true,oldCustomShownAsOriginalText:true,perRacketAdd:true,recordWrites:writes,originalDataUnchanged:true,realBrowser:false,errors}));
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
