(function(root) {
  'use strict';
  const M = typeof module !== 'undefined' && module.exports ? require('./model.js') : root.RacketLedgerModel;
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const known = v => v !== '' && v !== undefined && v !== null;
  const fmt = v => known(v) ? esc(v) : '—';
  const route = id => '#/racket/' + encodeURIComponent(id);
  const date = v => v ? esc(v.replaceAll('-','/')) : '日付未記録';
  const sourceName = item => item?.source?.system === 'racketpedia' ? 'Racketpedia' : item?.source?.system === 'tennis-db' ? 'Tennis DB' : item?.source?.system === 'chatgpt' ? 'ChatGPTの本人報告' : 'このアプリの記録';
  const sourceCategory = racket => racket.source?.system === 'racketpedia' ? 'lab' : 'personal';
  const original = item => {try{return JSON.parse(item?.source?.raw||'{}');}catch{return {};}};
  const shortState = r => r?.state === 'ready' ? '張り上がり＋OG' : M.states[r?.state] || '状態未確認';
  const badge = r => `<span class="badge ${esc(r.kind)}">${M.kinds[r.kind]}</span>`;
  const metrics = [['sw','SW','kg·cm²'],['balance','BP','mm'],['tw','TW','kg·cm²']];
  const glyph = '<svg viewBox="0 0 36 36" fill="none" aria-hidden="true"><ellipse cx="22" cy="12" rx="8" ry="10" transform="rotate(35 22 12)" stroke="currentColor" stroke-width="2"/><path d="M16 20L5 34M20 4L29 15M16 9L26 21M16 17L26 4M19 21L30 9" stroke="currentColor" stroke-width="1.4"/></svg>';
  const label = (r,k) => [r.name,r.individual,k?.date,k?.condition].filter(Boolean).join(' ');
  const chosen = (items,id) => items.some(i=>i.recordId === id);
  const text = v => typeof v === 'string' && v.trim() ? v : '';
  function overgripShort(k) {const v = text(k.overgrip); if (!v) return k.state === 'ready' ? 'あり' : '—'; return /^なし/.test(v.trim()) ? 'なし' : 'あり';}
  const gramText = g => Number.isInteger(Math.round(g*1000)/1000*10) ? (Math.round(g*1000)/1000).toFixed(1) : String(Math.round(g*1000)/1000);
  const gaugeText = g => {const t = String(g); return (t.split('.')[1]||'').length >= 2 ? t : Number(g).toFixed(2);};
  const check = (r,k,items) => k ? `<label class="record-check"><input type="checkbox" data-compare="${esc(k.id)}" data-racket="${esc(r.id)}" aria-label="${esc(label(r,k))}を比較" ${chosen(items,k.id)?'checked':''}><span>比較</span></label>` : '<span class="muted">—</span>';
  const button = (text,action,r,k,classes='') => `<button class="button ${classes}" data-action="${action}" ${r?`data-id="${esc(r.id)}"`:''} ${k?`data-record="${esc(k.id)}"`:''}>${text}</button>`;
  function matchingRows(data,filters={}) {
    const query=(filters.query||'').trim().toLocaleLowerCase();
    let rows=data.rackets.filter(r=>!filters.source||filters.source==='all'||sourceCategory(r)===filters.source).map(racket=>{
      let records=M.sorted(racket.records).filter(r=>(!filters.kind||r.kind===filters.kind)&&(!filters.state||r.state===filters.state));
      const identity=[racket.name,racket.maker,racket.individual,racket.note,...Object.values(original(racket)).filter(v=>typeof v==='string')].join(' ').toLocaleLowerCase();
      if(query&&!identity.includes(query)) records=records.filter(r=>[r.stringMain,r.stringCross,r.condition,r.baseGrip,r.overgrip,r.grip,r.custom,r.note].join(' ').toLocaleLowerCase().includes(query));
      return {racket,record:records[0],show:records.length>0||(!filters.kind&&!filters.state&&(!query||identity.includes(query)))};
    }).filter(r=>r.show);
    const sort=filters.sort||'recent';
    rows.sort((a,b)=>{
      if(sort==='weight'||metrics.some(([key])=>key===sort)) {
        const av=a.record?.[sort],bv=b.record?.[sort];
        if(known(av)!==known(bv))return known(av)?-1:1;
        if(known(av)&&av!==bv)return av-bv;
      } else if(sort==='recent') {
        const order=(b.record?.date||b.racket.updatedAt||'').localeCompare(a.record?.date||a.racket.updatedAt||'');if(order)return order;
        const ao=original(a.racket).order,bo=original(b.racket).order;if(Number.isFinite(ao)&&Number.isFinite(bo)&&ao!==bo)return ao-bo;
      }
      return a.racket.name.localeCompare(b.racket.name,'ja')||a.racket.individual.localeCompare(b.racket.individual,'ja');
    });return rows;
  }
  function dropdown(id,name,options,value) {return `<label class="filter-control"><span>${name}</span><select id="${id}" aria-label="${name}">${Object.entries(options).map(([key,text])=>`<option value="${key}" ${key===value?'selected':''}>${text}</option>`).join('')}</select></label>`;}
  function header(title,subtitle,actions='',crumb='ラケット一覧') {return `<div class="breadcrumb">ラケットノート <span>/</span> ${crumb}</div><section class="page-heading"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="action-group">${actions}</div></section>`;}
  function overview(data,selected,filters,draft) {
    const group=filters.source||'all',scoped=data.rackets.filter(r=>group==='all'||sourceCategory(r)===group),titles={personal:'自分のラケット',lab:'ラボデータ',all:'すべてのラケット'};
    const tabs=`<div class="action-group" role="group" aria-label="ラケットのデータ元" style="margin:0 0 20px">${[['personal','自分のラケット'],['lab','ラボデータ'],['all','すべて']].map(([key,name])=>`<button class="button ${group===key?'primary':''}" aria-pressed="${group===key}" data-action="source-filter" data-source="${key}">${name} <span>${data.rackets.filter(r=>key==='all'||sourceCategory(r)===key).length}</span></button>`).join('')}</div>`;
    return header(`${titles[group]} <span class="count-badge">${scoped.length} 本</span>`,group==='lab'?'保存済みのRacketpediaラボデータ。自分の個体とは区別して比較できます。':'保存してきたスペックと、新しく測った記録。',button('新しいラケット','new-racket')+button('＋ 測定を記録','start-measurement',null,null,'primary'))+tabs+
    (draft?'<div class="draft-banner"><span>入力途中の下書きがあります。</span><button class="text-button" data-action="restore-draft">入力を再開 →</button></div>':'')+
    `<section class="panel"><div class="toolbar"><label class="search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input id="search" type="search" value="${esc(filters.query||'')}" aria-label="ラケットやストリングを検索" placeholder="ラケット・個体・ストリングを検索"></label>${dropdown('state-filter','測定状態',{'':'すべて',...M.states},filters.state||'')}${dropdown('kind-filter','記録種別',{'':'すべて',...M.kinds},filters.kind||'')}${dropdown('sort-order','並び順',{recent:'新しい記録順',name:'ラケット名順',weight:'重量が軽い順',balance:'バランスが小さい順',sw:'SWが小さい順',tw:'TWが小さい順'},filters.sort||'recent')}</div><div id="overview-results">${results(data,selected,filters)}</div></section><p class="view-note">各ラケットの、条件に一致する最新の記録を表示。過去の記録はラケット名から開けます。</p>`;
  }
  function results(data,selected,filters) {
    const rows=matchingRows(data,filters),empty=!data.rackets.length;
    const scoped=data.rackets.filter(r=>!filters.source||filters.source==='all'||sourceCategory(r)===filters.source);
    const heading=`<thead><tr><th scope="col" class="check-column">比較</th><th scope="col">ラケット / 個体</th>${metrics.map(([,name,unit])=>`<th scope="col" class="numeric">${name}<small>${unit}</small></th>`).join('')}<th scope="col">記録日 / 測定条件</th><th scope="col"><span class="sr-only">記録操作</span></th></tr></thead>`;
    return `<div class="table-scroll collection-table"><table>${heading}<tbody>${rows.map(({racket:r,record:k})=>`<tr class="${k&&chosen(selected,k.id)?'selected-row':''}"><td>${check(r,k,selected)}</td><td class="name-cell"><a href="${route(r.id)}">${esc(r.name)}</a><small>${esc([r.maker,r.individual].filter(Boolean).join(' · ')||sourceName(r))}</small><span class="history-count">${r.records.length} 件の履歴</span></td>${metrics.map(([key])=>`<td class="numeric spec-number">${fmt(k?.[key])}</td>`).join('')}<td class="condition-cell">${k?`${badge(k)}<time>${date(k.date)}</time><small>${esc(shortState(k))}${k.condition?' · '+esc(k.condition):''}</small><small>${esc(k.source?sourceName(k):k.stringMain||'')}</small><small>${esc(setupSummary(k))}</small>`:'<span class="muted">測定記録なし</span>'}</td><td>${button('＋ 記録','new-record',r,null,'compact')}</td></tr>`).join('')}</tbody></table></div><div class="mobile-collection">${rows.map(({racket:r,record:k})=>`<article class="mobile-racket"><div class="mobile-card-heading"><div><a class="racket-name" href="${route(r.id)}">${esc(r.name)}</a><small>${esc([r.maker,r.individual].filter(Boolean).join(' · ')||sourceName(r))}</small></div>${check(r,k,selected)}</div><dl class="metric-grid">${metricCells(k)}</dl><div class="record-context">${k?`${badge(k)}<time>${date(k.date)}</time><span>${esc(shortState(k))}</span><p>${esc([k.condition,k.source?sourceName(k):k.stringMain,setupSummary(k)].filter(Boolean).join(' · '))}</p>`:'測定記録はまだありません'}</div><div class="mobile-card-actions"><a href="${route(r.id)}" class="text-button">履歴 ${r.records.length} 件 →</a>${button('＋ 記録','new-record',r,null,'compact')}</div></article>`).join('')}</div>${!rows.length?`<div class="empty-state">${empty?`<div class="empty-symbol">${glyph}</div><h2>一本目から、記録を始める</h2><p>ラケット名と、分かる数値だけで登録できます。<br>重量・バランス・SWは、あとから追加・編集できます。</p>${button('＋ ラケットを登録','new-racket',null,null,'primary')}<div class="empty-steps"><span><b>01</b> ラケットを登録</span><span><b>02</b> 測定を重ねる</span><span><b>03</b> 選んで比較</span></div>`:'<h2>一致する記録がありません</h2><p>検索語や測定状態を変更してください。</p><button class="button" data-action="reset-filters">絞り込みを解除</button>'}</div>`:''}<div class="table-footer"><span>${rows.length} / ${scoped.length} 本 <span class="dot-divider">·</span> 記録 ${scoped.reduce((sum,r)=>sum+r.records.length,0)} 件</span><span>空欄は未記録</span></div>`;
  }
  function metricCells(record) {return metrics.map(([key,name,unit])=>`<div><dt>${name}<small>${unit}</small></dt><dd>${fmt(record?.[key])}</dd></div>`).join('');}
  function setupSummary(k) {
    return [['元',k.baseGrip],['OG',k.overgrip],['カスタム',k.custom]].filter(([,v])=>known(v)).map(([n,v])=>n+'：'+v).join(' / ');
  }
  function setupSnapshot(k) {
    const strings=k.state==='bare'?'なし':k.stringMain?[k.stringMain,k.stringCross&&k.stringCross!==k.stringMain?k.stringCross:'',known(k.tensionMain)?k.tensionMain+(known(k.tensionCross)?'/'+k.tensionCross:'')+' '+k.tensionUnit:''].filter(Boolean).join(' / '):shortState(k);
    const values=[['ストリング',strings],['元グリップ',k.baseGrip],['オーバーグリップ',k.overgrip||(k.state==='ready'?'あり（品名未記録）':'')],['カスタム（記録の原文）',k.custom],...(k.grip?[['グリップの旧記述',k.grip]]:[])];
    return '<dl class="setup-snapshot" aria-label="測定時のセッティング">'+values.map(([n,v])=>'<div><dt>'+n+'</dt><dd>'+ (known(v)?esc(v):'<span class="muted">未記録</span>')+'</dd></div>').join('')+'</dl>';
  }
  function sourcePanel(racket) {
    if(!racket.source)return '';
    const raw=original(racket),lab=racket.source.system==='racketpedia';
    const fields=lab?[['year','年式'],['pub','元データの公開日（計測日ではありません）'],['profile','ビーム形状'],['beam','ビーム'],['materials','素材'],['flex','振動数 / Hz'],['dra','DRA'],['spinw','スピンウェイト'],['recoil','反動重量'],['torsion','ねじり剛性（元表記）'],['vert','縦曲げ'],['unw','ガットなし重量（元情報）/ g'],['unb','ガットなしバランス（元情報）/ mm'],['grip','グリップの旧記述・補足'],['obj','ラボ6軸：パワー / スピン / コントロール / 操作性 / 安定性 / 快適性'],['ssH','スイートスポット 上 / %'],['ssC','スイートスポット 中央 / %'],['ssS','スイートスポット 横 / %'],['ssB','スイートスポット 下 / %'],['flexEj','曲げ剛性（部位ごとの元数値）'],['flexSt','剛性（部位ごとの元数値）']]:[['role','保存当時の役割'],['status','保存当時のステータス'],['beam','ビーム'],['weight','基本情報の重量（元表記）'],['balance','基本情報のバランス（元表記）'],['string','ストリング（当時の基本情報）'],['tension','テンション（当時の基本情報）'],['currentStringMain','縦糸（当時の基本情報）'],['currentStringCross','横糸（当時の基本情報）'],['currentString','ストリング（旧形式）'],['currentTensionMain','縦テンション（当時の基本情報）'],['currentTensionCross','横テンション（当時の基本情報）'],['currentTension','テンション（旧形式）'],['decisionKeep','継続理由'],['decisionWorry','不安点'],['decisionNext','次回確認'],['nextCheck','次の確認']];
    const statuses={active:'主力',sub:'予備',candidate:'候補',considering:'検討中',support:'用途別',retired:'引退'};
    return `<details class="panel" style="padding:20px;margin:20px 0"><summary>引き継いだ元情報 · ${sourceName(racket)}</summary><p class="view-note">${lab?'本人の個体とは別のラボ値です。測定状態は元データで未確認です。':'元データに保存されていた内容です。弦・テンションの記載を、過去の各計測条件には後付けしていません。'}</p><dl class="condition-details">${fields.filter(([key])=>known(raw[key])&&(!Array.isArray(raw[key])||raw[key].length)).map(([key,name])=>`<div><dt>${name}</dt><dd>${esc(key==='status'?statuses[raw[key]]||raw[key]:Array.isArray(raw[key])?raw[key].join(' / '):raw[key])}</dd></div>`).join('')}</dl></details>`;
  }
  function detail(racket,selected) {
    if(!racket)return header('ラケットが見つかりません','削除されたか、別のアカウントの記録です。','<a href="#/" class="button">一覧へ戻る</a>');
    return header(esc(racket.name),esc([racket.maker,racket.individual].filter(Boolean).join(' · ')||'個体名なし'),button('名前・基本情報を編集','edit-racket',racket)+button('＋ 測定を記録','new-record',racket,null,'primary'),'<a href="#/">ラケット一覧</a> <span>/</span> 詳細')+
      `<div class="basic-line">${[['face','フェイス'],['pattern','パターン'],['length','長さ'],['gripSize','グリップ']].filter(([key])=>racket[key]).map(([key,name])=>`<span>${name} <b>${esc(racket[key])}</b></span>`).join('')||'<span>基本スペックは「基本情報を編集」から追加できます</span>'}</div>${racket.note?`<p class="racket-note">${esc(racket.note)}</p>`:''}`+
      sourcePanel(racket)+
      historyView(racket,selected);
  }
  function historyView(racket,selected) {
    return racket.archive?customArchive(racket,selected):`<div class="section-heading"><h2>測定履歴 <span class="count-badge">${racket.records.length} 件</span></h2><span>新しい記録順 · 条件と測定値</span></div><section class="history-list" aria-label="測定履歴">${M.sorted(racket.records).map(record=>recordCard(racket,record,selected)).join('')||`<div class="panel empty-state"><h2>最初のスペックを記録しましょう</h2><p>重量だけ、SWだけでも記録できます。</p>${button('＋ 測定を記録','new-record',racket,null,'primary')}</div>`}</section>`;
  }
  function archiveInfo(item) {try{return JSON.parse(item.archive?.raw||'{}');}catch{return {};}}
  function excelDescription(info) {
    const x=info.excel;if(!x)return '';
    const n=x.row,c=x.cells;
    const display=v=>v&&/^\d+(?:\.\d+)?$/.test(v)?Number(v).toLocaleString('ja-JP',{maximumFractionDigits:3}):v||'—';
    return `Excel原表 ${x.sheet}!C${n}:G${n}：${c['C'+n]||''} / ${display(c['D'+n])} / BP ${display(c['E'+n])} / 幅 ${display(c['F'+n])} × 厚 ${display(c['G'+n])}`;
  }
  function customArchive(racket,selected) {
    const archive=archiveInfo(racket),list=M.sorted(racket.records);
    const columns=[['sw','SW','kg·cm²'],['balance','BP','mm'],['tw','TW','kg·cm²'],['weight','重量','g']];
    return `<div class="section-heading"><h2>測定・カスタム履歴 <span class="count-badge">${list.length} 件</span></h2><span>同じラケットの施工状態を見比べる</span></div><p class="view-note">元資料：実測値ログ（最終更新 ${esc(archive.documentUpdated)}）とExcel原表。${esc(archive.group)}の記載を保持。測定日不明は資料の掲載順を逆に表示。Firestoreの現行記録は先頭、Excelの予想は末尾。資料更新日は測定日ではありません。</p><section class="panel"><div class="table-scroll" role="region" aria-label="測定・カスタム履歴表" tabindex="0"><table style="min-width:880px;width:100%"><thead><tr><th scope="col" style="min-width:54px">比較</th><th scope="col">施工・測定条件</th>${columns.map(([,name,unit])=>`<th scope="col" class="numeric">${name}<small>${unit}</small></th>`).join('')}<th scope="col" class="numeric">グリップ<small>幅 × 厚 / mm</small></th><th scope="col">記録</th></tr></thead><tbody>${list.map(k=>{
      const info=archiveInfo(k),name=info.condition||k.condition,extra=excelDescription(info),dims=`${fmt(k.gripW)} × ${fmt(k.gripT)}`;
      const setup=[k.baseGrip&&!name.includes(k.baseGrip)?k.baseGrip:'',k.overgrip&&!name.includes('OG')?'OG：'+k.overgrip:'',k.custom&&k.custom!==name?k.custom:''].filter(Boolean).join(' / ');
      return `<tr><td>${check(racket,k,selected)}</td><td style="min-width:240px;max-width:340px;white-space:normal"><strong>${esc(name)}</strong><small style="display:block">${date(k.date)} · ${badge(k)}${info.sequence?' · 資料 '+esc(info.sequence):''}</small>${setup?`<small style="display:block;white-space:pre-wrap">${esc(setup)}</small>`:''}${k.stringMain?`<small>${esc([k.stringMain,k.stringCross,known(k.tensionMain)?k.tensionMain+' '+k.tensionUnit:''].filter(Boolean).join(' / '))}</small>`:''}${k.note?`<p style="white-space:pre-wrap">${esc(k.note)}</p>`:''}${extra||k.condition&&k.condition!==name?`<details><summary>元表記</summary>${k.condition!==name?`<p>Tennis DB：${esc(k.condition)}</p>`:''}${extra?`<p style="white-space:normal;overflow-wrap:anywhere">${esc(extra)}</p>`:''}</details>`:''}</td>${columns.map(([key])=>`<td class="numeric spec-number">${fmt(k[key])}</td>`).join('')}<td class="numeric">${dims}</td><td>${button('この条件で記録','reuse-record',racket,k,'compact')}${k.source?'':button('編集','edit-record',racket,k,'subtle')}</td></tr>`;
    }).join('')}</tbody></table></div></section><section class="panel" style="padding:20px;margin-top:20px" aria-label="元資料の施工メモ"><h3>元資料の施工メモ</h3>${(archive.notes||[]).map(note=>`<p style="white-space:pre-wrap">${esc(note)}</p>`).join('')}${archive.excelNote?`<p>${esc(archive.excelNote)}</p>`:''}<p class="view-note">採用・却下・現行の記述は保存当時の原文です。未記録のSW・TWや施工日を補っていません。</p></section>`;
  }
  function recordCard(r,k,selected) {
    const terms=[['重量',known(k.weight)?k.weight+' g':''],['縦糸',k.stringMain],['横糸',k.stringCross],['縦テンション',known(k.tensionMain)?k.tensionMain+' '+k.tensionUnit:''],['横テンション',known(k.tensionCross)?k.tensionCross+' '+k.tensionUnit:''],['グリップ',k.grip],['グリップ幅 / 厚',known(k.gripW)||known(k.gripT)?`${known(k.gripW)?k.gripW:'—'} / ${known(k.gripT)?k.gripT:'—'} mm`:''],['RA',k.ra],['カスタム（記録の原文）',k.custom],['メモ',k.note]];
    return `<article class="panel history-entry"><div class="history-heading"><div class="record-title"><h3>${date(k.date)}</h3>${badge(k)}<span class="state-chip">${esc(shortState(k))}</span></div><div class="history-controls">${check(r,k,selected)}${k.source?`<span class="muted">${sourceName(k)}から引継ぎ</span>`:button('編集','edit-record',r,k,'subtle')}</div></div>${k.condition?`<p class="condition-description">${esc(k.condition)}</p>`:''}<dl class="metric-grid">${metricCells(k)}</dl>${setupSnapshot(k)}<div class="record-bottom"><details><summary>ストリング・調整・メモ</summary><dl class="condition-details">${terms.map(([name,v])=>`<div><dt>${name}</dt><dd>${fmt(v)}</dd></div>`).join('')}</dl></details>${button('この条件で記録','reuse-record',r,k,'compact')}</div>${k.source?'<p class="view-note">引き継いだ記録は原文を保持します。測り直した数値は「この条件で記録」から追加できます。</p>':''}</article>`;
  }
  const compareFields=[
    ['kind','記録種別','','context'],['sourceName','出典','','context'],['state','測定状態','','context'],['condition','今回の変更・条件名','','context'],
    ...metrics.map(([key,name,unit])=>[key,name,unit,'number']),['baseGrip','元グリップ','','context'],['overgrip','オーバーグリップ','','context'],['custom','カスタム（記録の原文）','','context'],['weight','重量','g','number'],['ra','RA','','number'],['face','フェイス','in²','racket'],['pattern','パターン','','racket'],['length','長さ','','racket'],['gripSize','グリップサイズ','','racket'],
    ['stringMain','縦糸'],['stringCross','横糸'],['tensionMain','縦テンション','','tension'],['tensionCross','横テンション','','tension'],['grip','グリップ'],['gripW','グリップ幅','mm','number'],['gripT','グリップ厚','mm','number'],['note','測定メモ'],['flex','振動数','Hz','sourceNumber'],['dra','DRA','','sourceNumber'],['spinw','スピンウェイト','kg·cm²','sourceNumber'],['recoil','反動重量','kg·cm²','sourceNumber'],['profile','ビーム形状','','sourceText'],['obj','ラボ6軸（パワー/スピン/コントロール/操作性/安定性/快適性）','','sourceText'],
    ['archiveCondition','元資料の施工名','','archive'],['archiveExcel','Excelの元表記','','archive']
  ];
  function rawValue(item,key,type) {
    if(type==='archive'){const info=archiveInfo(item.record);return key==='archiveCondition'?info.condition||'':excelDescription(info);}
    if(key==='sourceName')return sourceName(item.record);
    if(type==='sourceNumber'||type==='sourceText'){const value=item.record.source?.system==='racketpedia'?original(item.record)[key]:'';return Array.isArray(value)?value.join(' / '):value??'';}
    if(type==='racket')return item.racket[key]||'';
    if(key==='kind')return M.kinds[item.record.kind];
    if(key==='state')return M.states[item.record.state];
    if(type==='tension')return known(item.record[key])?item.record[key]+' '+item.record.tensionUnit:'';
    return item.record[key];
  }
  function difference(value,base) {
    if(typeof value!=='number'||typeof base!=='number'||!Number.isFinite(value)||!Number.isFinite(base))return '';
    const d=Math.round((value-base)*1000)/1000;
    return d===0?'差なし':(d>0?'+':'−')+Math.abs(d).toLocaleString('ja-JP',{maximumFractionDigits:3});
  }
  function comparisonColumnHeader(items,sameRacket,interactive=true) {
    return `<thead><tr><th scope="col">項目</th>${items.map(({racket:r,record:k},i)=>`<th scope="col"><div class="comparison-col-heading">${sameRacket?`<strong>記録 ${i+1}</strong>`:`<a class="racket-name" href="${route(r.id)}">${esc(r.name)}${r.individual?`<small>${esc(r.individual)}</small>`:''}</a>`}${interactive?`<button class="remove-record" data-remove="${esc(k.id)}" aria-label="${esc(label(r,k))}を比較から外す">×</button>`:''}</div><small class="comparison-record-meta">${date(k.date)} · ${badge(k)}<span>${esc(shortState(k))} · ${sourceName(k)}</span></small>${interactive?`<div class="comparison-baseline">${i===0?'<span class="baseline-badge">比較の基準</span>':`<button class="text-button" data-baseline="${esc(k.id)}" aria-label="${esc(label(r,k))}を基準にする">基準にする</button>`}</div>`:''}</th>`).join('')}</tr></thead>`;
  }
  function comparisonRows(fields,items,base) {
    return fields.map(([key,name,unit,type])=>`<tr data-metric="${esc(key)}" class="${type==='number'||type==='sourceNumber'?'numeric-row':''}"><th scope="row">${name}${unit?`<small>${unit}</small>`:''}</th>${items.map((item,i)=>{
      const v=rawValue(item,key,type),d=(type==='number'||type==='sourceNumber')&&i?difference(v,rawValue(base,key,type)):'';
      return `<td>${fmt(v)}${d?`<small class="delta">${d==='差なし'?d:'基準より '+d+(unit?' '+unit:'')}</small>`:''}</td>`;
    }).join('')}</tr>`).join('');
  }
  const hasNumber = v => typeof v === 'number' && Number.isFinite(v);
  const recoil = k => {const v = M.recoilWeight(k); return hasNumber(v) ? Math.round(v*10)/10 : null;};
  const cmpDelta = (v,b) => {const d = difference(v,b); return !d ? '' : d === '差なし' ? '<span class="cmp-d cmp-zero">差なし</span>' : `<span class="cmp-d">${d}</span>`;};
  function loadText(k) {
    if (!Object.hasOwn(k,'customParts') || !Array.isArray(k.customParts)) return '未記録';
    if (!k.customParts.length) return 'なし';
    const own = k.customParts.map(p => text(p.material)), any = own.some(Boolean), same = own.every(m => m && m === own[0]);
    if (any && !same) return k.customParts.map(p => `${p.position}${text(p.material) ? ' ' + p.material : ''} ${gramText(p.grams)} g`).join('、');
    const groups = [];
    for (const part of k.customParts) {const g = groups.find(x => x.grams === part.grams); if (g) g.positions.push(part.position); else groups.push({grams:part.grams,positions:[part.position]});}
    return (any ? own[0] + ' · ' : '') + groups.map(g => g.positions.length > 1 ? `${g.positions.join('・')} 各${gramText(g.grams)} g` : `${g.positions[0]} ${gramText(g.grams)} g`).join('、');
  }
  function gripText(k) {
    const base = text(k.baseGrip), og = overgripShort(k);
    if (base) return og === '—' ? base + '／未記録' : base + '／OG' + og;
    return og === '—' ? '未記録' : '未記録／OG' + og;
  }
  function stringCell(k,side) {
    if (k.state === 'bare') return 'なし';
    const name = text(k[side==='main'?'stringMain':'stringCross']), gauge = k[side==='main'?'stringMainGauge':'stringCrossGauge'], tension = k[side==='main'?'tensionMain':'tensionCross'];
    const detail = [known(gauge) ? gaugeText(gauge) + ' mm' : '', known(tension) ? tension + ' ' + (k.tensionUnit || '') : ''].filter(Boolean).map(t => t.trim()).join(' · ');
    if (!name && !detail) return '未記録';
    return `<div class="cmp-string">${name ? esc(name) : ''}${detail ? `<span>${esc(detail)}</span>` : ''}</div>`;
  }
  function comparison(data,selected,baseline,onlyDifferent) {
    let items=selected.map(i=>{const racket=data.rackets.find(r=>r.id===i.racketId);return{racket,record:racket?.records.find(r=>r.id===i.recordId)};}).filter(i=>i.record);
    const base=items.find(i=>i.record.id===baseline)||items[0];
    if(base)items=[base,...items.filter(i=>i!==base)];
    if(!items.length)return header('測定履歴の比較','',button('＋ 記録を選ぶ','choose-records',null,null,'primary'),'比較')+`<div class="panel empty-state"><div class="empty-symbol">⇄</div><h2>比較したい記録を選ぶ</h2><p>別のラケットも、同じ個体の過去の測定も。<br>最大4件を並べて比較できます。</p>${button('記録を選ぶ','choose-records',null,null,'primary')}</div>`;
    const sameRacket=items.every(item=>item.racket.id===items[0].racket.id),coreKeys=new Set(['sw','balance','tw','weight']),full=items.length>=4;
    const supplement=compareFields.filter(([key,,,type])=>!coreKeys.has(key)&&((!type?.startsWith('source')&&type!=='archive')||items.some(i=>known(rawValue(i,key,type))))&&(type==='context'||!onlyDifferent||new Set(items.map(i=>String(rawValue(i,key,type)??''))).size>1));
    const cls=i=>i===0?' class="cmp-base"':'',plus='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',cross='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>';
    const head=`<div class="cmp-head"><div><h1>測定履歴の比較</h1><p>${items.length}件を選択中 (最大4件) · ラケット・個体を問わず並べる · <span class="cmp-blue">青字は基準との差</span></p></div><div class="cmp-head-actions">${full?`<button type="button" class="cmp-btn" data-action="choose-records" disabled aria-disabled="true" title="最大4件">${plus}列を追加 · 上限</button>`:`<button type="button" class="cmp-btn" data-action="choose-records">${plus}列を追加</button>`}<a class="cmp-btn" href="#/">一覧へ戻る</a></div></div>`;
    const cols=`<colgroup><col style="width:16%">${items.map(()=>`<col style="width:${84/items.length}%">`).join('')}</colgroup>`;
    const thead=`<thead><tr><th scope="col" class="cmp-item-head">項目</th>${items.map(({racket:r,record:k},i)=>{const cond=k.condition||archiveInfo(k).condition||'',sub=[r.individual,cond].filter(Boolean).join(' · ');return `<th scope="col"${cls(i)}><a class="cmp-name" href="${route(r.id)}">${esc(r.name)}</a>${sub?`<div class="cmp-sub">${esc(sub)}</div>`:''}${k.date?`<div class="cmp-date">${date(k.date)}</div>`:''}<div class="cmp-kind">${badge(k)}</div><div class="cmp-actions">${i===0?'<span class="cmp-basemark">基準</span>':`<button type="button" class="cmp-set" data-baseline="${esc(k.id)}" aria-label="${esc(label(r,k))}を基準にする">基準にする</button>`}<button type="button" class="cmp-x" data-remove="${esc(k.id)}" aria-label="${esc(label(r,k))}を外す">${cross}</button></div></th>`;}).join('')}</tr></thead>`;
    const number=(key,name,unit,get,empty)=>`<tr data-metric="${key}"><th scope="row" class="cmp-row-head">${name}${unit?`<span class="cmp-unit">${unit}</span>`:''}</th>${items.map((item,i)=>{const v=get(item.record);const missing=empty?empty(item.record):'未測定';return v===null||!known(v)?`<td${i===0?' class="cmp-base cmp-na"':' class="cmp-na"'}>${esc(missing)}</td>`:`<td class="cmp-n${i===0?' cmp-base':''}">${typeof v==='number'&&key==='rw'?v.toFixed(1):esc(v)}${i?cmpDelta(v,get(base.record)):''}</td>`;}).join('')}</tr>`;
    const plain=(key,name,render,tall)=>`<tr data-metric="${key}"><th scope="row" class="cmp-row-head">${name}</th>${items.map((item,i)=>`<td class="${i===0?'cmp-base':''}${tall?' cmp-tall':''}">${render(item.record)}</td>`).join('')}</tr>`;
    const waiting=k=>[['SW',k.sw],['BP',k.balance],['重量',k.weight]].filter(([,v])=>!hasNumber(v)).map(([n])=>n).join('・')+' 待ち';
    const body=number('sw','SW','kg·cm²',k=>k.sw)+number('balance','BP','mm',k=>k.balance)+number('tw','TW','kg·cm²',k=>k.tw)+number('weight','重量','g',k=>k.weight)+number('rw','RW (計算値)','kg·cm²',recoil,waiting)+plain('load','加重 (位置・量)',k=>esc(loadText(k)))+plain('grip','元グリップ／OG',k=>esc(gripText(k)))+plain('stringMain','縦糸',k=>stringCell(k,'main'),true)+plain('stringCross','横糸',k=>stringCell(k,'cross'),true);
    return `<div class="comparison-view">${head}<section class="cmp-card"><div class="cmp-scroll" role="region" aria-label="比較表" tabindex="0"><table class="cmp-table" style="--columns:${items.length}">${cols}${thead}<tbody>${body}</tbody></table></div></section><details class="panel comparison-supplement"><summary>弦・グリップ条件・原資料</summary><div class="compare-tools"><label class="toggle-label"><input type="checkbox" id="only-different" ${onlyDifferent?'checked':''}>補足は違う項目だけ表示</label><span>上の表の項目は常に表示します。</span></div><div class="comparison-scroll" role="region" aria-label="補足と原資料の比較表" tabindex="0"><table class="comparison-table" style="--columns:${items.length}">${comparisonColumnHeader(items,sameRacket,false)}<tbody>${comparisonRows(supplement,items,base)}</tbody></table></div></details><p class="view-note">空欄は未記録。実測・推定・ラボ値の区別は、各列の見出しの印で表示します。</p></div>`;
  }
  function picker(data,selected,query='') {
    const q=query.trim().toLocaleLowerCase();
    const items=data.rackets.flatMap(r=>M.sorted(r.records).map(k=>({r,k}))).filter(({r,k})=>[r.name,r.individual,r.maker,k.date,k.condition,k.stringMain,k.baseGrip,k.overgrip,k.custom,M.kinds[k.kind],shortState(k)].join(' ').toLocaleLowerCase().includes(q));
    return items.map(({r,k})=>`<label class="picker-row"><input type="checkbox" data-compare="${esc(k.id)}" data-racket="${esc(r.id)}" aria-label="${esc(label(r,k))}を比較" ${chosen(selected,k.id)?'checked':''}><span><strong>${esc(r.name)}${r.individual?` <small>${esc(r.individual)}</small>`:''}</strong><span class="record-context">${date(k.date)} ${badge(k)} ${esc(shortState(k))}</span><span class="picker-numbers">SW ${fmt(k.sw)} <span>·</span> BP ${fmt(k.balance)} mm <span>·</span> TW ${fmt(k.tw)}</span><span class="picker-note">${esc([k.condition,k.stringMain,setupSummary(k)].filter(Boolean).join(' · '))}</span></span></label>`).join('')||'<div class="empty-state"><h3>選べる記録がありません</h3><p>測定を追加するか、検索語を変更してください。</p></div>';
  }
  function racketChoices(data,query='') {
    const rows=matchingRows(data,{source:'personal',query,sort:'name'});
    return rows.map(({racket:r})=>`<article class="racket-choice"><div><strong>${esc(r.name)}</strong><small>${esc(r.individual||'個体名なし')} · 履歴 ${r.records.length} 件</small></div><div class="racket-choice-actions">${button('名前を編集','edit-racket',r,null,'subtle')}${button('測定を記録','new-record',r,null,'primary')}</div></article>`).join('')||'<p class="view-note">一致するラケットがありません。新しい一本は下から登録できます。</p>';
  }
  function recordStart(data) {
    return `<section class="record-start"><p>測る一本を選んでください。名前の入力は不要です。</p><label class="field"><span>ラケットを検索</span><input id="measurement-racket-search" type="search" placeholder="名前・個体名で検索"></label><div id="measurement-racket-choices">${racketChoices(data)}</div><div class="record-start-footer">${button('＋ 新しいラケットを登録','new-racket')}<span>新規登録は名前だけでも大丈夫です。</span></div></section>`;
  }
  const api={esc,fmt,known,date,glyph,header,overview,results,matchingRows,detail,comparison,picker,difference,overgripShort,gramText,gaugeText,racketChoices,recordStart,historyView,sourcePanel};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RacketWorkspaceUI=Object.freeze(api);
})(typeof globalThis!=='undefined'?globalThis:this);
