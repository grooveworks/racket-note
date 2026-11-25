(function(root) {
  'use strict';
  const server=typeof module!=='undefined'&&module.exports;
  const M=server?require('./model.js'):root.RacketLedgerModel,U=server?require('./workspace-ui.js'):root.RacketWorkspaceUI;
  const E=U.esc;
  const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const recordKeys=['date','kind','state','condition','stringMain','stringCross','tensionUnit','grip','baseGrip','overgrip','custom','note',...M.recordNumbers];
  const racketKeys=['name','maker','individual','face','pattern','length','gripSize'];
  const modelKey=name=>String(name||'').normalize('NFKC').replace(/\s+/g,'').toLocaleLowerCase();
  function newRacketValues(data,sourceId){
    const source=data.rackets.find(r=>r.id===sourceId),same=data.rackets.filter(r=>modelKey(r.name)===modelKey(source?.name));
    const used=new Set(same.map(r=>r.individual||'1号機'));let n=source?2:1;while(used.has(n+'号機'))n++;
    return {...nextRecord(),...Object.fromEntries(racketKeys.filter(k=>k!=='individual').map(k=>[k,source?.[k]||''])),individual:n+'号機',racketNote:''};
  }
  function nextRecord(source) {return {date:today(),kind:'measured',state:source?.state||'unknown',condition:'',stringMain:source?.stringMain||'',stringCross:source?.stringCross||'',tensionMain:source?.tensionMain??'',tensionCross:source?.tensionCross??'',tensionUnit:source?.tensionUnit||'lb',grip:source?.grip||'',baseGrip:source?.baseGrip||'',overgrip:source?.overgrip||'',custom:source?.custom||''};}
  function hasRecord(values) {return M.recordNumbers.some(k=>U.known(values[k])&&String(values[k]).trim()!=='')||['condition','stringMain','stringCross','grip','baseGrip','overgrip','custom','note'].some(k=>String(values[k]||'').trim())||(values.state&&values.state!=='unknown')||(values.kind&&values.kind!=='measured');}
  function measurement(values,id,createdAt) {
    const record={id,createdAt};recordKeys.forEach(k=>record[k]=values[k]??'');
    if(values.inputTranscript)record.inputTranscript=String(values.inputTranscript);
    M.recordNumbers.forEach(k=>record[k]=String(values[k]??'').trim()===''?'':Number(values[k]));
    if(record.state==='bare'){record.stringMain='';record.stringCross='';record.tensionMain='';record.tensionCross='';}
    return record;
  }
  function buildChange(meta,values) {
    const next=structuredClone(meta.base),r=next.rackets.find(r=>r.id===meta.racketId);
    if(meta.type==='racket') {
      const info={...(r||{id:meta.targetId,records:[],createdAt:meta.createdAt}),updatedAt:meta.createdAt};
      racketKeys.forEach(k=>info[k]=String(values[k]??'').trim());info.note=values.racketNote??values.note??'';
      if(!info.name)throw Error('ラケット名を入力してください。');
      const same=next.rackets.filter(k=>k.id!==info.id&&modelKey(k.name)===modelKey(info.name));
      if(same.length&&!info.individual)throw Error('同じモデルが登録されています。区別できる個体名を入力してください。');
      if(info.individual&&same.some(k=>modelKey(k.individual||'1号機')===modelKey(info.individual)))throw Error('同じモデルでその個体名は使用済みです。別の個体名にしてください。');
      const original=next.rackets.find(k=>k.id===meta.cloneFromId);if(!r&&original&&!original.individual&&modelKey(original.name)===modelKey(info.name))original.individual='1号機';
      if(!r&&hasRecord(values))info.records.push(measurement(values,meta.initialRecordId,meta.createdAt));
      if(r)next.rackets[next.rackets.indexOf(r)]=info;else next.rackets.push(info);
    } else {
      if(!r)throw Error('保存先のラケットが見つかりません。');
      const old=r.records.find(k=>k.id===meta.recordId);
      if(!old&&!hasRecord(values))throw Error('数値か、弦・グリップなどの測定条件を1つ以上入力してください。');
      const k=measurement(values,meta.targetId,old?.createdAt||meta.createdAt);
      if(old)r.records[r.records.indexOf(old)]=k;else r.records.push(k);
    }
    return M.validate(next);
  }
  function input(key,label,data,{unit='',full=false,required=false,type='text',placeholder=''}={}) {return `<label class="field ${full?'full':''}"><span>${label}${required?'<b class="required">必須</b>':''}</span><span class="input-wrap"><input name="${key}" aria-label="${E(label)}" type="${type}" value="${E(data[key]??'')}" ${required?'required':''} ${type==='number'?'min="0" max="10000" step="any" inputmode="decimal"':'maxlength="250"'} placeholder="${E(placeholder)}">${unit?`<span class="input-unit">${unit}</span>`:''}</span></label>`;}
  function area(key,label,data,placeholder='') {return `<label class="field full"><span>${label}</span><textarea name="${key}" aria-label="${E(label)}" maxlength="20000" rows="3" placeholder="${E(placeholder)}">${E(data[key]||'')}</textarea></label>`;}
  function select(key,label,data,options) {return `<label class="field"><span>${label}</span><select name="${key}" aria-label="${E(label)}">${Object.entries(options).map(([optionKey,optionLabel])=>`<option value="${optionKey}" ${optionKey===data[key]?'selected':''}>${optionLabel}</option>`).join('')}</select></label>`;}
  function recordForm(data,isInitial) {
    return `<section class="form-section"><div class="form-section-heading"><h3>${isInitial?'最初の測定':'今回の測定'}</h3><span>測った項目だけ入力</span></div><div class="measurement-inputs measurement-primary">${[['sw','SW','kg·cm²'],['balance','BP','mm'],['tw','TW','kg·cm²']].map(([k,n,u])=>input(k,n,data,{type:'number',unit:u})).join('')}</div><div class="form-grid measurement-note">${input('date','記録日',data,{type:'date',required:true})}${input('condition','今回の変更・条件名',data,{placeholder:'例：元グリップをレザーへ交換'})}</div></section>
      <section class="form-section setup-inputs" aria-label="測定時のセッティング"><div class="form-section-heading"><h3>測定時のセッティング</h3><span>この状態と数値をセットで保存</span></div><div class="form-grid"><div class="full">${select('state','ストリングの状態',data,{unknown:'未確認',bare:M.states.bare,strung:M.states.strung,ready:'張り上がり＋OG（旧区分）',other:'その他'})}</div>${input('baseGrip','元グリップ',data,{placeholder:'純正／レザーの品名など'})}${input('overgrip','オーバーグリップ',data,{placeholder:'なし／品名・巻き数'})}${area('custom','鉛・加重（位置と量）',data,'例：3時・9時に各1g、グリップ内に2g／なし')}</div><p class="view-note">加重は調整後の全配置を記入。外したら「なし」。空欄は未記録です。</p><p class="view-note" data-string-empty ${data.state==='bare'?'':'hidden'}>ストリングなしの記録には、弦名・テンションを残しません。</p></section>
      <details class="form-details" data-string-fields ${data.state==='bare'?'hidden':''}><summary>弦名・テンション</summary><div class="form-grid">${input('stringMain','縦糸',data,{full:true,placeholder:'名称・ゲージ'})}${input('stringCross','横糸',data,{full:true,placeholder:'同じ弦でも、分かる場合は記録'})}${input('tensionMain','縦テンション',data,{type:'number'})}${input('tensionCross','横テンション',data,{type:'number'})}${select('tensionUnit','テンション単位',data,{lb:'lb',kg:'kg'})}</div></details><details class="form-details"><summary>重量・測定種別・グリップ補足</summary><div class="form-grid">${input('weight','重量',data,{type:'number',unit:'g'})}${select('kind','記録種別',data,M.kinds)}${input('grip','グリップの旧記述・補足',data,{full:true,placeholder:'以前の記録は原文のまま保持'})}</div></details><details class="form-details"><summary>RA・グリップ寸法</summary><div class="form-grid">${input('ra','RA',data,{type:'number'})}${input('gripW','グリップ幅',data,{type:'number',unit:'mm'})}${input('gripT','グリップ厚',data,{type:'number',unit:'mm'})}</div></details><div class="form-grid measurement-note">${area('note','測定メモ',data,'測定機・方法、気づいたことなど（任意）')}</div>`;
  }
  function form(meta,racket,existing,source,restored) {
    let data=restored||(meta.type==='racket'?(racket?{...racket,racketNote:racket.note||''}:newRacketValues(meta.base,meta.cloneFromId)):existing||nextRecord(source));
    // Old drafts used note for a racket memo and contained no initial-measurement fields.
    if(meta.type==='racket'&&restored&&!Object.hasOwn(restored,'racketNote'))data={...data,racketNote:restored.note||'',...(!racket?nextRecord():{}),note:''};
    let content='';
    if(meta.type==='racket')content=`<section class="form-section identity-section"><div class="form-grid">${input('name','ラケット名',data,{required:true,full:true,placeholder:'モデル名・年式、仮の名前でも可'})}${input('individual','個体名（1号機・2号機・目印など）',data,{full:true,placeholder:'例：2号機・青テープ・シリアル末尾1234'})}</div><p class="identity-help">${racket?`名前や個体名を直しても、測定・カスタム履歴 ${racket.records.length} 件はそのまま残ります。`:'名前だけで登録できます。名前・個体名は後から訂正できます。'}</p></section><details class="form-details"><summary>メーカー・基本情報・メモ（任意）</summary><div class="form-grid">${input('maker','メーカー',data,{full:true})}${input('face','フェイス',data,{unit:'in²'})}${input('pattern','ストリングパターン',data,{placeholder:'例：16×19'})}${input('length','長さ',data,{placeholder:'例：27 inch'})}${input('gripSize','グリップサイズ',data,{placeholder:'例：G2'})}${area('racketNote','ラケットメモ',data,'役割・使用感・個体について')}</div></details>`+(!racket?`<details class="form-details initial-measurement" ${hasRecord(data)?'open':''}><summary>最初の測定も一緒に入力（任意）</summary>${recordForm(data,true)}</details>`:'');
    else content=`<div class="form-racket-label">${E(racket.name)} <small>${E(racket.individual)}</small></div>${!existing&&source&&!restored?`<div class="inline-info">${E(source.date||'日付未記録')}${source.condition?'「'+E(source.condition)+'」':''}の条件を引き継ぎます。今回の数値と変更内容は空欄です。</div>`:''}${recordForm(data,false)}`;
    return `<form id="edit-form"><div class="dialog-body"><div id="form-error" class="notice error" role="alert" hidden></div>${restored?'<div class="inline-info">入力途中の下書きを復元しました。</div>':''}${content}</div><div class="form-actions"><span id="draft-status" class="draft-status">保存前の入力はこのブラウザーに下書き保存</span><div>${racket&&(meta.type==='racket'||existing)?'<button type="button" class="button danger subtle" id="delete-item">削除</button>':''}<button class="button" type="button" id="cancel-edit">キャンセル</button><button class="button primary" type="submit">${meta.type==='racket'&&!racket?'登録する':'保存する'}</button></div></div></form>`;
  }
  const api={today,nextRecord,newRacketValues,hasRecord,measurement,buildChange,form};if(server)module.exports=api;else root.RacketWorkspaceForms=Object.freeze(api);
})(typeof globalThis!=='undefined'?globalThis:this);
