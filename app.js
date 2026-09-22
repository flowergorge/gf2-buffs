'use strict';
// No framework or build step. Replace data.json to update the published data.
const $ = id => document.getElementById(id);
const MAX_SIZE = 12 * 1024 * 1024;
let dataset = null, views = [], activeDay = 'all', requestId = 0;

function normalizeData(raw) {
  const rows = Array.isArray(raw) ? raw : raw?.buffs;
  if (!Array.isArray(rows)) throw new Error('버프 배열 또는 buffs 배열이 있는 JSON이 필요합니다.');
  if (rows.length > 30000) throw new Error('버프는 최대 30,000행까지 지원합니다.');
  const integer = (value, field, i) => {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${i + 1}번째 행의 ${field} 값이 올바르지 않습니다.`);
    return value;
  };
  const buffs = rows.map((r, i) => {
    if (!r || typeof r !== 'object') throw new Error(`${i + 1}번째 행을 읽을 수 없습니다.`);
    if (typeof r.name !== 'string' || typeof r.description !== 'string') throw new Error(`${i + 1}번째 행에 이름 또는 설명이 없습니다.`);
    if (r.name.length > 500 || r.description.length > 20000) throw new Error(`${i + 1}번째 행의 텍스트가 너무 깁니다.`);
    return {id: integer(r.id, 'id', i), group: integer(r.group, 'group', i), day: integer(r.day, 'day', i), buff_id: integer(r.buff_id, 'buff_id', i), name: r.name, description: r.description};
  }).filter(b => b.day >= 1 && b.day <= 7);
  const candidates = !Array.isArray(raw) ? (Array.isArray(raw.seasons) && raw.seasons.length ? raw.seasons : raw.season ? [raw.season] : []) : [];
  const seasons = candidates.filter(s => s && Number.isSafeInteger(s.group)).map(s => ({
    id:s.id, group:s.group, name:typeof s.name==='string'?s.name:`그룹 ${s.group}`,
    start:validTimestamp(s.start), end:validTimestamp(s.end), boundary1:validTimestamp(s.boundary1),
    description:typeof s.description==='string'?s.description:''
  }));
  return {buffs, seasons, region: !Array.isArray(raw) && typeof raw.region==='string' ? raw.region : '', exportedAt: !Array.isArray(raw) && typeof raw.exported_at==='string' ? raw.exported_at : ''};
}
function validTimestamp(n) {return Number.isFinite(n) && n>0 && n<4102444800 ? n : null;}
function el(tag, cls, text) {const node=document.createElement(tag); if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
function dateText(ts, time=false) {
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',...(time?{year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}:{})}).format(new Date(ts*1000));
}
function buildViews(data) {
  const groups=[...new Set(data.buffs.map(b=>b.group))].sort((a,b)=>b-a);
  const result=data.seasons.filter(s=>groups.includes(s.group)).sort((a,b)=>(b.start||0)-(a.start||0))
    .map((s,i)=>({key:`season-${s.id??i}-${i}`,group:s.group,season:s}));
  for(const group of groups)if(!result.some(v=>v.group===group))result.push({key:`group-${group}`,group,season:null});
  return result;
}
function currentDay(s, now=Date.now()/1000) {
  if(!s?.start || !s?.end || now<s.start || now>=s.end)return null;
  const day=Math.floor((now-s.start)/86400)+1;
  return day>=1 && day<=7 ? day : null;
}
function initialSelection(data, options, now=Date.now()/1000) {
  const current=options.find(v=>currentDay(v.season,now)!==null);
  const selected=current || options.find(v=>v.season?.start && v.season.start<=now) || options[0];
  const day=current?currentDay(current.season,now):null;
  return {key:selected?.key||'',day:day && data.buffs.some(b=>b.group===selected.group&&b.day===day)?String(day):'all'};
}
function selectedView(){return views.find(v=>v.key===$('group').value)||null;}
function updateToday(){
  const node=$('today-date');if(node)node.textContent=`오늘 · ${dateText(Date.now()/1000,true)} KST`;
}
function showMessage(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function installData(raw, source) {
  const next=normalizeData(raw); // Validate before replacing the last successful dataset.
  dataset=next;views=buildViews(next);$('search').value='';
  $('group').replaceChildren();
  for(const v of views){const s=v.season;const opt=el('option','',s?`${s.name}${s.start?' · '+dateText(s.start,true).split(' ').slice(0,3).join(' '):''} · 그룹 ${v.group}`:`그룹 ${v.group} · 일정 정보 없음`);opt.value=v.key;$('group').append(opt);}
  const initial=initialSelection(next,views);$('group').value=initial.key;activeDay=initial.day;
  $('group').disabled=!views.length;$('search').disabled=!views.length;
  $('total').textContent=next.buffs.length.toLocaleString('ko-KR');
  $('source-note').textContent=source;
  showMessage(`${source} · ${next.buffs.length.toLocaleString('ko-KR')}개 버프${next.region?' · '+next.region.toUpperCase():''}${next.exportedAt?' · 추출 '+next.exportedAt:''}`);
  render();
}
function filteredBuffs(){
  if(!dataset)return [];
  const group=selectedView()?.group,q=$('search').value.trim().toLocaleLowerCase();
  return dataset.buffs.filter(b=>b.group===group&&(activeDay==='all'||b.day===Number(activeDay))&&(!q||`${b.name} ${b.description} ${b.buff_id} ${b.id}`.toLocaleLowerCase().includes(q))).sort((a,b)=>a.day-b.day||a.id-b.id);
}
function render(){
  if(!dataset)return;
  updateToday();
  const view=selectedView(),group=view?.group,s=view?.season;
  const groupBuffs=dataset.buffs.filter(b=>b.group===group);
  const days=[...new Set(groupBuffs.map(b=>b.day))].sort((a,b)=>a-b);
  const today=currentDay(s);
  $('days').replaceChildren();
  for(const d of ['all',...days]){
    const btn=el('button','day-button');btn.type='button';btn.setAttribute('aria-pressed',String(String(d)===activeDay));
    btn.append(el('span','',d==='all'?'전체 일차':`${d}일차`));
    if(d===today)btn.append(el('small','','오늘'));
    btn.onclick=()=>{activeDay=String(d);render();};$('days').append(btn);
  }
  $('season-info').replaceChildren();$('season-info').hidden=!view;
  if(s){
    if(s.description)$('season-info').append(el('p','','시즌 효과 · '+s.description));
    if(s.start){const until=s.boundary1||s.end;$('season-info').append(el('p','timing',`${dateText(s.start,true)} 시작${until?' / '+dateText(until,true)+' 종료 경계':''} · KST`));}
  }else if(view){$('season-info').append(el('p','timing','이 JSON에는 시즌 효과와 일정이 없습니다. 새 버전의 PC 뷰어에서 다시 저장하면 오늘 시즌·일차가 자동으로 표시됩니다.'));}
  const matches=filteredBuffs();
  $('result-title').textContent=activeDay==='all'?'전체 일차':`${activeDay}일차 버프`;
  $('result-count').textContent=`${matches.length}개 버프`;
  $('buffs').replaceChildren();
  if(!matches.length){$('buffs').append(el('div','empty',dataset.buffs.length?'일치하는 버프가 없습니다. 검색어 또는 일차를 바꿔보세요.':'JSON에 1~7일차 버프가 없습니다.'));return;}
  for(const day of [...new Set(matches.map(b=>b.day))]){
    const section=el('section','day-section');const label=el('h3','section-label',`${String(day).padStart(2,'0')}일차`);
    if(s?.start&&day>=1){const ts=s.start+(day-1)*86400;label.append(el('span','',s.end&&ts>=s.end?'기간 밖 저장 데이터':`${dateText(ts)}${day===today?' · 오늘':''}`));}
    section.append(label);const cards=el('div','cards');
    for(const b of matches.filter(b=>b.day===day)){
      const card=el('article','buff-card');const top=el('div','card-top');
      top.append(el('span','buff-icon',String(cards.childElementCount+1).padStart(2,'0')),el('h4','',b.name));
      card.append(top,el('p','',b.description));
      const meta=el('div','card-meta');meta.append(el('span','',`BUFF ${b.buff_id}`),el('span','',`#${b.id}`));card.append(meta);cards.append(card);
    }
    section.append(cards);$('buffs').append(section);
  }
}
async function loadServer(){
  const id=++requestId;$('reload').disabled=true;showMessage('서버의 data.json을 불러오는 중입니다…');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    if(location.protocol==='file:')throw new Error('로컬 파일로 열었습니다. 아래의 JSON 미리보기를 이용하거나 웹서버에 올려주세요.');
    const response=await fetch(new URL('./data.json',location.href),{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error(`data.json을 읽지 못했습니다 (HTTP ${response.status}). index.html과 같은 폴더에 업로드하세요.`);
    const text=await response.text();if(new Blob([text]).size>MAX_SIZE)throw new Error('JSON 파일은 12MB 이하로 올려주세요.');
    if(id!==requestId)return;
    installData(JSON.parse(text.replace(/^\uFEFF/,'')),'서버 data.json');
    $('file-name').textContent='선택한 파일 없음';$('file').value='';
  }catch(err){if(id!==requestId)return;showMessage((err.name==='AbortError'?'서버 응답이 늦습니다. 잠시 후 새로고침해 주세요.':err instanceof SyntaxError?'JSON 문법이 올바르지 않습니다. 뷰어에서 다시 내보낸 파일을 사용하세요.':err.message)+(dataset?' 이전 데이터를 계속 표시합니다.':''),true);if(!dataset){$('group').replaceChildren(el('option','','데이터 없음'));$('buffs').replaceChildren(el('div','empty','데이터를 불러오지 못했습니다. 위 안내를 확인하거나 JSON 파일을 직접 선택하세요.'));}}
  finally{clearTimeout(timer);if(id===requestId)$('reload').disabled=false;}
}
$('group').onchange=()=>{const v=selectedView(),day=currentDay(v?.season);activeDay=day&&dataset.buffs.some(b=>b.group===v.group&&b.day===day)?String(day):'all';render();};$('search').oninput=render;$('reload').onclick=loadServer;
$('file').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;const id=++requestId;$('reload').disabled=false;
  try{if(file.size>MAX_SIZE)throw new Error('12MB 이하 JSON 파일을 선택하세요.');const text=await file.text();if(id!==requestId)return;installData(JSON.parse(text.replace(/^\uFEFF/,'')),`로컬 미리보기 · ${file.name}`);$('file-name').textContent=file.name;}
  catch(err){if(id===requestId)showMessage((err instanceof SyntaxError?'JSON 문법을 확인해 주세요.':err.message)+(dataset?' 이전 데이터를 계속 표시합니다.':''),true);}
};
// Optional structured access for browsers that support WebMCP.
const context=document.modelContext;
if(context?.registerTool){
  try{Promise.resolve(context.registerTool({name:'filter_guild_buffs',description:'선택한 그룹, 일차, 검색어로 화면의 버프 목록을 필터링합니다.',inputSchema:{type:'object',properties:{group:{type:'integer'},day:{type:'integer',minimum:0},query:{type:'string'}},required:['group'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input){
    if(!dataset)throw new Error('데이터가 아직 로드되지 않았습니다.');
    if(!input||!Number.isSafeInteger(input.group)||!dataset.buffs.some(b=>b.group===input.group))throw new Error('존재하는 그룹을 지정하세요.');
    if(input.day!==undefined&&(!Number.isSafeInteger(input.day)||!dataset.buffs.some(b=>b.group===input.group&&b.day===input.day)))throw new Error('존재하는 일차를 지정하세요.');
    if(input.query!==undefined&&typeof input.query!=='string')throw new Error('검색어는 문자열이어야 합니다.');
    const options=views.filter(v=>v.group===input.group);const selection=initialSelection(dataset,options);
    $('group').value=selection.key;activeDay=input.day===undefined?'all':String(input.day);$('search').value=input.query||'';render();return {count:filteredBuffs().length,buffs:filteredBuffs().slice(0,60)};
  }})).catch(()=>{});}catch{}
}
updateToday();
setInterval(()=>{updateToday();if(dataset)render();},60000);
loadServer();
