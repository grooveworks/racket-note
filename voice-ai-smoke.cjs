const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=name=>fs.readFileSync(path.join(__dirname,'dist',name),'utf8'),waitFor=async(check,what,limit=3000)=>{const start=Date.now();let last;while(Date.now()-start<limit){try{if(check())return;}catch(error){last=error;}await new Promise(resolve=>setTimeout(resolve,5));}throw new Error('Timed out waiting for: '+what+(last?' (last error: '+last.message+')':''));};
(async()=>{
 const dom=new JSDOM(read('index.html'),{url:'https://grooveworks.github.io/racket-note/#/',runScripts:'outside-only'}),w=dom.window,errors=[];
 w.structuredClone=structuredClone;w.CSS={escape:value=>String(value).replace(/[^a-zA-Z0-9_-]/g,'\\$&')};w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.addEventListener('error',event=>errors.push(event.message));
 for(const name of ['model.js','protocol.js','workspace-ui.js','workspace-forms.js','voice-input.js','history-ledger.js'])w.eval(read(name));
 const M=w.RacketLedgerModel,rec=(id,extra)=>({id,kind:'measured',state:'bare',tensionUnit:'lb',createdAt:'2026-11-01T00:00:00.000Z',date:'2026-11-01',...extra});
 let data=M.validate({app:'racket-note',version:1,rackets:[
  {id:'empty',name:'DEFYER98PROV1',individual:'2号機',records:[]},
  {id:'prev',name:'DEFYER98PROV1',individual:'1号機',records:[rec('p1',{date:'2026-11-20',condition:'初回',sw:310,customParts:[{position:'3時',grams:1,material:'鉛'}]})]}
 ]});
 let callback,saved=[];const emit=()=>callback({user:{uid:'synthetic',email:'test@example.test'},ready:true,status:'connected',data:structuredClone(data)});
 w.RacketLedgerCloud={init(fn){callback=fn;emit();},data:()=>structuredClone(data),revisions:()=>({}),async commit(previous,next){saved.push(structuredClone(next));data=M.validate(next);emit();return structuredClone(data);}};w.RacketReportReader={read:(user,fn)=>fn([])};w.eval(read('workspace-app.js'));
 // A fake AI: no network. Each test sets `reply`.
 const sent=[];let reply=null;w.RacketVoiceAI={parse:text=>{sent.push(text);return reply(text);}};
 const q=selector=>{const node=w.document.querySelector(selector);assert(node,'Missing '+selector);return node;},click=selector=>q(selector).click(),all=selector=>[...w.document.querySelectorAll(selector)];
 const typeIn=(node,value)=>{node.value=value;node.dispatchEvent(new w.Event('input',{bubbles:true}));},status=()=>q('[data-voice-status]').textContent;
 const speak=text=>{typeIn(q('[data-voice-text]'),text);click('[data-voice-apply]');};
 const ok=value=>()=>Promise.resolve(value),ng=code=>()=>Promise.reject(Object.assign(new Error('x'),{code}));
 try{
  click('[data-hl-group="empty"] .hl-add-button');
  // the card states what is sent and the picture's wording
  assert.equal(q('.capture-voice-privacy').textContent,'話した文は、読み取りのために Google の AI に送られます');assert.match(w.RacketVoiceInput.controls(false,''),/決まった言い方はなし · 聞き取った内容は下の欄に入り、違えば触って直す/);assert.doesNotMatch(q('.capture-voice').textContent,/加重・施工/);
  // success: four fields, colour marks, original sentence kept
  reply=ok({fields:{sw:310,balance:316,tw:12.3,weight:308},parts:[],unknown:''});
  speak('スイング310、バランス316、ツイスト12.3、重量308');
  await waitFor(()=>/4項目に反映/.test(status()),'4 fields reflected');
  for(const [k,v] of [['sw','310'],['balance','316'],['tw','12.3'],['weight','308']]){assert.equal(q('#edit-form [name='+k+']').value,v);assert.equal(q('#edit-form [name='+k+']').dataset.voiceChanged,'true');}
  assert.equal(q('[name=inputTranscript]').value,'スイング310、バランス316、ツイスト12.3、重量308');assert.deepEqual(sent,['スイング310、バランス316、ツイスト12.3、重量308']);assert.equal(q('[data-rw]').textContent,'166.3');
  // unknown words are shown, not dropped
  reply=ok({fields:{},parts:[],unknown:'今日は寒い'});speak('今日は寒い');await waitFor(()=>/読み取れなかった言葉：今日は寒い/.test(status()),'unknown shown');assert.match(status(),/反映できる項目がありませんでした/);
  // parts become rows with a colour mark; existing rows stay untouched
  reply=ok({fields:{},parts:[{position:'3時',grams:1,material:'鉛'},{position:'9時',grams:1}],unknown:''});speak('3時と9時に各1g追加');await waitFor(()=>/加重に反映/.test(status()),'parts reflected');
  assert.deepEqual(all('[data-part] .hl-f-pos').map(n=>n.textContent),['3時','9時']);assert.deepEqual(all('[data-part]').map(n=>n.dataset.voiceChanged),['true','true']);assert.equal(q('[data-parts-total]').textContent,'計 2.0 g');
  assert.equal(q('[data-parts-json]').name,'customPartsJson');
  assert.equal(q('[name=inputTranscript]').value.split('\n').length,3,'every spoken sentence is kept');
  // failure of every kind: fixed words are used and the reason is shown
  for(const [code,reason] of [['offline','通信できません'],['quota','回数の上限です。1分ほど待ってください'],['timeout','時間切れです'],['error','その他のエラー']]){
   typeIn(q('#edit-form [name=sw]'),'');reply=ng(code);speak('SW322');
   await waitFor(()=>status().includes('AI で読み取れなかったため、決まった語だけを反映しました（'+reason+'）'),'fallback '+code);
   assert.equal(q('#edit-form [name=sw]').value,'322');assert.match(status(),/1項目を反映/);
  }
  // reading in progress: a second press is ignored
  let release;reply=()=>new Promise(resolve=>{release=resolve;});const before=sent.length;
  speak('SW330');assert.equal(status(),'読み取り中…');assert.equal(q('[data-voice-apply]').disabled,true);click('[data-voice-apply]');click('[data-voice-apply]');assert.equal(sent.length,before+1);
  release({fields:{sw:330},parts:[],unknown:''});await waitFor(()=>/1項目に反映/.test(status()),'finished');assert.equal(q('[data-voice-apply]').disabled,false);assert.equal(q('#edit-form [name=sw]').value,'330');
  // the existing-row case: a part at an existing position is not added twice
  click('#cancel-edit');if(q('#confirm-dialog').open)click('#confirm-yes');
  await waitFor(()=>!w.document.getElementById('edit-form'),'closed');
  click('[data-hl-group="prev"] .hl-add-button');assert.deepEqual(all('[data-part] .hl-f-pos').map(n=>n.textContent),['3時']);
  reply=ok({fields:{},parts:[{position:'3時',grams:5},{position:'スロート',grams:0.5,material:'鉛'}],unknown:''});speak('スロートに鉛0.5');await waitFor(()=>/加重に反映/.test(status()),'parts added to existing');
  assert.deepEqual(all('[data-part] .hl-f-pos').map(n=>n.textContent),['3時','スロート']);assert.equal(all('[data-part-grams]')[0].value,'1.0','existing row is not rewritten');assert.equal(all('[data-part]')[0].dataset.voiceChanged,undefined);assert.match(status(),/同じ位置の加重 1件は既にあるため足していません/);
  click('#cancel-edit');if(q('#confirm-dialog').open)click('#confirm-yes');
  await waitFor(()=>!w.document.getElementById('edit-form'),'closed');
  // the racket-name voice does not call the AI
  const calls=sent.length;click('[data-action="new-racket"]');assert.equal(has('.capture-voice-privacy'),false);
  typeIn(q('[data-voice-text]'),'ヨネックス');click('[data-voice-apply]');assert.equal(q('#edit-form [name=name]').value,'ヨネックス');assert.equal(sent.length,calls);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({aiFields:true,aiParts:true,unknown:true,fallbackKinds:4,busy:true,nameVoiceNoAI:true,aiCalls:sent.length,errors}));
  function has(selector){return Boolean(w.document.querySelector(selector));}
 }catch(error){console.error(error);process.exitCode=1;}
})();
