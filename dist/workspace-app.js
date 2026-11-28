(function() {
  'use strict';
  const M=window.RacketLedgerModel,C=window.RacketLedgerCloud,U=window.RacketWorkspaceUI,F=window.RacketWorkspaceForms,H=window.RacketHistoryLedger,V=window.RacketVoiceInput;
  const main=document.getElementById('main'),editor=document.getElementById('editor'),backup=document.getElementById('backup-dialog'),confirmDialog=document.getElementById('confirm-dialog'),picker=document.getElementById('record-picker');
  const DRAFT_KEY='racket-note-draft-';
  let state=M.empty(),selected=[],baseline='',onlyDifferent=false,activeEdit=null,dirty=false,restoredDraft=null,confirmAction=null,saving=false,hasLoaded=false,toastTimer;
  let connection={user:null,ready:false,status:'loading'},filters={query:'',state:'',kind:'',sort:'recent',source:'personal'};
  let reports=[],stopVoice=()=>{},newMark='',savedBar=null,reg=null;const historyBases={},collapsedRackets=new Set();let openDetail=null;
  const id=()=>crypto.randomUUID(),stamp=()=>new Date().toISOString(),racketFor=key=>state.rackets.find(r=>r.id===key),isCompare=()=>location.hash.startsWith('#/compare');
  function message(text,error=false) {const area=document.getElementById('toast');clearTimeout(toastTimer);area.textContent=text;area.classList.toggle('toast-error',error);area.hidden=false;toastTimer=setTimeout(()=>area.hidden=true,5000);}
  function storageError(text) {const area=document.getElementById('storage-error');area.textContent=text;area.hidden=false;}
  function formError(text) {const area=document.getElementById('form-error');if(area){area.textContent=text;area.hidden=false;area.scrollIntoView({block:'nearest'});}}
  function readDraft() {restoredDraft=null;if(!connection.user)return;try{const d=JSON.parse(localStorage.getItem(DRAFT_KEY+connection.user.uid)||'null');if(d?.uid===connection.user.uid&&d.values&&d.base&&d.revisions)restoredDraft=d;}catch{}}
  function formValues() {return Object.fromEntries([...document.getElementById('edit-form').elements].filter(n=>n.name&&['INPUT','SELECT','TEXTAREA'].includes(n.tagName)).map(n=>[n.name,n.value]));}
  function storeDraft() {
    if(!activeEdit||!document.getElementById('edit-form'))return;
    restoredDraft={...activeEdit,values:formValues()};
    try{localStorage.setItem(DRAFT_KEY+activeEdit.uid,JSON.stringify(restoredDraft));const hint=document.getElementById('draft-status');if(hint)hint.textContent='入力は下書きに保持 · サーバーには未保存';}
    catch{formError('下書きを保持できません。この画面を閉じる前に保存してください。');}
  }
  function clearDraft() {const key=activeEdit?.uid||connection.user?.uid;restoredDraft=null;try{if(key)localStorage.removeItem(DRAFT_KEY+key);}catch{}}
  function busy(value) {saving=value;document.querySelectorAll('#edit-form input,#edit-form textarea,#edit-form select,#edit-form button,#editor-close,#account-button,#backup-button').forEach(n=>n.disabled=value);const submit=document.querySelector('#edit-form [type=submit]');if(submit)submit.textContent=value?'サーバーに保存中…':submit.dataset.label||(activeEdit?.type==='racket'&&!activeEdit.racketId?'登録する':'保存する');}
  async function commit(next,before=activeEdit?.base||state,revisions=activeEdit?.revisions||C.revisions()) {
    if(saving)return false;busy(true);
    try{state=await C.commit(before,M.validate(next),revisions);document.getElementById('storage-error').hidden=true;return true;}
    catch(error){if(dirty)storeDraft();storageError('保存できませんでした。'+error.message);formError(error.message);return false;}
    finally{busy(false);document.getElementById('backup-button').disabled=!hasLoaded||!connection.user;}
  }
  function ask(title,text,label,action) {document.getElementById('confirm-title').textContent=title;document.getElementById('confirm-message').textContent=text;document.getElementById('confirm-yes').textContent=label;confirmAction=action;confirmDialog.showModal();}
  document.getElementById('confirm-no').addEventListener('click',()=>{confirmDialog.close();confirmAction=null;});
  document.getElementById('confirm-yes').addEventListener('click',()=>{const action=confirmAction;confirmAction=null;confirmDialog.close();if(action)Promise.resolve(action()).catch(error=>storageError(error.message));});
  confirmDialog.addEventListener('cancel',()=>confirmAction=null);
  function syncHistoryGroups() {
    main.querySelectorAll('[data-hl-group]').forEach(group=>{
      const collapsed=collapsedRackets.has(group.dataset.hlGroup),toggle=group.querySelector('[data-hl-toggle]');
      group.dataset.collapsed=String(collapsed);group.querySelector('[data-hl-content]').hidden=collapsed;
      toggle.setAttribute('aria-expanded',String(!collapsed));toggle.setAttribute('aria-label',toggle.dataset.name+'の測定履歴を'+(collapsed?'開く':'閉じる'));
      toggle.querySelector('[data-hl-fold-label]').textContent=collapsed?'開く':'閉じる';toggle.querySelector('[data-hl-fold-icon]').textContent=collapsed?'＋':'−';
      const base=group.querySelector('[data-hl-base]')?.closest('label');if(base)base.hidden=collapsed;
    });
  }
  function syncDetail() {
    main.querySelectorAll('[data-hl-detail]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.hlDetail===openDetail)));
    const frame=main.querySelector('[data-hl-detail-frame]'),racket=openDetail&&state.rackets.find(r=>r.records.some(k=>k.id===openDetail)),record=racket?.records.find(k=>k.id===openDetail),row=record&&main.querySelector(`[data-hl-record="${CSS.escape(record.id)}"]`);
    if(openDetail&&!record)openDetail=null;
    if(!openDetail||!row){frame?.remove();return;}
    if(frame?.dataset.record===openDetail&&frame.dataset.hlDetailFrame===racket.id)return;
    frame?.remove();
    const wrap=row.closest('[data-hl-content]')?.querySelector('.hl-table-wrap');if(wrap)wrap.insertAdjacentHTML('afterend',H.detailFrame(racket,record));
  }
  function syncNew() {
    main.querySelectorAll('[data-hl-record]').forEach(row=>{
      const mine=Boolean(newMark)&&row.dataset.hlRecord===newMark,head=row.querySelector('th.hl-string'),mark=head?.querySelector('.hl-new-mark');
      row.classList.toggle('is-new',mine);
      if(mine&&head&&!mark)head.insertAdjacentHTML('afterbegin','<span class="hl-new-mark">新</span>');else if(!mine)mark?.remove();
    });
  }
  function clearSavedBar() {if(!savedBar)return;savedBar=null;document.getElementById('saved-bar')?.remove();selectionUI();}
  function showSavedBar(withCompare) {
    savedBar={withCompare};let bar=document.getElementById('saved-bar');
    if(!bar){bar=document.createElement('div');bar.id='saved-bar';bar.className='saved-bar';bar.setAttribute('role','status');document.body.append(bar);}
    bar.innerHTML=`<span class="saved-bar-icon" aria-hidden="true">✓</span><div class="saved-bar-text">保存した${withCompare?' · 前回と2件を比較に選択済み':''}</div>${withCompare?'<button type="button" class="saved-bar-clear" data-action="saved-clear">選択を外す</button><button type="button" class="saved-bar-view" data-action="saved-compare">比較を見る</button>':''}`;
    selectionUI();
  }
  function selectionUI() {
    selected=selected.filter(i=>racketFor(i.racketId)?.records.some(r=>r.id===i.recordId));
    if(!selected.some(i=>i.recordId===baseline))baseline=selected[0]?.recordId||'';
    document.getElementById('nav-compare-count').textContent=selected.length||'';
    const area=document.getElementById('compare-tray');area.hidden=!selected.length||isCompare()||!connection.user||Boolean(savedBar);
    area.innerHTML=`<div class="tray-description"><strong>${selected.length} 件を選択中</strong><span>${selected.map(i=>U.esc([racketFor(i.racketId)?.name,racketFor(i.racketId)?.individual].filter(Boolean).join(' · '))).join(' / ')}</span></div><div class="tray-actions"><button class="text-button" data-action="clear-compare">解除</button><button class="button" data-action="choose-records">記録を追加</button><a class="button primary" href="#/compare">比較する →</a></div>`;
    const count=document.getElementById('picker-selection-count');if(count)count.textContent=`${selected.length} / 4 件を選択中`;
    document.querySelectorAll('[data-compare]').forEach(n=>{n.checked=selected.some(i=>i.recordId===n.dataset.compare);n.closest('tr')?.classList.toggle('selected-row',n.checked);});
    document.querySelectorAll('.main-nav a').forEach(n=>{const active=n.dataset.nav===(isCompare()?'compare':'rackets');n.classList.toggle('active',active);if(active)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});
    syncHistoryGroups();syncDetail();syncNew();
  }
  function render() {
    if(activeEdit?.inline&&document.getElementById('edit-form')){selectionUI();return;}
    const scroll=window.scrollY;
    const supplementWasOpen=main.querySelector('.comparison-supplement')?.open;
    if(!connection.user) {
      main.innerHTML=U.header('ラケットノート','自分のラケットのスペックと、測定の履歴。')+`<section class="login-panel panel"><div><div class="login-symbol">${U.glyph}</div><h2>記録も比較も、ひとつの場所に。</h2><p>重量・バランス・SWを測定条件と一緒に保存。<br>別のラケットや過去の記録を並べて比較できます。</p><button class="button primary" data-action="login">Googleでログイン</button><small>同じGoogleアカウントで、PC・スマートフォンから。</small></div><div class="login-preview" aria-hidden="true"><div>ラケット <b>重量</b><b>SW</b></div><div>測定の記録<span>—</span><span>—</span></div><div>条件と履歴<span>—</span><span>—</span></div><p>記録を選ぶ　→　並べて比較</p></div></section>`;
    } else if(!hasLoaded)main.innerHTML=U.header('ラケット','保存済みの記録を確認しています。')+`<section class="panel empty-state"><h2>${connection.status==='loading'?'サーバーから読み込み中…':'接続を確認してください'}</h2><p>${connection.status==='loading'?'ラケットと測定履歴を読み込んでいます。':'保存済みの記録を確認できません。通信が戻ってから再読み込みしてください。'}</p><button class="button" data-action="reload">再読み込み</button></section>`;
    else {
      const route=location.hash.slice(1).split('/');
      if(route[1]==='racket'){let key='';try{key=decodeURIComponent(route[2]||'');}catch{}const racket=racketFor(key);main.innerHTML=racket?'<div class="history-ledger"><a class="text-button" href="#/">すべての履歴</a>'+H.group(racket,selected,historyBases[racket.id])+'</div>':U.detail(null,selected);}
      else if(route[1]==='compare')main.innerHTML=U.comparison(state,selected,baseline,onlyDifferent);
      else main.innerHTML=H.overview(state,selected,filters,restoredDraft,historyBases,reports);
    }
    if(supplementWasOpen)main.querySelector('.comparison-supplement')?.setAttribute('open','');
    selectionUI();
    window.scrollTo(0,scroll);
  }
  function updateResults() {if(activeEdit?.inline)return;const results=document.getElementById('overview-results');if(results)results.innerHTML=H.results(state,selected,filters,historyBases)+(filters.source!=='lab'?H.reportsView(reports,state):'');selectionUI();}
  function openEdit(type,racketId,recordId,restoreValues,draftMeta,sourceId,cloneFromId,presetName) {
    clearSavedBar();
    if(!connection.ready||saving){message('サーバーへの接続を確認してから記録してください。',true);return;}
    if(activeEdit){if(dirty){ask('入力を切り替えますか？','今の入力を破棄して、別の記録を開きます。','切り替える',()=>{finishEditor();openEdit(type,racketId,recordId,restoreValues,draftMeta,sourceId,cloneFromId);});return;}stopVoice();document.querySelector('.hl-inline-row')?.remove();activeEdit=null;}
    if(restoredDraft&&!restoreValues){ask('入力途中の下書きがあります','新しい入力を始めると、保持してある下書きを置き換えます。','新しく入力',()=>{clearDraft();openEdit(type,racketId,recordId,null,null,sourceId,cloneFromId);});return;}
    const racket=racketFor(racketId);if(racketId&&!racket){message('ラケットが見つかりません。',true);return;}
    const existing=recordId?racket?.records.find(r=>r.id===recordId):null;
    if(existing?.source){message('引き継いだ記録は原文を保持します。「この条件で記録」から新しい測定を追加できます。');return;}
    if(recordId&&!existing){message('対象の記録は削除されています。下書きは保持しています。',true);return;}
    if(type==='record')collapsedRackets.delete(racketId);
    if(type==='record'&&!main.querySelector(`[data-hl-body="${CSS.escape(racketId)}"]`)){filters.racket=racketId;filters.source='personal';filters.query='';main.innerHTML=H.overview(state,selected,filters,restoredDraft,historyBases,reports);}
    activeEdit={type,cloneFromId:cloneFromId||draftMeta?.cloneFromId,inline:type==='record',racketId,recordId,sourceId:sourceId||draftMeta?.sourceId,uid:connection.user.uid,targetId:draftMeta?.targetId||recordId||(type==='racket'&&racket?racket.id:id()),initialRecordId:draftMeta?.initialRecordId||id(),createdAt:draftMeta?.createdAt||stamp(),base:draftMeta?.base||structuredClone(state),revisions:draftMeta?.revisions||C.revisions()};
    const source=racket?.records.find(r=>r.id===activeEdit.sourceId)||M.sorted(racket?.records||[])[0];
    if(activeEdit.inline&&!activeEdit.sourceId&&source)activeEdit.sourceId=source.id;
    document.getElementById('editor-title').textContent=type==='racket'?(racket?'名前・基本情報を編集':activeEdit.cloneFromId?'同じモデルをもう1本':'新しいラケットを登録'):(existing?'測定記録を編集':'測定を記録');
    document.getElementById('editor-content').replaceChildren();
    if(type==='racket'&&!racketId&&!cloneFromId&&!restoreValues&&presetName===undefined){openRegister();return;}
    if(activeEdit.inline){const row=document.createElement('tr');row.className='hl-inline-row';row.innerHTML=H.inlineForm(racket,source,existing,restoreValues,state);const body=main.querySelector(`[data-hl-body="${CSS.escape(racketId)}"]`),anchor=body.querySelector(`[data-hl-record="${CSS.escape(recordId||source?.id||'')}"]`);if(anchor)anchor.after(row);else body.prepend(row);}
    else document.getElementById('editor-content').innerHTML=F.form(activeEdit,racket,existing,source,restoreValues);
    dirty=Boolean(restoreValues);
    const form=document.getElementById('edit-form');
    if(activeEdit.inline)H.bind(form);
    const syncStringFields=()=>{const bare=form.elements.state?.value==='bare',fields=form.querySelector('[data-string-fields]'),hint=form.querySelector('[data-string-empty]');if(fields)fields.hidden=bare;if(hint)hint.hidden=!bare;};
    form.addEventListener('change',syncStringFields);
    form.addEventListener('input',()=>{dirty=true;storeDraft();});form.addEventListener('change',()=>{dirty=true;storeDraft();});
    if(type==='racket'){const voice=document.createElement('div');voice.innerHTML=V.controls(true,restoreValues?.voiceDraft||'');form.querySelector('.identity-section').prepend(voice);}
    stopVoice=V.attach(form,()=>{dirty=true;storeDraft();});
    form.addEventListener('submit',event=>{event.preventDefault();submitEdit();});document.getElementById('cancel-edit').addEventListener('click',closeEditor);document.getElementById('delete-item')?.addEventListener('click',deleteItem);
    if(presetName&&type==='racket')form.elements.namedItem('name').value=presetName;
    syncHistoryGroups();if(!activeEdit.inline&&!editor.open)editor.showModal();(form.querySelector('[name=name]')||form.querySelector('[name=sw]'))?.focus({preventScroll:true});if(activeEdit.inline)form.scrollIntoView({block:'nearest'});
  }
  function openRegister() {
    reg={query:'',pick:null,individual:null};
    document.getElementById('editor-title').textContent='ラケットを登録';
    document.getElementById('editor-content').innerHTML=F.registerForm();
    const form=document.getElementById('edit-form'),voice=form.querySelector('[data-reg-voice]');
    voice.innerHTML=V.controls(true,'');voice.querySelector('[data-voice-mic]')?.setAttribute('aria-label','音声で探す');
    dirty=false;
    reg.refresh=()=>{
      const r=F.registerModels(state,reg);form.querySelector('#reg-models').innerHTML=r.html;
      activeEdit.cloneFromId=r.sourceId||undefined;activeEdit.regName=r.name;form.querySelector('[type=submit]').disabled=!r.name||saving;
      form.querySelector('[data-action="register-new-model"]').textContent=reg.query.trim()?`「${reg.query.trim()}」を新しいモデルとして登録`:'新しいモデルとして登録';
    };
    const search=form.elements.namedItem('name');
    form.addEventListener('input',event=>{
      if(event.target===search){reg.query=search.value;reg.pick=null;reg.individual=null;reg.refresh();}
      else if(event.target.name==='individual')reg.individual=event.target.value;
    });
    stopVoice=V.attach(form,()=>{reg.query=search.value;reg.pick=null;reg.individual=null;reg.refresh();});
    form.addEventListener('submit',event=>{event.preventDefault();submitEdit();});document.getElementById('cancel-edit').addEventListener('click',closeEditor);
    reg.refresh();if(!editor.open)editor.showModal();search.focus({preventScroll:true});
  }
  function finishEditor() {clearDraft();stopVoice();document.querySelector('.hl-inline-row')?.remove();dirty=false;activeEdit=null;editor.close();document.getElementById('editor-content').replaceChildren();state=C.data();render();}
  function closeEditor() {if(saving)return;if(dirty)ask('変更を破棄しますか？','まだサーバーに保存していない入力があります。','破棄する',finishEditor);else finishEditor();}
  document.getElementById('editor-close').addEventListener('click',closeEditor);editor.addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
  function startMeasurement() {
    if(!connection.ready||saving){message('サーバーへの接続を確認してから記録してください。',true);return;}
    if(activeEdit){if(dirty){ask('入力を切り替えますか？','今の入力を破棄して、測る一本を選び直します。','切り替える',()=>{finishEditor();startMeasurement();});return;}finishEditor();}
    if(!state.rackets.some(r=>r.source?.system!=='racketpedia')){openEdit('racket');return;}
    activeEdit=null;dirty=false;document.getElementById('editor-title').textContent='測定するラケットを選ぶ';document.getElementById('editor-content').innerHTML=U.recordStart(state);editor.showModal();document.getElementById('measurement-racket-search').focus();
  }
  async function submitEdit() {if(saving||!activeEdit)return;stopVoice();try{const values=formValues();if(document.getElementById('edit-form').dataset.register==='models'){if(!activeEdit.regName){formError('登録するモデルを選んでください。');return;}values.name=activeEdit.regName;}if(activeEdit.type==='record'&&!activeEdit.recordId&&!values.condition.trim())values.condition=H.conditionName(values);const next=F.buildChange(activeEdit,values),savedId=activeEdit.targetId,newRacket=activeEdit.type==='racket'&&!activeEdit.racketId,isRecord=activeEdit.type==='record',isNew=isRecord&&!activeEdit.recordId,prevId=activeEdit.sourceId,rid=activeEdit.racketId;if(await commit(next)){finishEditor();if(isRecord){newMark=isNew?savedId:'';const withCompare=isNew&&Boolean(prevId)&&prevId!==savedId&&Boolean(racketFor(rid)?.records.some(k=>k.id===prevId));if(withCompare){selected=[{racketId:rid,recordId:prevId},{racketId:rid,recordId:savedId}];baseline=prevId;}if(isNew)openDetail=savedId;showSavedBar(withCompare);}else message('サーバーに保存しました');if(newRacket){filters.racket=savedId;filters.source='personal';filters.query='';main.innerHTML=H.overview(state,selected,filters,restoredDraft,historyBases,reports);openEdit('record',savedId);}else main.querySelector(`[data-hl-record="${CSS.escape(savedId)}"]`)?.scrollIntoView({block:'nearest'});}}catch(error){formError(error.message);}}
  function deleteItem() {
    const isRacket=activeEdit.type==='racket';
    ask(isRacket?'ラケットを削除しますか？':'この測定記録を削除しますか？',isRacket?'この個体と測定履歴を一覧から削除します。必要な記録は先にバックアップしてください。':'この1件だけを一覧から削除します。他の測定は残ります。','削除する',async()=>{
      const next=structuredClone(activeEdit.base);
      if(isRacket)next.rackets=next.rackets.filter(r=>r.id!==activeEdit.racketId);else{const r=next.rackets.find(r=>r.id===activeEdit.racketId);r.records=r.records.filter(k=>k.id!==activeEdit.recordId);}
      if(await commit(next)){finishEditor();if(isRacket)location.hash='/';render();message('記録を削除しました');}
    });
  }
  function deleteRecord(racketId,recordId) {
    if(!connection.ready||saving){message('サーバーへの接続を確認してから削除してください。',true);return;}
    if(activeEdit){message('先に入力中の測定を保存または取消してください。');return;}
    ask('この測定記録を削除しますか？','この1件だけを一覧から削除します。他の測定は残ります。','削除する',async()=>{
      const before=structuredClone(state),next=structuredClone(state),r=next.rackets.find(k=>k.id===racketId);
      if(!r||!r.records.some(k=>k.id===recordId)){message('対象の記録は既に削除されています。',true);return;}
      r.records=r.records.filter(k=>k.id!==recordId);
      if(await commit(next,before,C.revisions())){state=C.data();selected=selected.filter(i=>i.recordId!==recordId);if(openDetail===recordId)openDetail=null;if(newMark===recordId)newMark='';clearSavedBar();render();message('記録を削除しました');}
    });
  }
  function openPicker() {if(!hasLoaded)return;document.getElementById('picker-search').value='';document.getElementById('picker-list').innerHTML=U.picker(state,selected);selectionUI();picker.showModal();document.getElementById('picker-search').focus();}
  document.getElementById('picker-search').addEventListener('input',event=>document.getElementById('picker-list').innerHTML=U.picker(state,selected,event.target.value));
  document.getElementById('picker-done').addEventListener('click',()=>{picker.close();location.hash='/compare';render();});
  picker.addEventListener('close',()=>{if(isCompare())render();else selectionUI();});
  function download(content,name,type) {const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);}
  document.getElementById('backup-button').addEventListener('click',()=>{document.getElementById('backup-result').textContent='';backup.showModal();});
  document.querySelectorAll('[data-close]').forEach(n=>n.addEventListener('click',()=>document.getElementById(n.dataset.close).close()));
  document.getElementById('export-json').addEventListener('click',()=>{download(JSON.stringify({...state,exportedAt:stamp()},null,2),`racket-note-${F.today()}.json`,'application/json');document.getElementById('backup-result').textContent='JSONバックアップをダウンロードしました。';});
  document.getElementById('export-csv').addEventListener('click',()=>{download(M.csv(state),`racket-note-${F.today()}.csv`,'text/csv;charset=utf-8');document.getElementById('backup-result').textContent='CSVをダウンロードしました。';});
  document.getElementById('import-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    try{if(file.size>5*1024*1024)throw Error('5MB以下のJSONを選んでください。');const incoming=M.validate(JSON.parse((await file.text()).replace(/^\uFEFF/,''))),result=M.merge(state,incoming),before=structuredClone(state),versions=C.revisions();ask('バックアップを読み込みますか？',`ラケット ${result.addedRackets} 本・測定 ${result.addedRecords} 件を追加します。同じIDの測定 ${result.skippedRecords} 件は上書きしません。`,'読み込む',async()=>{if(await commit(result.data,before,versions)){state=C.data();render();document.getElementById('backup-result').textContent='バックアップをサーバーに保存しました。';message('バックアップを読み込みました');}});}catch(error){document.getElementById('backup-result').textContent='読み込めませんでした。'+error.message;}event.target.value='';
  });
  document.addEventListener('input',event=>{if(event.target.id==='search'){if(activeEdit?.inline){message('測定の入力を保存または取消してから絞り込めます。');return;}filters.query=event.target.value;updateResults();}if(event.target.id==='measurement-racket-search')document.getElementById('measurement-racket-choices').innerHTML=U.racketChoices(state,event.target.value);});
  document.addEventListener('change',event=>{
    const node=event.target;
    if(['hl-racket','hl-source','hl-size'].includes(node.id)){if(activeEdit?.inline&&node.id!=='hl-size'){message('測定の入力を保存または取消してから切り替えられます。');node.value=filters[node.id==='hl-racket'?'racket':'source']||'';return;}filters[node.id==='hl-racket'?'racket':node.id==='hl-source'?'source':'size']=node.value;if(node.id==='hl-source')filters.racket='';if(node.id==='hl-size')main.querySelector('.history-ledger').dataset.size=node.value;else render();return;}
    if(node.matches('[data-hl-base]')){const racket=racketFor(node.dataset.hlBase);historyBases[racket.id]=node.value;const body=main.querySelector(`[data-hl-body="${CSS.escape(racket.id)}"]`),shown=new Set([...body.querySelectorAll('[data-hl-record]')].map(n=>n.dataset.hlRecord)),inline=body.querySelector('.hl-inline-row');inline?.remove();body.innerHTML=H.rows(racket,H.order(racket.records).filter(k=>shown.has(k.id)),node.value,selected);syncDetail();syncNew();if(inline){const anchor=body.querySelector(`[data-hl-record="${CSS.escape(activeEdit.recordId||activeEdit.sourceId||'')}"]`);if(anchor)anchor.after(inline);else body.prepend(inline);}return;}
    if(node.id==='state-filter'||node.id==='kind-filter'||node.id==='sort-order'){filters[node.id==='state-filter'?'state':node.id==='kind-filter'?'kind':'sort']=node.value;updateResults();}
    if(node.id==='only-different'){onlyDifferent=node.checked;render();document.getElementById('only-different')?.focus();}
    if(!node.matches('[data-compare]'))return;
    if(node.checked&&!selected.some(i=>i.recordId===node.dataset.compare)){if(selected.length===4){node.checked=false;message('一度に比較できるのは4件までです。');return;}selected.push({racketId:node.dataset.racket,recordId:node.dataset.compare});}
    else if(!node.checked)selected=selected.filter(i=>i.recordId!==node.dataset.compare);
    selectionUI();if(isCompare()&&!picker.open)render();
  });
  document.addEventListener('click',event=>{
    if(savedBar&&!event.target.closest('#saved-bar'))clearSavedBar();
    const fold=event.target.closest('[data-hl-toggle]');if(fold){const key=fold.dataset.hlToggle;if(activeEdit?.inline&&activeEdit.racketId===key&&!collapsedRackets.has(key)){message('入力中のラケットは、保存または取消してから閉じられます。');return;}if(collapsedRackets.has(key))collapsedRackets.delete(key);else collapsedRackets.add(key);syncHistoryGroups();return;}
    const detail=event.target.closest('[data-hl-detail]');if(detail){openDetail=openDetail===detail.dataset.hlDetail?null:detail.dataset.hlDetail;syncDetail();return;}
    const closeDetail=event.target.closest('[data-hl-detail-close]');if(closeDetail){const key=openDetail;openDetail=null;syncDetail();main.querySelector(`[data-hl-detail="${CSS.escape(key||'')}"]`)?.focus();return;}
    const quick=event.target.closest('[data-hl-set]');if(quick){const form=document.getElementById('edit-form');form.elements.namedItem(quick.dataset.hlSet).value=quick.dataset.value;form.dispatchEvent(new Event('change',{bubbles:true}));return;}
    const report=event.target.closest('[data-hl-link-report]');if(report){if(activeEdit){message('先に入力中の測定を保存または取消してください。');return;}const source=reports.find(r=>r.id===report.dataset.hlLinkReport),target=main.querySelector(`[data-hl-report-target="${CSS.escape(source.id)}"]`).value;try{const next=H.linkedReport(source,target,state);commit(next,structuredClone(state),C.revisions()).then(ok=>{if(ok){state=C.data();render();message('元チャット付きで過去の測定を追加しました');}});}catch(error){message(error.message,true);}return;}
    const button=event.target.closest('[data-action]');
    if(button){const action=button.dataset.action;
      if(action==='collapse-all'){state.rackets.forEach(r=>collapsedRackets.add(r.id));if(activeEdit?.inline){collapsedRackets.delete(activeEdit.racketId);message('入力中のラケットは開いたまま、ほかの履歴を閉じました。');}syncHistoryGroups();return;}
      if(action==='expand-all'){collapsedRackets.clear();syncHistoryGroups();return;}
      if(editor.open&&!activeEdit&&['new-racket','edit-racket','new-record'].includes(action))editor.close();
      if(action==='login'){button.disabled=true;C.login().catch(error=>storageError(error.message)).finally(()=>button.disabled=false);}
      else if(action==='reload')location.reload();else if(action==='start-measurement')startMeasurement();else if(action==='new-racket')openEdit('racket');else if(action==='clone-racket')openEdit('racket',null,null,null,null,null,button.dataset.id);else if(action==='edit-racket')openEdit('racket',button.dataset.id);else if(action==='new-record')openEdit('record',button.dataset.id);else if(action==='delete-record')deleteRecord(button.dataset.id,button.dataset.record);else if(action==='saved-clear'){selected=[];baseline='';clearSavedBar();render();}else if(action==='saved-compare'){clearSavedBar();location.hash='/compare';}else if(action==='edit-record')openEdit('record',button.dataset.id,button.dataset.record);else if(action==='reuse-record')openEdit('record',button.dataset.id,null,null,null,button.dataset.record);
      else if(action==='register-pick'&&reg){reg.pick=button.dataset.model;reg.individual=null;reg.refresh();}
      else if(action==='register-new-model'&&reg){const name=reg.query.trim();stopVoice();activeEdit=null;dirty=false;reg=null;openEdit('racket',null,null,null,null,null,null,name);}
      else if(action==='restore-draft'&&restoredDraft)openEdit(restoredDraft.type,restoredDraft.racketId,restoredDraft.recordId,restoredDraft.values,restoredDraft);
      else if(action==='choose-records')openPicker();else if(action==='clear-compare'){selected=[];baseline='';render();}else if(action==='source-filter'){filters.source=button.dataset.source;filters.query='';render();}else if(action==='reset-filters'){filters={query:'',kind:'',state:'',sort:'recent',source:filters.source};render();}
    }
    const remove=event.target.closest('[data-remove]');if(remove){selected=selected.filter(i=>i.recordId!==remove.dataset.remove);render();}
    const base=event.target.closest('[data-baseline]');if(base){baseline=base.dataset.baseline;render();}
  });
  window.addEventListener('hashchange',()=>{clearSavedBar();if(dirty)storeDraft();if(activeEdit?.inline){stopVoice();document.querySelector('.hl-inline-row')?.remove();activeEdit=null;dirty=false;}render();main.focus();window.scrollTo(0,0);});
  window.addEventListener('beforeunload',event=>{if(dirty||saving){if(dirty)storeDraft();event.preventDefault();event.returnValue='';}});
  document.getElementById('account-button').addEventListener('click',()=>{if(saving)return;const logout=()=>C.logout().catch(error=>storageError(error.message));if(dirty)ask('ログアウトしますか？','入力はこのブラウザーの下書きに残します。同じアカウントで再開できます。','ログアウト',()=>{storeDraft();return logout();});else logout();});
  C.init(update=>{
    const oldUid=connection.user?.uid;
    if(oldUid&&oldUid!==update.user?.uid){if(dirty)storeDraft();stopVoice();document.querySelector('.hl-inline-row')?.remove();[editor,confirmDialog,backup,picker].forEach(n=>n.close());document.getElementById('editor-content').replaceChildren();activeEdit=null;dirty=false;selected=[];baseline='';hasLoaded=false;reports=[];collapsedRackets.clear();openDetail=null;newMark='';savedBar=null;document.getElementById('saved-bar')?.remove();filters={query:'',kind:'',state:'',sort:'recent',source:'personal'};Object.keys(historyBases).forEach(k=>delete historyBases[k]);}
    connection=update;if(oldUid!==update.user?.uid)readDraft();if(update.ready)hasLoaded=true;
    const status=document.getElementById('cloud-status');status.dataset.state=update.status;status.textContent=({loading:'接続確認中',connected:'サーバー接続済み',saving:'サーバーに保存中',offline:'サーバー未接続',error:'接続・保存エラー','signed-out':'ログインしてください'})[update.status]||'接続確認中';
    document.getElementById('backup-button').disabled=!hasLoaded||!update.user||saving;document.getElementById('account-button').hidden=!update.user;document.getElementById('account-button').title=update.user?.email||'';document.getElementById('account-email').textContent=update.user?.email||'Googleアカウントで共有';
    if(update.error)storageError(update.error);else if(update.ready&&!saving)document.getElementById('storage-error').hidden=true;
    window.RacketReportReader.read(update.user,(items,error)=>{reports=items;if(error)message(error,true);if(!activeEdit&&!saving&&hasLoaded)render();});
    if(!editor.open&&!activeEdit?.inline&&!confirmDialog.open&&!saving){state=update.data;render();}
  });
})();
