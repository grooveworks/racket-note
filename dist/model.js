/* Data format and validation are shared by the browser and integrity checks. */
(function(root) {
  'use strict';
  const racketText = ['name','maker','individual','face','pattern','length','gripSize','note','createdAt','updatedAt'];
  const recordText = ['date','kind','state','condition','stringMain','stringCross','tensionUnit','grip','custom','note','createdAt'];
  const recordSetupText = ['baseGrip','overgrip'];
  const recordOptionalNumbers = ['stringMainGauge','stringCrossGauge'];
  const recordNumbers = ['weight','balance','sw','tw','ra','gripW','gripT','tensionMain','tensionCross'];
  const maxCustomParts = 40;
  const kinds = {measured:'実測',catalog:'公称値',estimated:'推定値',lab:'ラボ値',legacy:'種別未記録',other:'その他'};
  const states = {unknown:'未確認',bare:'ガットなし',strung:'張り上がり',ready:'張り上がり＋オーバーグリップ',other:'その他'};
  function text(value, key) {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string' || value.length > 20000) throw Error(key + 'の形式を確認してください。');
    return value;
  }
  function number(value, key) {
    if (value === '' || value === null || value === undefined) return '';
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10000) return value;
    throw Error(key + 'は0以上の数値で入力してください。');
  }
  function customParts(value) {
    if (!Array.isArray(value) || value.length > maxCustomParts) throw Error('加重の位置と量の形式を確認してください。');
    return value.map(part => {
      if (!part || typeof part !== 'object' || typeof part.position !== 'string' || !part.position.trim() || part.position.length > 100 || typeof part.grams !== 'number' || !Number.isFinite(part.grams) || part.grams < 0 || part.grams > 10000) throw Error('加重の位置と量の形式を確認してください。');
      const item = {position:part.position,grams:part.grams};
      if (Object.hasOwn(part,'material')) {
        if (typeof part.material !== 'string' || part.material.length > 100) throw Error('加重の位置と量の形式を確認してください。');
        item.material = part.material;
      }
      return item;
    });
  }
  function id(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 200) throw Error('記録IDが不正です。');
    return value;
  }
  function date(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value + 'T12:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
  }
  function source(value) {
    if (value === undefined) return undefined;
    if (!value || !['tennis-db','racketpedia','chatgpt'].includes(value.system) || typeof value.raw !== 'string' || value.raw.length > 20000) throw Error('元データの出典形式を確認してください。');
    const raw = JSON.parse(value.raw);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('元データの原文形式を確認してください。');
    return {system:value.system,key:text(value.key,'出典ID'),path:text(value.path,'出典'),raw:value.raw,importedAt:text(value.importedAt,'引継日時'),current:value.current === true};
  }
  function validate(input) {
    if (!input || input.app !== 'racket-note' || input.version !== 1 || !Array.isArray(input.rackets) || input.rackets.length > 5000) throw Error('ラケットノートのJSONバックアップ（形式1）を選んでください。');
    const racketIds = new Set();
    const recordIds = new Set();
    const rackets = input.rackets.map(item => {
      if (!item || typeof item !== 'object') throw Error('ラケットのデータが不正です。');
      const racket = {id:id(item.id)};
      if (racketIds.has(racket.id)) throw Error('ラケットIDが重複しています。');
      racketIds.add(racket.id);
      racketText.forEach(key => {racket[key] = text(item[key],key);});
      if (Object.hasOwn(item,'tennisDbRacketId')) racket.tennisDbRacketId = id(item.tennisDbRacketId);
      if (item.source !== undefined) racket.source = source(item.source);
      if (item.archive !== undefined) racket.archive = source(item.archive);
      if (!racket.name.trim()) throw Error('ラケット名がありません。');
      if (!Array.isArray(item.records) || item.records.length > 10000) throw Error('測定履歴の形式を確認してください。');
      racket.records = item.records.map(itemRecord => {
        if (!itemRecord || typeof itemRecord !== 'object') throw Error('測定履歴が不正です。');
        const record = {id:id(itemRecord.id)};
        if (recordIds.has(record.id)) throw Error('測定記録のIDが重複しています。');
        recordIds.add(record.id);
        recordText.forEach(key => {record[key] = text(itemRecord[key],key);});
        // Optional additions must not change old payloads or their revision signatures.
        recordSetupText.forEach(key => {if (Object.hasOwn(itemRecord,key)) record[key] = text(itemRecord[key],key);});
        recordOptionalNumbers.forEach(key => {if (Object.hasOwn(itemRecord,key)) record[key] = number(itemRecord[key],key);});
        if (Object.hasOwn(itemRecord,'customMaterial')) record.customMaterial = text(itemRecord.customMaterial,'加重の素材');
        if (Object.hasOwn(itemRecord,'customParts')) record.customParts = customParts(itemRecord.customParts);
        if (Object.hasOwn(itemRecord,'gripSizeCustom')) record.gripSizeCustom = text(itemRecord.gripSizeCustom,'グリップサイズのカスタム');
        if (Object.hasOwn(itemRecord,'inputTranscript')) record.inputTranscript = text(itemRecord.inputTranscript,'入力原文');
        if (itemRecord.source !== undefined) record.source = source(itemRecord.source);
        if (itemRecord.archive !== undefined) record.archive = source(itemRecord.archive);
        if (!date(record.date) && !(record.date === '' && record.source)) throw Error('測定日の形式を確認してください。');
        if (!Object.hasOwn(kinds,record.kind) || !Object.hasOwn(states,record.state)) throw Error('記録種別・状態の形式を確認してください。');
        if (!['lb','kg'].includes(record.tensionUnit)) throw Error('テンションの単位を確認してください。');
        recordNumbers.forEach(key => {record[key] = number(itemRecord[key],key);});
        return record;
      });
      return racket;
    });
    return {app:'racket-note',version:1,rackets};
  }
  function recoilWeight(record) {
    const {sw,weight,balance} = record || {};
    if ([sw,weight,balance].some(value => typeof value !== 'number' || !Number.isFinite(value))) return '';
    return sw - (weight / 1000) * (balance / 10 - 10) ** 2;
  }
  function empty() {return {app:'racket-note',version:1,rackets:[]};}
  function historySequence(record) {try{return Number(JSON.parse(record.archive?.raw || '{}').sequence)||0;}catch{return 0;}}
  function sorted(records) {return [...records].sort((a,b) => b.date.localeCompare(a.date) || Number(Boolean(b.source?.current))-Number(Boolean(a.source?.current)) || historySequence(b)-historySequence(a) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));}
  function merge(current, incoming) {
    const result = validate(current);
    const source = validate(incoming);
    const byId = new Map(result.rackets.map(racket => [racket.id,racket]));
    const existingRecordIds = new Set(result.rackets.flatMap(racket => racket.records.map(record => record.id)));
    let addedRackets = 0, addedRecords = 0, skippedRecords = 0;
    for (const racket of source.rackets) {
      let target = byId.get(racket.id);
      if (!target) {target = {...racket,records:[]};result.rackets.push(target);byId.set(target.id,target);addedRackets++;}
      for (const record of racket.records) {
        if (existingRecordIds.has(record.id)) {skippedRecords++;continue;}
        target.records.push(record);existingRecordIds.add(record.id);addedRecords++;
      }
    }
    return {data:validate(result),addedRackets,addedRecords,skippedRecords};
  }
  function partsText(parts) {
    if (!Array.isArray(parts)) return '';
    return parts.length ? parts.map(part => part.position + ':' + part.grams + 'g' + (part.material ? '(' + part.material + ')' : '')).join(' / ') : 'なし';
  }
  function csv(state) {
    const columns = ['ラケット名','メーカー','個体名','フェイス','パターン','長さ','グリップサイズ','日付','種別','状態','今回の変更・条件名','重量(g)','バランス(mm)','SW(kg·cm²)','TW(kg·cm²)','RA','グリップ幅(mm)','グリップ厚(mm)','縦糸','横糸','テンション縦','テンション横','テンション単位','グリップ（旧記述・補足）','カスタム（記録の原文）','グリップサイズのカスタム','測定メモ','ラケットメモ','元グリップ','オーバーグリップ','縦糸太さ(mm)','横糸太さ(mm)','加重の素材','加重（位置別）'];
    const rows = [columns];
    validate(state).rackets.forEach(racket => {
      const base = [racket.name,racket.maker,racket.individual,racket.face,racket.pattern,racket.length,racket.gripSize];
      if (!racket.records.length) rows.push([...base,...Array(20).fill(''),racket.note,'','','','','','']);
      sorted(racket.records).forEach(record => rows.push([...base,record.date,kinds[record.kind],states[record.state],record.condition,...recordNumbers.slice(0,7).map(key => record[key]),record.stringMain,record.stringCross,record.tensionMain,record.tensionCross,record.tensionUnit,record.grip,record.custom,record.gripSizeCustom,record.note,racket.note,record.baseGrip,record.overgrip,record.stringMainGauge,record.stringCrossGauge,record.customMaterial,partsText(record.customParts)]));
    });
    const cell = value => {
      let safe = String(value ?? '');
      if (/^[\s]*[=+\-@]/.test(safe) || /^[\t\r\n]/.test(safe)) safe = "'" + safe;
      return '"' + safe.replaceAll('"','""') + '"';
    };
    return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
  }
  const api = {validate,recoilWeight,empty,sorted,merge,csv,kinds,states,recordNumbers};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RacketLedgerModel = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
