const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=name=>fs.readFileSync(path.join(__dirname,'dist',name),'utf8'),waitFor=async(check,what,limit=3000)=>{const start=Date.now();let last;while(Date.now()-start<limit){try{if(check())return;}catch(error){last=error;}await new Promise(resolve=>setTimeout(resolve,5));}throw new Error('Timed out waiting for: '+what+(last?' (last error: '+last.message+')':''));};
(async()=>{
 const dom=new JSDOM(read('index.html'),{url:'https://grooveworks.github.io/racket-note/#/',runScripts:'outside-only'}),w=dom.window,errors=[];
 w.structuredClone=structuredClone;w.CSS={escape:value=>String(value).replace(/[^a-zA-Z0-9_-]/g,'\\$&')};w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.addEventListener('error',event=>errors.push(event.message));
 for(const name of ['model.js','protocol.js','workspace-ui.js','workspace-forms.js','voice-input.js','history-ledger.js'])w.eval(read(name));
 const M=w.RacketLedgerModel,P=w.RacketNoteProtocol,rec=(id,extra)=>({id,kind:'measured',state:'bare',tensionUnit:'lb',createdAt:'2026-11-01T00:00:00.000Z',date:'2026-11-01',...extra});
 let data=M.validate({app:'racket-note',version:1,rackets:[
  {id:'a',name:'DEFYER98PROV1',maker:'YONEX',face:'98',pattern:'16×19',length:'27 inch',gripSize:'G2',individual:'1号機',records:[rec('a1',{sw:310}),rec('a2',{sw:311}),rec('a3',{sw:312})]},
  {id:'b',name:'別のラケット',individual:'',records:[rec('b1',{sw:300})]}
 ]});
 let callback,plans=[];const emit=()=>callback({user:{uid:'synthetic',email:'test@example.test'},ready:true,status:'connected',data:structuredClone(data)});
 w.RacketLedgerCloud={init(fn){callback=fn;emit();},data:()=>structuredClone(data),revisions:()=>({}),async commit(previous,next){plans.push(P.plan(previous,next));data=M.validate(next);emit();return structuredClone(data);}};w.RacketReportReader={read:(user,fn)=>fn([])};w.eval(read('workspace-app.js'));
 const q=selector=>{const node=w.document.querySelector(selector);assert(node,'Missing '+selector);return node;},click=selector=>q(selector).click(),all=selector=>[...w.document.querySelectorAll(selector)],has=selector=>Boolean(w.document.querySelector(selector));
 const typeIn=(node,value)=>{node.value=value;node.dispatchEvent(new w.Event('input',{bubbles:true}));},submit=()=>q('#edit-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 const search=value=>typeIn(q('#edit-form [name=name]'),value),submitButton=()=>q('#edit-form [type=submit]');
 try{
  // ---- F1 opens from the same entry button ----
  click('[data-action="new-racket"]');
  assert.equal(q('#editor-title').textContent,'ラケットを登録');assert(q('#edit-form').dataset.register==='models');assert.equal(q('#editor').open,true);
  assert.equal(q('[aria-label="モデル名で探す"]').type,'search');assert.equal(q('[data-voice-mic]').getAttribute('aria-label'),'音声で探す');
  assert.match(q('.reg-form').textContent,/持っているモデル/);assert.match(q('.reg-form').textContent,/見つからないとき/);
  assert.deepEqual(all('.reg-model').map(n=>n.textContent),['DEFYER98PROV1','別のラケット']);
  assert.equal(all('.reg-sub')[0].textContent,'登録済み：1号機 · 測定 3件');assert.equal(all('.reg-add')[0].textContent,'2本目として追加');assert.equal(all('.reg-sub')[1].textContent,'登録済み：1号機 · 測定 1件');
  assert.equal(submitButton().disabled,true,'no model chosen yet');assert.equal(q('[data-action="register-new-model"]').textContent,'新しいモデルとして登録');
  assert.equal(q('#cancel-edit').textContent,'キャンセル');assert.equal(submitButton().textContent,'登録して加工前を測る');
  // search narrows the list and picks the match
  search('defy');assert.deepEqual(all('.reg-model').map(n=>n.textContent),['DEFYER98PROV1']);assert(q('.reg-card').classList.contains('selected'));
  assert.equal(submitButton().disabled,false);assert.equal(q('[name=individual]').value,'2号機');assert.match(q('.reg-inherit').textContent,/1号機から引き継ぐ/);
  assert.deepEqual(all('.reg-chip').map(n=>n.textContent),['メーカー','フェイス','ストリングパターン','長さ','グリップサイズ']);assert.match(q('.reg-inherit').textContent,/測定の履歴は 0件 から始まる/);
  assert.deepEqual(['maker','face','pattern','length','gripSize'].map(k=>q('#edit-form [name='+k+']').value),['YONEX','98','16×19','27 inch','G2']);
  assert.equal(q('[data-action="register-new-model"]').textContent,'「defy」を新しいモデルとして登録');
  search('ZZZ');assert.equal(all('.reg-card').length,0);assert.match(q('.reg-empty').textContent,/該当するモデルはありません/);assert.equal(submitButton().disabled,true);assert.equal(q('[data-action="register-new-model"]').textContent,'「ZZZ」を新しいモデルとして登録');
  // a duplicate individual name is refused as before
  search('');click('[data-action="register-pick"][data-model]');assert.equal(q('[name=individual]').value,'2号機');
  typeIn(q('[name=individual]'),'1号機');submit();await waitFor(()=>!q('#form-error').hidden,'duplicate refused');assert.match(q('#form-error').textContent,/使用済み/);assert.equal(plans.length,0);
  // second copy: auto name, inherited fields, history 0, then F2 opens for the new individual
  typeIn(q('[name=individual]'),'2号機');submit();await waitFor(()=>plans.length===1&&has('[data-hl-body] #edit-form'),'registered and F2 opened');
  const added=data.rackets.find(r=>!['a','b'].includes(r.id));assert(added);
  assert.equal(added.name,'DEFYER98PROV1');assert.equal(added.individual,'2号機');assert.equal(added.maker,'YONEX');assert.equal(added.face,'98');assert.equal(added.pattern,'16×19');assert.equal(added.length,'27 inch');assert.equal(added.gripSize,'G2');assert.equal(added.records.length,0);
  assert.equal(data.rackets.find(r=>r.id==='a').individual,'1号機');assert.equal(data.rackets.find(r=>r.id==='a').records.length,3);
  assert.equal(q('#editor').open,false);assert.match(q('.hl-editor-head').textContent,/加工前を測る/);assert.match(q('.hl-editor-head').textContent,/2号機/);assert.equal(q('#edit-form').closest('[data-hl-body]').dataset.hlBody,added.id);
  click('#cancel-edit');

  // ---- a model without an individual name gets the first one renamed 1号機, the copy 2号機 ----
  click('[data-action="new-racket"]');search('別');assert.equal(q('[name=individual]').value,'2号機');submit();await waitFor(()=>plans.length===2&&has('[data-hl-body] #edit-form'),'second model copy registered');
  assert.equal(data.rackets.find(r=>r.id==='b').individual,'1号機');assert.equal(data.rackets.filter(r=>r.name==='別のラケット').length,2);click('#cancel-edit');

  // ---- a new model uses the existing registration form, without the first-measurement block ----
  click('[data-action="new-racket"]');search('新型ラケット');click('[data-action="register-new-model"]');
  assert.equal(q('#editor').open,true);assert.equal(q('#editor-title').textContent,'新しいラケットを登録');assert.equal(q('#edit-form [name=name]').value,'新型ラケット');
  for(const k of ['maker','face','pattern','length','gripSize','individual','racketNote'])q('#edit-form [name='+k+']');
  assert.equal(has('.initial-measurement'),false);assert.equal(has('#edit-form [name=sw]'),false);assert.equal(submitButton().textContent,'登録して加工前を測る');
  typeIn(q('#edit-form [name=maker]'),'テスト社');submit();await waitFor(()=>plans.length===3&&has('[data-hl-body] #edit-form'),'new model registered and F2 opened');
  const fresh=data.rackets.find(r=>r.name==='新型ラケット');assert(fresh);assert.equal(fresh.maker,'テスト社');assert.equal(fresh.records.length,0);assert.match(q('.hl-editor-head').textContent,/加工前を測る/);click('#cancel-edit');
  // duplicate model + individual is refused in the new-model form too
  click('[data-action="new-racket"]');search('新型ラケット');click('[data-action="register-new-model"]');typeIn(q('#edit-form [name=individual]'),'');submit();
  await waitFor(()=>!q('#form-error').hidden,'duplicate model refused');assert.equal(plans.length,3);
  q('#cancel-edit').click();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({f1:true,search:true,secondCopy:true,newModel:true,duplicateRefused:true,f2Opens:true,plans:plans.length,errors}));
 }catch(error){console.error(error);process.exitCode=1;}
})();
