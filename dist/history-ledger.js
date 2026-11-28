(function(root){
  'use strict';
  const server=typeof module!=='undefined'&&module.exports,M=server?require('./model.js'):root.RacketLedgerModel,U=server?require('./workspace-ui.js'):root.RacketWorkspaceUI,V=server?require('./voice-input.js'):root.RacketVoiceInput;
  const E=U.esc,K=U.known,columns=[['sw','SW','kg·cm²'],['balance','BP','mm'],['tw','TW','kg·cm²'],['weight','重量','g'],['gripW','幅','mm'],['gripT','厚','mm']];
  const info=k=>{try{return JSON.parse(k.archive?.raw||'{}');}catch{return {};}};
  const title=k=>k.condition||info(k).condition||'条件名未記録';
  const sourceLabel=k=>({'tennis-db':'TENNISDB',racketpedia:'ラボ',chatgpt:'ChatGPT'})[k.source?.system]||'自分の記録';
  function order(records){return [...records].sort((a,b)=>{const x=info(a).sequence,y=info(b).sequence;if(x&&y)return x-y;if(x||y)return x?-1:1;return (a.date||'').localeCompare(b.date||'')||(a.createdAt||'').localeCompare(b.createdAt||'');});}
  const listColumns=[['string','弦',7],['grip','元／OG',11.5],['weights','加重',11],['sw','SW',11],['balance','BP (mm)',9.5],['tw','TW',9],['weight','重量 (g)',10.5],['rw','RW (計算)',10.5],['actions','',20]];
  const stringShort=k=>({bare:'なし',strung:'張上げ',ready:'張上げ',unknown:'未確認',other:'その他'})[k.state]||'—';
  const text=v=>typeof v==='string'&&v.trim()?v:'';
  const overgripShort=U.overgripShort;
  function weightsShort(k){return Object.hasOwn(k,'customParts')&&Array.isArray(k.customParts)?(k.customParts.length?'あり':'なし'):'—';}
  function rwShort(k){const v=M.recoilWeight(k);return typeof v==='number'&&Number.isFinite(v)?v.toFixed(1):'—';}
  const gramText=U.gramText,gaugeText=U.gaugeText;
  function weightsDetail(k){
    if(!Object.hasOwn(k,'customParts')||!Array.isArray(k.customParts))return '未記録';
    if(!k.customParts.length)return 'なし';
    const total=k.customParts.reduce((s,p)=>s+p.grams,0),own=k.customParts.map(p=>text(p.material)),same=own.every(m=>m&&m===own[0]),any=own.some(Boolean),material=any?(same?own[0]:''):text(k.customMaterial);
    return (material?material+' · ':'')+k.customParts.map(p=>`${p.position}${any&&!same&&text(p.material)?' '+p.material:''} ${gramText(p.grams)} g`).join(' + ')+` (計 ${gramText(total)} g)`;
  }
  function stringLines(k){
    if(k.state==='bare')return ['なし'];
    const line=(label,name,gauge,tension)=>{const head=[text(name),K(gauge)?gaugeText(gauge)+' mm':''].filter(Boolean).join(' · '),body=[head,K(tension)?tension+' '+(k.tensionUnit||''):''].filter(Boolean).join(' / ');return body?`${label}　${body.trim()}`:'';};
    const lines=[line('縦糸',k.stringMain,k.stringMainGauge,k.tensionMain),line('横糸',k.stringCross,k.stringCrossGauge,k.tensionCross)].filter(Boolean);
    return lines.length?lines:['未記録'];
  }
  function detailFrame(r,k){
    const name=[r.name,r.individual].filter(Boolean).join('　'),heading=`${name}${K(k.sw)?' · SW '+k.sw:''} の詳細`;
    const sub=[['記録日',k.date||'日付未記録'],['記録の種別',M.kinds[k.kind]],['条件の原表記',title(k)],['出典',sourceLabel(k)],['RA',k.ra],['グリップ幅 (mm)',k.gripW],['グリップ厚 (mm)',k.gripT],['グリップ補足',k.grip],['カスタム（記録の原文）',k.custom],['加重の素材（位置と量の記録なし）',!Object.hasOwn(k,'customParts')?k.customMaterial:''],['メモ',k.note],['音声・文章入力の原文',k.inputTranscript],['元資料',k.source?.path]].filter(([,v])=>K(v)&&v!=='');
    return `<section class="hl-detail-frame" data-hl-detail-frame="${E(r.id)}" data-record="${E(k.id)}" aria-label="${E(heading)}"><div class="hl-detail-head"><h3>${E(heading)}</h3><div class="hl-detail-actions">${!k.source?`<button type="button" class="button" data-action="edit-record" data-id="${E(r.id)}" data-record="${E(k.id)}">訂正</button>`:''}${!k.source?`<button type="button" class="button hl-delete-button" data-action="delete-record" data-id="${E(r.id)}" data-record="${E(k.id)}">削除</button>`:''}<button type="button" class="button" data-hl-detail-close>閉じる</button></div></div><div class="hl-detail-main"><div><div class="hl-detail-label">ストリング</div>${stringLines(k).map(l=>`<div>${E(l)}</div>`).join('')}</div><div class="hl-detail-side"><div><span class="hl-detail-label">元グリップ</span>　${E(text(k.baseGrip)||'未記録')}</div><div><span class="hl-detail-label">オーバーグリップ</span>　${E(text(k.overgrip)||'未記録')}</div>${text(k.gripSizeCustom)?`<div><span class="hl-detail-label">グリップサイズのカスタム</span>　${E(k.gripSizeCustom)}</div>`:''}<div><span class="hl-detail-label">加重</span>　${E(weightsDetail(k))}</div></div></div><dl class="hl-detail-sub">${sub.map(([n,v])=>`<div><dt>${E(n)}</dt><dd>${E(v)}</dd></div>`).join('')}</dl>${k.source?`<details><summary>出典の原文</summary><pre>${E(k.source.raw)}</pre></details>`:''}${k.archive?`<details><summary>施工資料・Excel原文</summary><pre>${E(k.archive.raw)}</pre></details>`:''}</section>`;
  }
  function rows(r,records,baseId,selected=[]){
    const base=records.find(k=>k.id===baseId)||records.find(k=>k.kind==='measured')||records[0];
    return records.map(k=>{
      const delta=key=>k!==base&&k.kind==='measured'&&base?.kind==='measured'?U.difference(k[key],base[key]):'',value=key=>`<td data-label="${({sw:'SW',balance:'BP (mm)',tw:'TW',weight:'重量 (g)'})[key]}"><span class="hl-value">${K(k[key])?E(k[key]):'<span class="hl-empty">記録なし</span>'}</span>${delta(key)?`<small class="hl-delta">${E(delta(key))}</small>`:''}</td>`;
      const baseGrip=text(k.baseGrip),og=overgripShort(k);
      return `<tr class="hl-record ${k===base?'is-base':''}" data-hl-record="${E(k.id)}" data-kind="${E(k.kind)}"><th scope="row" class="hl-string" data-label="弦">${E(stringShort(k))}${k===base?'<span class="hl-base-mark">基準</span>':''}</th><td class="hl-grip" data-label="元／OG"><span class="hl-grip-line"><span class="hl-grip-base" title="${E(baseGrip)}">${E(baseGrip||'—')}</span><span class="hl-grip-slash">/</span><span class="hl-grip-og" title="${E(text(k.overgrip))}">${E(og)}</span></span></td><td class="hl-weights" data-label="加重">${weightsShort(k)}</td>${['sw','balance','tw','weight'].map(value).join('')}<td class="hl-rw" data-label="RW (計算)"><span class="hl-value">${rwShort(k)}</span></td><td class="hl-actions" data-label=""><div class="hl-row-actions"><button type="button" class="text-button" data-action="reuse-record" data-id="${E(r.id)}" data-record="${E(k.id)}" aria-label="この条件で測る">測る</button><button type="button" class="hl-detail-button" data-hl-detail="${E(k.id)}" aria-pressed="false">詳細</button><label class="hl-check"><input type="checkbox" data-compare="${E(k.id)}" data-racket="${E(r.id)}" aria-label="${E([r.name,r.individual,title(k)].filter(Boolean).join(' '))}を比較" ${selected.some(i=>i.recordId===k.id)?'checked':''}>比較</label></div></td></tr>`;
    }).join('');
  }
  function group(r,selected,baseId,query=''){
    const q=query.toLocaleLowerCase(),all=order(r.records),identity=[r.name,r.maker,r.individual,r.note].join(' ').toLocaleLowerCase(),list=q&&!identity.includes(q)?all.filter(k=>JSON.stringify(k).toLocaleLowerCase().includes(q)):all;
    if(q&&!identity.includes(q)&&!list.length)return '';
    const base=list.find(k=>k.id===baseId)||list.find(k=>k.kind==='measured')||list[0],archive=info(r),foldId='hl-history-'+encodeURIComponent(r.id);
    return `<section class="hl-group" data-hl-group="${E(r.id)}"><header class="hl-group-head"><div><h2><button type="button" class="hl-fold-button" data-hl-toggle="${E(r.id)}" data-name="${E([r.name,r.individual].filter(Boolean).join(' '))}" aria-expanded="true" aria-controls="${E(foldId)}" aria-label="${E([r.name,r.individual].filter(Boolean).join(' '))}の測定履歴を閉じる"><span class="hl-fold-icon" data-hl-fold-icon aria-hidden="true">−</span><span>${E(r.name)}${r.individual?` <small>${E(r.individual)}</small>`:''}</span><span class="hl-fold-label" data-hl-fold-label>閉じる</span></button></h2><span>${list.length}${list.length!==all.length?'/'+all.length:''}件</span><details class="hl-filters hl-individual-menu"><summary>個体の操作</summary><div><button type="button" class="button" data-action="edit-racket" data-id="${E(r.id)}">名前・個体名を編集</button>${r.source?.system!=='racketpedia'?`<button type="button" class="button" data-action="clone-racket" data-id="${E(r.id)}">同じモデルをもう1本</button>`:''}</div></details></div><label>比べる元<select data-hl-base="${E(r.id)}" aria-label="${E(r.name)}の比較の基準">${list.map(k=>`<option value="${E(k.id)}" ${k===base?'selected':''}>${E(title(k))} · ${E(M.kinds[k.kind])}</option>`).join('')}</select></label><button type="button" class="hl-add-button" data-action="new-record" data-id="${E(r.id)}">測定を追加</button></header>
    <div id="${E(foldId)}" data-hl-content="${E(r.id)}"><div class="hl-table-wrap"><table class="hl-table"><colgroup>${listColumns.map(([key,,w])=>`<col class="hl-col-${key}" style="width:${w}%">`).join('')}</colgroup><thead><tr>${listColumns.map(([key,n])=>`<th scope="col" class="hl-th-${key}">${n||'<span class="sr-only">操作</span>'}</th>`).join('')}</tr></thead><tbody data-hl-body="${E(r.id)}">${rows(r,list,base?.id,selected)}</tbody></table></div>${!list.length?`<div class="hl-empty-state">測定記録はまだありません。<button class="button primary" data-action="new-record" data-id="${E(r.id)}">最初の測定を記録</button></div>`:''}<details class="hl-racket-source"><summary>ラケットの基本情報・元資料・施工メモ</summary><p>${E(r.note)}</p>${(archive.notes||[]).map(n=>`<p>${E(n)}</p>`).join('')}${archive.excelNote?`<p>${E(archive.excelNote)}</p>`:''}${U.sourcePanel(r)}${r.archive?`<details><summary>施工資料の全文</summary><pre>${E(r.archive.raw)}</pre></details>`:''}</details></div></section>`;
  }
  function reportsView(reports,data){
    const linked=new Set(data.rackets.flatMap(r=>r.records.map(k=>k.id))),pending=(reports||[]).filter(r=>!linked.has(r.id));
    if(!pending.length)return '';
    return `<section class="hl-group hl-reports"><header class="hl-group-head"><div><h2>チャットの測定報告</h2><span>個体未照合 ${pending.length}件</span></div></header>${pending.map(r=>`<article class="hl-report"><strong>${E(r.reportedName)}</strong><p>${E(r.condition)} · SW ${E(r.sw)} / BP ${K(r.balance)?E(r.balance):'記録なし'} / TW ${K(r.tw)?E(r.tw):'記録なし'}</p><details><summary>原文・分かっている条件</summary><p>${E(r.quote)}</p><p>${E(r.uncertainties)}</p><a href="${E(r.url)}" target="_blank" rel="noopener">元チャットを開く</a><p>会話日：${E(r.conversationDate)}（測定日としては扱いません）</p></details><details><summary>この報告の個体を指定する</summary><label>保存先の一本<select data-hl-report-target="${E(r.id)}"><option value="">選んでください</option>${data.rackets.filter(k=>k.source?.system!=='racketpedia').map(k=>`<option value="${E(k.id)}">${E(k.name+' '+k.individual)}</option>`).join('')}</select></label><button class="button" data-hl-link-report="${E(r.id)}">この一本の過去の測定として追加</button><p>元の数値を更新せず、日付未記録の別測定として追加します。</p></details></article>`).join('')}</section>`;
  }
  function overview(data,selected,filters,draft,bases={},reports=[]){
    const groupName=filters.source||'personal',scoped=data.rackets.filter(r=>groupName==='all'||(r.source?.system==='racketpedia'?'lab':'personal')===groupName),options=scoped.map(r=>`<option value="${E(r.id)}" ${filters.racket===r.id?'selected':''}>${E(r.name+' '+r.individual)}</option>`).join('');
    return `<div class="history-ledger" data-size="${E(filters.size||'normal')}"><header class="hl-heading"><h1>測定・カスタム履歴</h1><div><button class="button" data-action="new-racket">ラケットを登録</button><button class="button primary" data-action="start-measurement">測定を追加</button></div></header>${draft?'<div class="draft-banner"><span>入力途中の下書きがあります</span><button class="text-button" data-action="restore-draft">入力を再開</button></div>':''}<div class="hl-controls"><label>ラケット<select id="hl-racket"><option value="">すべての一本</option>${options}</select></label><label>文字<select id="hl-size">${[['normal','標準'],['large','大きく'],['xlarge','特大']].map(([v,n])=>`<option value="${v}" ${filters.size===v?'selected':''}>${n}</option>`).join('')}</select></label><details class="hl-filters"><summary>データ元</summary><div><label>表示<select id="hl-source">${[['personal','自分のラケット'],['lab','ラボデータ'],['all','すべて']].map(([v,n])=>`<option value="${v}" ${groupName===v?'selected':''}>${n}</option>`).join('')}</select></label></div></details><div class="hl-search-tools"><label class="hl-search"><span class="sr-only">ラケット名・個体名・条件を検索</span><input id="search" type="search" aria-label="ラケット名・個体名・条件を検索" value="${E(filters.query||'')}" placeholder="ラケット名・個体名・条件を検索"></label><div class="hl-fold-actions" role="group" aria-label="履歴の表示"><button type="button" class="button" data-action="collapse-all">すべて閉じる</button><button type="button" class="button" data-action="expand-all">すべて開く</button></div></div></div><div id="overview-results">${results(data,selected,filters,bases)}${groupName!=='lab'?reportsView(reports,data):''}</div></div>`;
  }
  function results(data,selected,filters,bases={}){
    const html=data.rackets.filter(r=>(!filters.racket||r.id===filters.racket)&&(!filters.source||filters.source==='all'||(r.source?.system==='racketpedia'?'lab':'personal')===filters.source)).map(r=>group(r,selected,bases[r.id],filters.query)).join('');
    return html||'<div class="hl-empty-state">該当する履歴はありません。ラケット名だけでも登録できます。</div>';
  }
  const dial=[[1,177,14],[2,217,51],[3,232,103],[4,217,154],[5,177,192],[6,122,206],[7,67,192],[8,27,155],[9,12,103],[10,27,51],[11,67,14],[12,122,0]];
  const fixedPlaces=['スロート','グリップの下','グリップエンド'];
  const cross='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>';
  function candidates(data,key){
    const seen=new Set(),out=[];
    for(const k of M.sorted((data.rackets||[]).flatMap(r=>r.records))){const v=k[key];if(typeof v!=='string'||!v.trim()||seen.has(v))continue;seen.add(v);out.push(v);if(out.length===5)break;}
    return out;
  }
  function partRow(part){
    const free=!String(part.position||'').trim(),label=free?'位置':part.position;
    return `<div class="hl-f-part" data-part ${free?'':`data-position="${E(part.position)}"`}>${free?`<input class="hl-f-pos" data-part-pos aria-label="位置" placeholder="位置" maxlength="100">`:`<span class="hl-f-pos">${E(part.position)}</span>`}<input class="hl-f-mat" data-part-material aria-label="${E(label)}の素材" placeholder="素材" maxlength="100" value="${E(part.material||'')}"><input class="hl-f-num hl-f-gram" data-part-grams inputmode="decimal" aria-label="${E(label)}の量 g" value="${E(typeof part.grams==='number'?gramText(part.grams):'')}"><span>g</span><button type="button" data-part-remove aria-label="${E(label)}を外す">${cross}</button></div>`;
  }
  function partsState(data,existing,restored){
    let fromJson=null;
    if(typeof data.customPartsJson==='string'&&data.customPartsJson.trim()){try{const p=JSON.parse(data.customPartsJson);if(Array.isArray(p))fromJson=p;}catch{}}
    const base=existing||data,rows=fromJson||(Array.isArray(base.customParts)?base.customParts:[]);
    return {rows,touched:Boolean(fromJson)||(!existing&&!restored&&Array.isArray(data.customParts))};
  }
  const seg=(name,value,items,label)=>`<div class="hl-f-seg" role="group" aria-label="${E(label)}">${items.map(([v,n])=>`<button type="button" data-seg="${name}" data-values="${E(v.join(' '))}" aria-pressed="${v.includes(value)}">${n}</button>`).join('')}</div>`;
  function numInput(key,label,data,placeholder=''){return `<label class="hl-f-field"><span class="hl-f-lbl">${E(label)}</span><input name="${key}" class="hl-f-num" aria-label="${E(label)}" type="number" min="0" max="10000" step="any" inputmode="decimal" value="${E(data[key]??'')}" placeholder="${E(placeholder)}"></label>`;}
  function textInput(key,label,data,extra=''){return `<label class="hl-f-field"><span class="hl-f-lbl">${E(label)}</span><input name="${key}" aria-label="${E(label)}" maxlength="20000" value="${E(data[key]??'')}" ${extra}></label>`;}
  function chips(key,list){return list.length?`<div class="hl-f-chips">${list.map(v=>`<button type="button" class="hl-f-chip" data-hl-set="${key}" data-value="${E(v)}">${E(v)}</button>`).join('')}</div>`:'';}
  function summaryLine(k){
    const string=({bare:'弦なし',strung:'弦 張上げ',ready:'弦 張上げ',unknown:'弦 未確認',other:'弦 その他'})[k.state]||'弦 —',parts=Array.isArray(k.customParts)?(k.customParts.length?'加重 計 '+gramText(k.customParts.reduce((s,p)=>s+(Number(p.grams)||0),0))+' g':'加重なし'):'加重 未記録';
    return [string,(text(k.baseGrip)||'—')+'/'+overgripShort(k),parts].join(' · ');
  }
  function inlineForm(r,source,existing,restored,all){
    const F=server?require('./workspace-forms.js'):root.RacketWorkspaceForms,first=!existing&&!restored&&!source;
    let data=restored||existing||F.nextRecord(source);if(first)data={...data,state:'bare',overgrip:'なし'};
    const heads=existing?'記録を訂正':source?'測定を追加':'加工前を測る',pool=all||{rackets:[r]},parts=partsState(data,existing,restored),kind=data.kind||'measured',state=data.state||'unknown';
    const prev=key=>!existing&&source&&K(source[key])&&source[key]!==''?'前回 '+source[key]:'';
    const strungOpen=['strung','ready'].includes(state),label=existing?'訂正を保存':source?'保存して比較':'保存',total=parts.rows.reduce((s,p)=>s+(Number(p.grams)||0),0);
    const left=existing||first?`<div class="hl-f-card-head"><h2>${E(r.individual||r.name)}</h2><span>履歴 ${r.records.length}件${first?' · これが初回':''}</span></div>`:`<div class="hl-f-card-head"><h2>引き継ぎ元</h2><span>${E(source.date?source.date.replaceAll('-','/'):'日付未記録')} · ${E(title(source))}</span></div><div class="hl-f-prev">${[['sw','SW'],['balance','BP'],['tw','TW'],['weight','重量']].map(([k,n])=>`<div><div class="hl-f-lbl">${n}</div><div class="hl-f-prev-v">${K(source[k])&&source[k]!==''?E(source[k]):'—'}</div></div>`).join('')}</div><div class="hl-f-sub">${E(summaryLine(source))}</div>`;
    const kindNote=['measured','catalog','other'].includes(kind)?'':`現在の種別：${E(M.kinds[kind]||kind)}（押さない限り変わりません）`;
    return `<td colspan="9"><form id="edit-form" class="hl-inline-form hl-f" data-prev-sw="${E(!existing&&source&&typeof source.sw==='number'?source.sw:'')}" data-parts-touched="${parts.touched}" data-mode="point"><div class="hl-editor-head"><strong>${heads} · ${E([r.name,r.individual].filter(Boolean).join(' · '))}</strong></div><div id="form-error" class="notice error" role="alert" hidden></div>
<div class="hl-f-grid"><div class="hl-f-col"><aside class="hl-f-card hl-f-aside">${left}<div class="hl-f-block"><span class="hl-f-lbl">記録の種別</span>${seg('kind',kind,[[['measured'],'実測'],[['catalog'],'公称値'],[['other'],'その他']],'記録の種別')}<small class="hl-f-note" data-kind-note ${kindNote?'':'hidden'}>${kindNote}</small></div></aside>
<section class="hl-f-card hl-f-weights" aria-label="加重"><div class="hl-f-card-head"><h2>加重</h2><span class="hl-f-total ${parts.rows.length?'has':''}" data-parts-total>計 ${total?gramText(total):'0'} g</span><div class="hl-f-seg hl-f-mode" role="group" aria-label="置き方"><button type="button" data-mode-set="point" aria-pressed="true">点</button><button type="button" data-mode-set="range" aria-pressed="false">範囲</button></div></div>
<div class="hl-f-dial"><svg width="288" height="250" viewBox="0 0 288 250" aria-hidden="true"><ellipse cx="144" cy="125" rx="110" ry="103" fill="none" stroke="#DADCE0" stroke-width="10"></ellipse><text x="144" y="130" text-anchor="middle" font-size="12" fill="#5F6368">フェイス</text></svg>${dial.map(([n,x,y])=>`<button type="button" class="hl-f-dot" data-dial="${n}" aria-label="${n}時" aria-pressed="false" style="left:calc(${x}*var(--du));top:calc(${y}*var(--du))">${n}</button>`).join('')}</div>
<div class="hl-f-places">${fixedPlaces.map(n=>`<button type="button" data-place="${n}" aria-pressed="false">${n}</button>`).join('')}<button type="button" data-place-free>その他</button></div>
<button type="button" class="hl-f-none" data-parts-none aria-pressed="${parts.touched&&!parts.rows.length}" ${parts.rows.length?'hidden':''}>なし</button><div class="hl-f-parts" data-parts-list>${parts.rows.map(partRow).join('')}</div><input type="hidden" data-parts-json ${parts.touched?'name="customPartsJson"':''} value="${E(JSON.stringify(parts.rows.map(p=>({position:p.position,grams:p.grams,...(p.material?{material:p.material}:{})}))))}"><p class="hl-f-help">文字盤の数字を押すと追加。範囲は始めと終わりを押す (例 2〜4時)</p></section></div>
<div class="hl-f-col">${V.controls(false,data.voiceDraft||'').replace('class="capture-voice"','class="capture-voice hl-f-card hl-f-voice"')}
<section class="hl-f-card"><div class="hl-f-card-head"><h2>測定値</h2><span class="hl-f-tag">${existing?'訂正':source?'今回測る':'初回'}</span></div><div class="hl-f-five">${[['sw','SW'],['balance','BP (mm)'],['tw','TW'],['weight','重量 (g)']].map(([k,n])=>numInput(k,n,data,prev(k))).join('')}<div class="hl-f-field"><span class="hl-f-lbl">RW (計算)</span><div class="hl-f-rw" data-rw>自動計算</div></div></div><div class="hl-f-diff" data-sw-diff></div></section>
<section class="hl-f-card"><div class="hl-f-card-head"><h2>条件</h2>${existing?'':`<span class="hl-f-tag">${source?'前回から引き継ぎ':'初回の既定値'}</span>`}</div><div class="hl-f-cond"><div class="hl-f-field"><span class="hl-f-lbl">弦</span>${seg('state',state,[[['bare'],'なし'],[['strung','ready'],'張上げ']],'弦')}</div><div class="hl-f-field hl-f-grip">${textInput('baseGrip','元グリップ',data)}${chips('baseGrip',candidates(pool,'baseGrip'))}</div><div class="hl-f-field hl-f-grip">${textInput('overgrip','オーバーグリップ',data,'placeholder="巻いていない時は「なし」"')}${chips('overgrip',candidates(pool,'overgrip'))}${textInput('gripSizeCustom','グリップサイズのカスタム',data)}</div></div>
<div class="hl-f-strings" data-hl-strings ${strungOpen?'':'hidden'}>${[['Main','縦糸'],['Cross','横糸']].map(([s,n])=>`<div class="hl-f-string"><span class="hl-f-lbl">${n}</span>${textInput('string'+s,'銘柄（'+n+'）',data)}${numInput('string'+s+'Gauge','太さ mm（'+n+'）',data)}${numInput('tension'+s,'テンション（'+n+'）',data)}</div>`).join('')}<label class="hl-f-field"><span class="hl-f-lbl">テンション単位</span><select name="tensionUnit" aria-label="テンション単位"><option value="lb" ${data.tensionUnit==='lb'?'selected':''}>lb</option><option value="kg" ${data.tensionUnit==='kg'?'selected':''}>kg</option></select></label></div></section></div></div>
<details class="hl-form-extra"><summary>その他の項目</summary><div class="hl-extra-grid">${textInput('condition','条件名（空欄なら自動）',data)}<label class="hl-f-field"><span class="hl-f-lbl">記録日</span><input type="date" name="date" aria-label="記録日" required value="${E(data.date||'')}"></label>${textInput('custom','カスタム（記録の原文）',data)}${textInput('grip','旧グリップ記述・補足',data)}${numInput('ra','RA',data)}${numInput('gripW','グリップ幅 (mm)',data)}${numInput('gripT','グリップ厚 (mm)',data)}<label class="hl-f-field"><span class="hl-f-lbl">測定メモ</span><textarea name="note" aria-label="測定メモ" maxlength="20000">${E(data.note||'')}</textarea></label></div></details><input type="hidden" name="kind" value="${E(kind)}"><input type="hidden" name="state" value="${E(state)}"><input type="hidden" name="inputTranscript" value="${E(data.inputTranscript||'')}"><div class="hl-editor-actions"><span id="draft-status">保存前の入力は下書きに保持</span><button class="button" type="button" id="cancel-edit">キャンセル</button><button class="button primary" type="submit" data-label="${label}">${label}</button></div></form></td>`;
  }
  function bind(form){
    const list=form.querySelector('[data-parts-list]'),json=form.querySelector('[data-parts-json]'),none=form.querySelector('[data-parts-none]'),totalNode=form.querySelector('[data-parts-total]');
    let start=null;
    const rowsNow=()=>[...list.querySelectorAll('[data-part]')],posOf=row=>row.querySelector('[data-part-pos]')?.value??row.dataset.position,touched=()=>form.dataset.partsTouched==='true';
    const readParts=()=>rowsNow().map(row=>{const g=row.querySelector('[data-part-grams]').value.trim(),m=row.querySelector('[data-part-material]').value,p={position:posOf(row),grams:g===''||!Number.isFinite(Number(g))?'':Number(g)};if(m.trim())p.material=m;return p;});
    const num=name=>{const v=form.elements.namedItem(name)?.value??'';return v.trim()===''?'':Number(v);};
    function refresh(){
      const parts=readParts(),sum=parts.reduce((s,p)=>s+(typeof p.grams==='number'?p.grams:0),0);
      if(touched())json.name='customPartsJson';else json.removeAttribute('name');json.value=JSON.stringify(parts);
      totalNode.textContent='計 '+(sum?gramText(sum):'0')+' g';totalNode.classList.toggle('has',parts.length>0);
      none.hidden=parts.length>0;none.setAttribute('aria-pressed',String(touched()&&!parts.length));
      const names=new Set(parts.map(p=>p.position));
      form.querySelectorAll('[data-dial]').forEach(b=>b.setAttribute('aria-pressed',String(names.has(b.dataset.dial+'時')||start===b.dataset.dial)));
      form.querySelectorAll('[data-place]').forEach(b=>b.setAttribute('aria-pressed',String(names.has(b.dataset.place))));
    }
    function syncOthers(){
      form.querySelectorAll('[data-seg]').forEach(b=>{const field=form.elements.namedItem(b.dataset.seg);b.setAttribute('aria-pressed',String(b.dataset.values.split(' ').includes(field.value)));});
      const kind=form.elements.namedItem('kind').value,note=form.querySelector('[data-kind-note]');
      if(note){const known=['measured','catalog','other'].includes(kind);note.hidden=known;if(!known)note.textContent='現在の種別：'+(M.kinds[kind]||kind)+'（押さない限り変わりません）';}
      const strings=form.querySelector('[data-hl-strings]');if(strings)strings.hidden=!['strung','ready'].includes(form.elements.namedItem('state').value);
      const rw=M.recoilWeight({sw:num('sw'),weight:num('weight'),balance:num('balance')}),box=form.querySelector('[data-rw]'),ok=typeof rw==='number'&&Number.isFinite(rw);
      box.textContent=ok?rw.toFixed(1):'自動計算';box.classList.toggle('has',ok);
      const prev=form.dataset.prevSw===''?'':Number(form.dataset.prevSw),d=U.difference(num('sw'),prev);form.querySelector('[data-sw-diff]').textContent=d?'SW 前回比 '+d:'';
    }
    const changed=()=>{refresh();syncOthers();form.dispatchEvent(new Event('change',{bubbles:true}));};
    const touch=()=>{form.dataset.partsTouched='true';};
    function add(part,focus){if(part.position&&rowsNow().some(row=>posOf(row)===part.position))return;list.insertAdjacentHTML('beforeend',partRow(part));touch();changed();list.lastElementChild.querySelector(focus||'[data-part-grams]').focus({preventScroll:true});}
    function toggle(position){const row=rowsNow().find(r=>r.dataset.position===position);if(row){row.remove();touch();changed();}else add({position,grams:''});}
    form.addEventListener('racket-add-parts',event=>{
      let added=0;
      for(const part of event.detail.parts){if(part.position&&rowsNow().some(row=>posOf(row)===part.position))continue;list.insertAdjacentHTML('beforeend',partRow(part));list.lastElementChild.dataset.voiceChanged='true';added++;}
      if(added){touch();refresh();}
      event.detail.added=added;event.detail.skipped=event.detail.parts.length-added;
    });
    form.addEventListener('input',event=>{if(event.target.closest('[data-parts-list]')){touch();refresh();}syncOthers();});
    form.addEventListener('change',()=>{refresh();syncOthers();});
    form.addEventListener('click',event=>{
      const t=event.target.closest('button');if(!t||!form.contains(t))return;
      if(t.dataset.seg){const field=form.elements.namedItem(t.dataset.seg),values=t.dataset.values.split(' ');if(!values.includes(field.value))field.value=values[0];changed();}
      else if(t.dataset.modeSet){form.dataset.mode=t.dataset.modeSet;start=null;form.querySelectorAll('[data-mode-set]').forEach(b=>b.setAttribute('aria-pressed',String(b===t)));refresh();}
      else if(t.dataset.dial){
        const n=t.dataset.dial;
        if(form.dataset.mode==='range'){if(start===null){start=n;refresh();}else{const a=start,position=a===n?a+'時':a+'〜'+n+'時';start=null;if(rowsNow().some(row=>posOf(row)===position))refresh();else add({position,grams:''});}}
        else toggle(n+'時');
      }
      else if(t.dataset.place)toggle(t.dataset.place);
      else if(t.hasAttribute('data-place-free'))add({position:'',grams:''},'[data-part-pos]');
      else if(t.hasAttribute('data-parts-none')){list.replaceChildren();touch();changed();}
      else if(t.hasAttribute('data-part-remove')){t.closest('[data-part]').remove();touch();changed();}
    });
    refresh();syncOthers();
  }
  function conditionName(v){return [v.state&&v.state!=='unknown'?M.states[v.state]:'',v.baseGrip,v.overgrip?'OG '+v.overgrip:'',v.custom].filter(Boolean).join(' ／ ');}
  function linkedReport(report,racketId,data){
    if(!racketId)throw Error('この報告を測った一本を選んでください。');
    if(data.rackets.some(r=>r.records.some(k=>k.id===report.id)))throw Error('この報告はすでに追加されています。');
    const next=structuredClone(data),r=next.rackets.find(k=>k.id===racketId);if(!r||r.source?.system==='racketpedia')throw Error('本人の個体を選んでください。');
    const k={id:report.id,date:'',createdAt:'',kind:'measured',state:'ready',condition:report.condition,baseGrip:report.baseGrip||'',overgrip:'あり（品名未記録）',custom:report.custom||'',note:report.uncertainties,source:{system:'chatgpt',key:report.id,path:report.url,raw:JSON.stringify(report),importedAt:new Date().toISOString(),current:false}};
    for(const [key] of columns)k[key]=report[key]??'';Object.assign(k,{tensionUnit:'lb',tensionMain:'',tensionCross:''});r.records.push(k);return M.validate(next);
  }
  const api={columns,listColumns,detailFrame,rows,group,overview,results,reportsView,inlineForm,bind,candidates,conditionName,linkedReport,order,title};if(server)module.exports=api;else root.RacketHistoryLedger=Object.freeze(api);
})(typeof globalThis!=='undefined'?globalThis:this);
