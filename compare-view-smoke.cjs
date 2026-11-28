const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=name=>fs.readFileSync(path.join(__dirname,'dist',name),'utf8'),waitFor=async(check,what,limit=3000)=>{const start=Date.now();let last;while(Date.now()-start<limit){try{if(check())return;}catch(error){last=error;}await new Promise(resolve=>setTimeout(resolve,5));}throw new Error('Timed out waiting for: '+what+(last?' (last error: '+last.message+')':''));};
(async()=>{
 const dom=new JSDOM(read('index.html'),{url:'https://grooveworks.github.io/racket-note/#/',runScripts:'outside-only'}),w=dom.window,errors=[];
 w.structuredClone=structuredClone;w.CSS={escape:value=>String(value).replace(/[^a-zA-Z0-9_-]/g,'\\$&')};w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.addEventListener('error',event=>errors.push(event.message));
 for(const name of ['model.js','protocol.js','workspace-ui.js','workspace-forms.js','voice-input.js','history-ledger.js'])w.eval(read(name));
 const M=w.RacketLedgerModel,U=w.RacketWorkspaceUI,rec=(id,extra)=>({id,kind:'measured',state:'strung',tensionUnit:'lb',createdAt:'2026-11-01T00:00:00.000Z',...extra});
 // Fictional data shaped like the approved picture.
 const data=M.validate({app:'racket-note',version:1,rackets:[
  {id:'dA',name:'DEFYER98PROV1',individual:'1号機',records:[rec('cA',{date:'2026-11-24',condition:'加工後',sw:337.3,balance:330,tw:14.1,weight:327.7,baseGrip:'レザー',overgrip:'YONEX ウェットスーパーグリップ',customMaterial:'鉛テープ',customParts:[{position:'3時',grams:1},{position:'9時',grams:1}],stringMain:'YONEX POLYTOUR REV',stringMainGauge:1.3,tensionMain:46,stringCross:'YONEX POLYTOUR PRO',stringCrossGauge:1.25,tensionCross:46})]},
  {id:'dB',name:'DEFYER98PROV1',individual:'2号機',records:[rec('cB',{date:'2026-11-20',condition:'加工前',sw:320,balance:315,tw:12.6,weight:320,stringMain:'YONEX POLYTOUR PRO',stringMainGauge:1.25,tensionMain:48,stringCross:'YONEX POLYTOUR PRO',stringCrossGauge:1.25,tensionCross:46})]},
  {id:'dC',name:'EZONE 100 TOUR',individual:'エース機',records:[rec('cC',{date:'2026-10-05',balance:320,weight:330.6,stringMain:'Blast',stringMainGauge:1.25,tensionMain:46,stringCross:'Poly Tour Pro',stringCrossGauge:1.25,tensionCross:43})]},
  {id:'dD',name:'HEAD Boom Pro 2026',individual:'',records:[rec('cD',{date:'2026-09-14',condition:'カスタム後',balance:321.5,weight:333.9,baseGrip:'KGL164',custom:'PPシム＋KGL164（OGなし）',stringMain:'Blast',stringMainGauge:1.25,tensionMain:43,stringCross:'Poly Tour Pro',stringCrossGauge:1.25,tensionCross:43})]},
  {id:'dE',name:'予備',individual:'1',records:[rec('cE',{date:'2026-08-01',balance:318})]}
 ]}),before=JSON.stringify(data);
 let callback,writes=0;const emit=()=>callback({user:{uid:'synthetic',email:'test@example.test'},ready:true,status:'connected',data:structuredClone(data)});
 w.RacketLedgerCloud={init(fn){callback=fn;emit();},data:()=>structuredClone(data),revisions:()=>({}),async commit(){writes++;throw Error('Display must not save records');}};w.RacketReportReader={read:(user,fn)=>fn([])};w.eval(read('workspace-app.js'));
 const q=selector=>{const node=w.document.querySelector(selector);assert(node,'Missing '+selector);return node;},click=selector=>q(selector).click();
 const rowCells=metric=>[...q('.cmp-table tr[data-metric="'+metric+'"]').children].slice(1),value=(metric,i)=>{const td=rowCells(metric)[i].cloneNode(true);td.querySelectorAll('.cmp-d').forEach(n=>n.remove());return td.textContent.trim().replace(/\s+/g,' ');},delta=(metric,i)=>rowCells(metric)[i].querySelector('.cmp-d')?.textContent||'';
 const parse=html=>{const t=w.document.createElement('div');t.innerHTML=html;return t;},cellsOf=(root,metric)=>[...root.querySelector('.cmp-table tr[data-metric="'+metric+'"]').children].slice(1).map(n=>n.textContent.trim().replace(/\s+/g,' '));
 try{
  for(const id of ['cA','cB','cC','cD']){const box=q('[data-compare="'+id+'"]');box.checked=true;box.dispatchEvent(new w.Event('change',{bubbles:true}));}
  click('#compare-tray a');await waitFor(()=>w.location.hash==='#/compare'&&w.document.querySelector('.cmp-table'),'comparison shown');
  // title and head
  assert.equal(q('.cmp-head h1').textContent,'測定履歴の比較');assert.match(q('.cmp-head p').textContent,/4件を選択中 \(最大4件\) · ラケット・個体を問わず並べる · 青字は基準との差/);assert.equal(q('.cmp-head .cmp-blue').textContent,'青字は基準との差');assert.equal(q('.cmp-head a.cmp-btn').getAttribute('href'),'#/');assert.equal(q('.cmp-head a.cmp-btn').textContent.trim(),'一覧へ戻る');
  // nine rows in order
  assert.deepEqual([...w.document.querySelectorAll('.cmp-table tbody tr')].map(n=>n.dataset.metric),['sw','balance','tw','weight','rw','load','grip','stringMain','stringCross']);
  assert.deepEqual([...w.document.querySelectorAll('.cmp-table tbody th')].map(n=>n.textContent.trim()),['SWkg·cm²','BPmm','TWkg·cm²','重量g','RW (計算値)kg·cm²','加重 (位置・量)','元グリップ／OG','縦糸','横糸']);
  // headers: name, individual · condition, date, base mark / set-base, remove
  const heads=[...w.document.querySelectorAll('.cmp-table thead th')].slice(1);assert.equal(heads.length,4);
  assert.equal(heads[0].querySelector('.cmp-name').textContent,'DEFYER98PROV1');assert.equal(heads[0].querySelector('.cmp-sub').textContent,'1号機 · 加工後');assert.equal(heads[0].querySelector('.cmp-date').textContent,'2026/11/24');assert.equal(heads[0].querySelector('.cmp-basemark').textContent,'基準');assert.equal(heads[0].querySelector('[data-baseline]'),null);assert(heads[0].classList.contains('cmp-base'));assert.match(heads[0].querySelector('.cmp-kind').textContent,/実測/);
  assert.equal(heads[1].querySelector('.cmp-set').textContent,'基準にする');assert.equal(heads[2].querySelector('.cmp-sub').textContent,'エース機');assert.equal(heads[3].querySelector('.cmp-sub').textContent,'カスタム後');assert.equal(heads[3].querySelector('.cmp-name').textContent,'HEAD Boom Pro 2026');
  assert.match(heads[1].querySelector('[data-remove]').getAttribute('aria-label'),/を外す$/);assert(q('.cmp-table td.cmp-base'));
  // values and differences of the picture
  assert.equal(value('sw',0),'337.3');assert.equal(delta('sw',0),'');assert.equal(value('sw',1),'320');assert.equal(delta('sw',1),'−17.3');assert.equal(value('sw',2),'未測定');assert.equal(value('sw',3),'未測定');assert.equal(delta('sw',2),'');
  assert.equal(delta('balance',1),'−15');assert.equal(delta('balance',2),'−10');assert.equal(delta('balance',3),'−8.5');
  assert.equal(delta('tw',1),'−1.5');assert.equal(value('tw',2),'未測定');
  assert.equal(delta('weight',1),'−7.7');assert.equal(delta('weight',2),'+2.9');assert.equal(delta('weight',3),'+6.2');
  assert.equal(value('rw',0),'163.9');assert.equal(value('rw',1),'172.1');assert.equal(delta('rw',1),'+8.2');assert.equal(value('rw',2),'SW 待ち');assert.equal(value('rw',3),'SW 待ち');assert.equal(delta('rw',2),'');
  assert(rowCells('sw')[2].classList.contains('cmp-na'));assert(rowCells('sw')[0].classList.contains('cmp-n'));
  // load: old free text never appears; key missing is 未記録
  assert.deepEqual(cellsOf(w.document,'load'),['3時・9時 各1.0 g','未記録','未記録','未記録']);
  const primary=q('.cmp-table').textContent;assert.doesNotMatch(primary,/PPシム/);
  assert.deepEqual(cellsOf(w.document,'grip'),['レザー／OGあり','未記録','未記録','KGL164／未記録']);
  assert.deepEqual(cellsOf(w.document,'stringMain'),['YONEX POLYTOUR REV1.30 mm · 46 lb','YONEX POLYTOUR PRO1.25 mm · 48 lb','Blast1.25 mm · 46 lb','Blast1.25 mm · 43 lb']);
  assert.deepEqual(cellsOf(w.document,'stringCross'),['YONEX POLYTOUR PRO1.25 mm · 46 lb','YONEX POLYTOUR PRO1.25 mm · 46 lb','Poly Tour Pro1.25 mm · 43 lb','Poly Tour Pro1.25 mm · 43 lb']);
  // the old free text stays in the supplement under its own name, never as 加重
  const supplement=q('.comparison-supplement');assert(supplement,'supplement kept');q('#only-different');const rowNames=[...supplement.querySelectorAll('tbody th')].map(n=>n.textContent.trim());assert(rowNames.includes('カスタム（記録の原文）'));assert.equal(rowNames.some(n=>n.startsWith('鉛・加重')||n.startsWith('加重')),false);assert.match(supplement.textContent,/PPシム＋KGL164（OGなし）/);
  // add button: disabled with the limit text at 4, enabled below
  let add=q('.cmp-head [data-action="choose-records"]');assert.equal(add.disabled,true);assert.match(add.textContent,/列を追加 · 上限/);
  // different racket / individual side by side
  assert.deepEqual([...w.document.querySelectorAll('.cmp-name')].map(n=>n.textContent),['DEFYER98PROV1','DEFYER98PROV1','EZONE 100 TOUR','HEAD Boom Pro 2026']);
  // remove a column
  click('[data-remove="cD"]');assert.equal(w.document.querySelectorAll('.cmp-table thead th').length,4);assert.equal(w.document.querySelector('[data-remove="cD"]'),null);
  add=q('.cmp-head [data-action="choose-records"]');assert.equal(add.disabled,false);assert.match(add.textContent,/列を追加/);assert.doesNotMatch(add.textContent,/上限/);assert.match(q('.cmp-head p').textContent,/3件を選択中/);
  click('.cmp-head [data-action="choose-records"]');assert.equal(w.document.getElementById('record-picker').open,true);w.document.getElementById('record-picker').close();
  // change the base: the column moves first and all differences are recomputed
  click('[data-baseline="cB"]');assert.equal(q('.cmp-table thead th:nth-child(2) .cmp-basemark').textContent,'基準');assert.equal(q('.cmp-table thead th:nth-child(2) .cmp-name').textContent,'DEFYER98PROV1');assert.equal(q('.cmp-table thead th:nth-child(2) .cmp-sub').textContent,'2号機 · 加工前');
  assert.equal(value('sw',0),'320');assert.equal(delta('sw',0),'');assert.equal(value('sw',1),'337.3');assert.equal(delta('sw',1),'+17.3');assert.equal(delta('rw',1),'−8.2');assert.equal(delta('balance',2),'+5');assert.equal(value('rw',2),'SW 待ち');
  // the other kept features
  assert(q('#only-different'));
  // edge cases through the same renderer
  const edge=M.validate({app:'racket-note',version:1,rackets:[{id:'x',name:'端',individual:'1',records:[
   rec('e1',{date:'2026-01-01',sw:300,balance:320,tw:13,weight:300,state:'bare',baseGrip:'',overgrip:'なし',customParts:[]}),
   rec('e2',{date:'2026-01-02',balance:320,state:'strung',customParts:[{position:'3時',grams:1},{position:'9時',grams:1},{position:'スロート',grams:2}],overgrip:'YONEX OG',stringMainGauge:1.3}),
   rec('e3',{date:'2026-01-03',state:'strung',customParts:[{position:'3時',grams:1}],baseGrip:'レザー',overgrip:'なし',stringMain:'銘柄のみ'}),
   rec('e4',{date:'2026-01-04',sw:310,state:'strung',customParts:[{position:'12時',grams:0.5},{position:'6時',grams:0.5}],tensionMain:44,tensionCross:44,baseGrip:'KGL'}),
   rec('e5',{date:'2026-01-05',state:'ready',baseGrip:'純正'})
  ]}]});
  edge.rackets[0].records[4].date='';
  const sel=['e1','e2','e3','e4'].map(id=>({racketId:'x',recordId:id}));let root=parse(U.comparison(edge,sel,'e1',false));
  assert.deepEqual(cellsOf(root,'rw'),[(300-0.3*(32-10)**2).toFixed(1),'SW・重量 待ち','SW・BP・重量 待ち','BP・重量 待ち']);
  assert.deepEqual(cellsOf(root,'load'),['なし','3時・9時 各1.0 g、スロート 2.0 g','3時 1.0 g','12時・6時 各0.5 g']);
  assert.deepEqual(cellsOf(root,'grip'),['未記録／OGなし','未記録／OGあり','レザー／OGなし','KGL／未記録']);
  assert.deepEqual(cellsOf(root,'stringMain'),['なし','1.30 mm','銘柄のみ','44 lb']);
  assert.deepEqual(cellsOf(root,'stringCross'),['なし','未記録','未記録','44 lb']);
  root=parse(U.comparison(edge,[{racketId:'x',recordId:'e5'},{racketId:'x',recordId:'e1'}],'e5',false));assert.deepEqual(cellsOf(root,'grip'),['純正／OGあり','未記録／OGなし']);assert.equal(root.querySelectorAll('.cmp-table thead .cmp-date').length,1);
  root=parse(U.comparison(edge,[],'',false));assert.match(root.textContent,/比較したい記録を選ぶ/);
  // never saved, never changed
  assert.equal(writes,0);assert.equal(JSON.stringify(data),before);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({nineRowsInOrder:true,pictureDifferences:true,notMeasuredAndWaiting:true,loadOnlyFromParts:true,gripAndOvergrip:true,strings:true,addLimitAndRemove:true,setBase:true,supplementKept:true,mixedRackets:true,recordWrites:writes,originalDataUnchanged:true,realBrowser:false,errors}));
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
