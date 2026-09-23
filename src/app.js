/*
 * Lógica principal
 * Código extraído de TOPS_Conocimiento_V2.2_FULL.html.
 * Se conserva la lógica original; cada función está separada para facilitar búsquedas y cambios.
 */

'use strict';
const CONFIG=window.TOPS_CONFIG || JSON.parse(document.getElementById('app-config').textContent);
function getPdfB64(doc){const el=document.getElementById('pdf-'+doc.id);return el?el.textContent:''}
const APP=CONFIG.app,DOCS=CONFIG.docs,QUESTIONS=CONFIG.questions,RUBRIC=CONFIG.rubric,EQUIPMENT=CONFIG.equipment,TEMPLATES=CONFIG.evaluationTemplates||[],PEOPLE=CONFIG.people||[],ASSIST=CONFIG.assistantIndex||[];
const STORE_KEY='tops_knowledge_data_v3',LEGACY_KEY='tops_pilot_records_v2';
let currentView='home',currentPdfUrl='',currentPdfDoc=null,currentPdfPage=0,selfSession=null,selfQuiz=null,evalMode='sup',selectedSuggestionDoc=null,accessMode='register',mgmtSession=null,mgmtSub='tracking',lastActivity=Date.now(),pendingAuth=null,pendingTargetAuth=null,lastPinError=null;
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}

function toast(t){const e=document.getElementById('toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2600)}

function uuid(prefix){return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9)}

function nowISO(){return new Date().toISOString()}

function emptyData(){return{schemaVersion:6,profiles:{},selfTests:[],supervisorEvals:[],chiefEvals:[],suggestions:[],scopeOverrides:{},profileEvents:[],legacyRecords:[],meta:{createdAt:nowISO(),lastBackupAt:''}}}

function inferTemplateFromZone(z){const t=TEMPLATES.find(x=>x.level==='supervisor_operator'&&x.zone===z);return t?t.id:''}

function migrateData(d){const out=Object.assign(emptyData(),d||{});for(const k of ['selfTests','supervisorEvals','chiefEvals','suggestions','profileEvents','legacyRecords'])if(!Array.isArray(out[k]))out[k]=[];if(!out.profiles||typeof out.profiles!=='object')out.profiles={};if(!out.scopeOverrides||typeof out.scopeOverrides!=='object')out.scopeOverrides={};if(!out.meta||typeof out.meta!=='object')out.meta={};Object.entries(out.profiles).forEach(([code,p])=>{p.code=String(code);p.roles=Array.isArray(p.roles)&&p.roles.length?p.roles:['Trabajador'];p.status=p.status||'active';p.createdAt=p.createdAt||nowISO();p.lastSeenAt=p.lastSeenAt||p.createdAt;p.roleSince=p.roleSince||{};p.roles.forEach(r=>{if(!p.roleSince[r])p.roleSince[r]=p.createdAt});p.updatedAt=p.updatedAt||p.lastSeenAt});out.supervisorEvals.forEach(x=>{x.templateId=x.templateId||inferTemplateFromZone(x.zone);x.templateVersion=x.templateVersion||1});out.chiefEvals.forEach(x=>{x.templateId=x.templateId||'EV-JT-GC';x.templateVersion=x.templateVersion||1});Object.values(out.profiles).forEach(p=>{if(p.personType===undefined)p.personType=inferPersonType(p.code,highestRole(p))});out.schemaVersion=6;return out}

function loadData(){try{return migrateData(JSON.parse(localStorage.getItem(STORE_KEY)||'null'))}catch(e){return emptyData()}}
let DATA=loadData();
function saveData(){DATA.schemaVersion=6;try{localStorage.setItem(STORE_KEY,JSON.stringify(DATA))}catch(e){toast('No se pudo guardar localmente. Exporta un respaldo.')}if(window.TopsSync)window.TopsSync.onSave(DATA)}

function syncNow(){if(window.TopsSync)window.TopsSync.syncNow(DATA);else toast('Sincronización no configurada.')}

function mergeRemoteIntoData(remote){if(!remote)return;const idColl={self_tests:'selfTests',supervisor_evals:'supervisorEvals',chief_evals:'chiefEvals',suggestions:'suggestions',profile_events:'profileEvents',legacy_records:'legacyRecords'};for(const[table,key]of Object.entries(idColl)){const rows=remote[table];if(!rows||!rows.length)continue;const map=new Map(DATA[key].map(r=>[r.id,r]));rows.forEach(r=>{if(!map.has(r.id))map.set(r.id,r)});DATA[key]=[...map.values()]}if(remote.profiles&&remote.profiles.length){const incoming={};remote.profiles.forEach(p=>{incoming[p.code]=p});DATA.profiles=mergeProfiles(DATA.profiles,incoming)}if(remote.scope_overrides&&remote.scope_overrides.length){remote.scope_overrides.forEach(r=>{const cur=DATA.scopeOverrides[r.key];if(!cur||(r.changedAt||'')>=(cur.changedAt||''))DATA.scopeOverrides[r.key]=r})}try{localStorage.setItem(STORE_KEY,JSON.stringify(DATA))}catch(e){}}

function validCode(v){return new RegExp('^\\d{'+APP.workerCodeDigits+'}$').test(String(v||''))}

function validPin(v){return new RegExp('^\\d{'+APP.pinDigits+'}$').test(String(v||''))}

function validDni(v){return new RegExp('^\\d{'+(APP.dniDigits||8)+'}$').test(String(v||''))}

function configPerson(code){return PEOPLE.find(x=>String(x.code)===String(code))||null}

function profile(code){return DATA.profiles[String(code)]||null}

function isInactiveCode(code){const c=configPerson(code),p=profile(code);return !!((c&&c.active===false)||(p&&p.status==='inactive'))}

function roleRank(r){return r==='Jefe'?3:r==='Supervisor'?2:1}

function highestRole(p){const rs=(p&&p.roles)||['Trabajador'];return [...rs].sort((a,b)=>roleRank(b)-roleRank(a))[0]||'Trabajador'}

function addRole(p,role,at){if(!p.roles)p.roles=['Trabajador'];if(!p.roles.includes(role))p.roles.push(role);p.roleSince=p.roleSince||{};if(!p.roleSince[role])p.roleSince[role]=at||nowISO();if(!p.personType)p.personType=inferPersonType(p.code,role);p.updatedAt=nowISO()}

function inferPersonType(code,role){const n=Number(code);if(role==='Supervisor'||role==='Jefe')return'Empleado';if(n>=1000&&n<=5999)return'Obrero';if(n>=6000&&n<=7999)return'Empleado';if(n>=8000&&n<=8900)return'Patrocinado';if(n>=9000&&n<=9999)return'Practicante';return null}

function touchProfile(code,role='Trabajador',source='Uso'){code=String(code||'');if(!validCode(code))return null;let p=DATA.profiles[code];if(!p){const at=nowISO();p={code,roles:['Trabajador'],status:'active',createdAt:at,lastSeenAt:at,updatedAt:at,roleSince:{Trabajador:at},source,personType:inferPersonType(code,role)};DATA.profiles[code]=p}if(role)addRole(p,role);p.lastSeenAt=nowISO();p.updatedAt=nowISO();saveData();return p}

function roleAllowed(code,role){if(isInactiveCode(code))return false;if(role==='Trabajador')return true;if(!APP.secureEvaluatorRoles)return true;const c=configPerson(code);if(!c||c.active===false)return false;if(role==='Supervisor')return c.role==='Supervisor'||c.role==='Jefe';return c.role===role}
async function hashSecret(kind,code,value){const s=kind+'|'+code+'|TOPS|'+value;if(window.crypto&&crypto.subtle){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return'f'+(h>>>0).toString(16)}
async function authenticateExisting(code,pin,role){if(!validCode(code)||!validPin(pin)){toast('Código de 4 dígitos y PIN de 5 dígitos.');return null}if(isInactiveCode(code)){toast('Código inactivo.');return null}const p=profile(code);if(!p||!p.pinHash)return{needsRegistration:true};const ph=await hashSecret('PIN',code,pin);if(p.pinHash!==ph)return{pinIncorrect:true};if(role&&!roleAllowed(code,role)){toast('El código no está habilitado para este nivel.');return null}if(role)addRole(p,role);p.lastSeenAt=nowISO();p.updatedAt=nowISO();saveData();return p}
async function beginLogin(code,pin,role,onSuccess){if(!validCode(code)||!validPin(pin)){toast('Código de 4 dígitos y PIN de 5 dígitos.');return}const r=await authenticateExisting(code,pin,role);if(!r)return;if(r.needsRegistration){pendingAuth={code,pin,role,onSuccess};openAccess('register',code,pin);return}if(r.pinIncorrect){lastPinError={code,role,onSuccess};pinErrorModal.classList.add('show');return}onSuccess(r)}

function ensureEvaluationTargetRegistered(code,role,label,onReady){
code=String(code||'').trim();
if(!validCode(code)){toast('Código de '+label+' inválido.');return}
if(isInactiveCode(code)){toast('El '+label+' está inactivo.');return}
const p=profile(code);
if(p&&p.pinHash){addRole(p,role);p.lastSeenAt=nowISO();p.updatedAt=nowISO();saveData();onReady(p);return}
pendingTargetAuth={code,role,label,onReady};
openAccess('registerTarget',code);
}

function openAccess(mode,preset,presetPin){
accessMode=mode;accessCode.value=validCode(String(preset||''))?String(preset):'';accessDni.value='';accessPin.value='';accessPinWrap.classList.remove('hidden');accessCode.disabled=(mode==='register'&&!!pendingAuth)||mode==='registerTarget';
if(mode==='register'){
accessTitle.textContent='Primer ingreso';
accessHelp.innerHTML='Código nuevo. Ingresa tu <b>DNI</b> para registrar el acceso. El PIN será el que acabas de ingresar.';
accessPinWrap.classList.add('hidden');
}else if(mode==='registerTarget'){
const who=pendingTargetAuth&&pendingTargetAuth.label?pendingTargetAuth.label:'trabajador';
accessTitle.textContent='Registro de '+who;
accessHelp.innerHTML='Este código aún no tiene acceso. Entrega temporalmente la tablet al <b>'+esc(who)+'</b> para que registre su DNI y cree su PIN personal.';
}else if(mode==='reset'){
accessTitle.textContent='Restablecer PIN';
accessHelp.innerHTML='Confirma tu <b>DNI</b> y crea un PIN nuevo de 5 dígitos.';
}else{
accessTitle.textContent='Registrar recuperación';
accessHelp.innerHTML='Tu DNI se usará únicamente para recuperar el PIN en esta tablet.';
accessPinWrap.classList.add('hidden');
}
accessModal.classList.add('show')
}

function startForgotPin(){closeModal('pinErrorModal');if(!lastPinError)return;openAccess('reset',lastPinError.code)}
async function saveAccess(){
const code=accessCode.value.trim(),dni=accessDni.value.trim(),pin=accessPin.value.trim();
if(!validCode(code)){toast('Código de 4 dígitos.');return}
if(!validDni(dni)){toast('DNI de '+(APP.dniDigits||8)+' dígitos.');return}
if(isInactiveCode(code)){toast('Código inactivo.');return}
let p=profile(code);
if(accessMode==='register'){
const chosen=pendingAuth&&pendingAuth.code===code?pendingAuth.pin:pin;
if(!validPin(chosen)){toast('PIN de 5 dígitos.');return}
if(p&&p.pinHash){toast('Ese código ya tiene acceso.');return}
p=touchProfile(code,'Trabajador','Registro');
p.dniHash=await hashSecret('DNI',code,dni);p.pinHash=await hashSecret('PIN',code,chosen);p.credentialCreatedAt=nowISO();p.updatedAt=nowISO();saveData();closeModal('accessModal');
const pa=pendingAuth;pendingAuth=null;toast('Acceso creado.');
if(pa&&pa.onSuccess){if(pa.role)addRole(p,pa.role);saveData();pa.onSuccess(p)}
}else if(accessMode==='registerTarget'){
if(!pendingTargetAuth||pendingTargetAuth.code!==code){toast('No hay un registro pendiente.');return}
if(!validPin(pin)){toast('PIN de 5 dígitos.');return}
if(p&&p.pinHash){toast('Ese código ya tiene acceso.');return}
const pt=pendingTargetAuth;
p=touchProfile(code,pt.role||'Trabajador','Registro desde evaluación');
if(pt.role)addRole(p,pt.role);
p.dniHash=await hashSecret('DNI',code,dni);p.pinHash=await hashSecret('PIN',code,pin);p.credentialCreatedAt=nowISO();p.updatedAt=nowISO();saveData();closeModal('accessModal');pendingTargetAuth=null;toast('Acceso creado. La evaluación puede continuar.');
if(pt.onReady)pt.onReady(p);
}else if(accessMode==='reset'){
if(!validPin(pin)){toast('PIN de 5 dígitos.');return}
if(!p||!p.dniHash){toast('Este perfil no tiene DNI registrado. Requiere recuperación administrativa.');return}
const dh=await hashSecret('DNI',code,dni);if(dh!==p.dniHash){toast('DNI no coincide con el registrado.');return}
p.pinHash=await hashSecret('PIN',code,pin);p.pinResetAt=nowISO();p.updatedAt=nowISO();saveData();closeModal('accessModal');toast('PIN actualizado.');
const pe=lastPinError;lastPinError=null;if(pe&&pe.code===code&&pe.onSuccess){if(pe.role)addRole(p,pe.role);saveData();pe.onSuccess(p)}
}else{
if(!p){toast('Primero crea tu acceso.');return}
p.dniHash=await hashSecret('DNI',code,dni);p.updatedAt=nowISO();saveData();closeModal('accessModal');toast('Recuperación configurada.')
}}

function init(){document.title=APP.name;brandName.textContent=APP.name;appInfo.textContent=`${APP.description} ${APP.version} · ${APP.releaseDate} · ${APP.deviceLabel}`;history.replaceState({view:'home'},'',location.href);initDocs();initSuggestions();resetAssistant(false);migrateLegacy();setupInactivity();if(window.TopsSync&&CONFIG.sync)window.TopsSync.init(CONFIG.sync,()=>DATA,mergeRemoteIntoData)}

function migrateLegacy(){if(DATA.legacyRecords.length)return;try{const x=JSON.parse(localStorage.getItem(LEGACY_KEY)||'[]');if(Array.isArray(x)&&x.length){DATA.legacyRecords=x;saveData()}}catch(e){}}

function secureElement(id){return document.getElementById(id)}

function clearSecureInputs(ids){ids.forEach(id=>{const el=secureElement(id);if(el)el.value=''})}

function resetAuthFlow(){pendingAuth=null;pendingTargetAuth=null;lastPinError=null;accessMode='register';clearSecureInputs(['accessCode','accessDni','accessPin']);const code=secureElement('accessCode');if(code)code.disabled=false;['accessModal','pinErrorModal'].forEach(id=>{const el=secureElement(id);if(el)el.classList.remove('show')})}

function resetSelfAccess(){selfSession=null;selfQuiz=null;renderSelfArea();clearSecureInputs(['selfCode','selfPin']);resetAuthFlow()}

function resetEvalModeAccess(mode){if(mode==='sup'){window._supDraft=null;renderEvalSup()}else if(mode==='chief'){window._chiefDraft=null;renderEvalChief()}else if(mode==='manage'){mgmtSession=null;renderEvalManage()}resetAuthFlow()}

function resetAllEvalAccess(){window._supDraft=null;window._chiefDraft=null;mgmtSession=null;renderEvalSup();renderEvalChief();renderEvalManage();resetAuthFlow()}

function hasProtectedAccessData(){const ids=['selfCode','selfPin','supCode','supPin','supWorker','chiefCode','chiefPin','chiefTarget','mgCode','mgPin','accessCode','accessDni','accessPin'];return !!(selfSession||selfQuiz||mgmtSession||window._supDraft||window._chiefDraft||pendingAuth||pendingTargetAuth||lastPinError||ids.some(id=>{const el=secureElement(id);return el&&String(el.value||'').length>0}))}

function cancelAuthModal(){resetAuthFlow()}

function confirmSessionExit(nextView){if(nextView===currentView)return true;let msg='';if(currentView==='self'&&selfSession){msg=selfQuiz?'¿Seguro que deseas salir? Se cerrará tu sesión y se perderá el progreso del auto test actual.':'¿Seguro que deseas salir? Se cerrará tu sesión.'}else if(currentView==='eval'&&(mgmtSession||window._supDraft||window._chiefDraft)){msg=(window._supDraft||window._chiefDraft)?'¿Seguro que deseas salir? Se cerrará tu sesión y se perderá la evaluación no guardada.':'¿Seguro que deseas salir? Se cerrará tu sesión.'}if(msg&&!confirm(msg))return false;if(currentView==='self')resetSelfAccess();if(currentView==='eval')resetAllEvalAccess();return true}

function navigate(v,push=true,skipGuard=false){if(!document.getElementById('view-'+v))return false;const previous=currentView;if(!skipGuard&&!confirmSessionExit(v))return false;document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));document.getElementById('view-'+v).classList.add('active');document.querySelectorAll('.navitem').forEach(x=>x.classList.toggle('active',x.dataset.view===v));currentView=v;if(push)history.pushState({view:v},'',location.href);if(v==='home'&&previous!=='home')resetAssistant(false);if(v==='docs')renderDocs();if(v==='self')renderSelfArea();if(v==='eval'){renderEvalSup();renderEvalChief();renderEvalManage()}window.scrollTo({top:0,behavior:'instant'});return true}
window.addEventListener('popstate',e=>{if(pdfModal.classList.contains('show')){closePdf(false);return}const v=e.state&&e.state.view?e.state.view:'home';if(!navigate(v,false))history.pushState({view:currentView},'',location.href)});
function setupInactivity(){['click','touchstart','keydown'].forEach(ev=>document.addEventListener(ev,()=>lastActivity=Date.now(),{passive:true}));setInterval(()=>{const lim=(APP.sessionTimeoutMinutes||15)*60000;if(Date.now()-lastActivity>lim){const changed=hasProtectedAccessData();if(changed){resetSelfAccess();resetAllEvalAccess();toast('Sesión y credenciales cerradas por inactividad.')}lastActivity=Date.now()}},60000)}

function assistantKey(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();askAssistant()}}

function resetAssistant(focus=false){assistantLastResults=[];if(typeof assistantQuery!=='undefined'&&assistantQuery)assistantQuery.value='';if(typeof assistantAnswer!=='undefined'&&assistantAnswer)assistantAnswer.innerHTML='<div class="notice">Escribe una consulta. Se mostrarán los documentos y páginas más relacionados.</div>';if(focus&&assistantQuery)assistantQuery.focus()}

function normalizeSearch(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9.%/°º+-]+/g,' ').replace(/\s+/g,' ').trim()}

function assistantTerms(q){const stop=new Set(['como','hacer','cual','cuales','que','donde','cuando','para','por','una','uno','unos','unas','del','las','los','segun','instructivo','maquina','planta','tops','esta','este','esto','con','sin','debe','deben','se','de','la','el','un','en','y','o','a','sirve','funcion','es']);return normalizeSearch(q).split(' ').filter(x=>x.length>2&&!stop.has(x))}

function assistantScore(entry,terms,raw){const text=normalizeSearch(entry.text),title=normalizeSearch(entry.title),meta=normalizeSearch([entry.code,entry.title,entry.zone,entry.equipment,entry.category].join(' ')),phrase=terms.join(' ');let s=0,covered=0;for(const t of terms){let hit=false;if(title.includes(t)){s+=55;hit=true}if(meta.includes(t)){s+=34;hit=true}if(text.includes(t)){s+=11;hit=true}if(hit)covered++}if(phrase.length>4){if(title.includes(phrase))s+=170;if(meta.includes(phrase))s+=110;if(text.includes(phrase))s+=35}const rawN=normalizeSearch(raw);if(entry.code&&rawN.includes(normalizeSearch(entry.code)))s+=220;const ratio=terms.length?covered/terms.length:0;if(ratio===1)s+=90;else if(ratio>=.66)s+=30;else if(terms.length>1)s-=90;return s}
let assistantLastResults=[];
function askAssistant(){const raw=(assistantQuery.value||'').trim();assistantLastResults=[];if(raw.length<3){assistantAnswer.innerHTML='<div class="notice">Escribe una consulta de al menos 3 caracteres.</div>';return}const terms=assistantTerms(raw);if(!terms.length){assistantAnswer.innerHTML='<div class="notice">Agrega el nombre del equipo, operación, parámetro, condición o código.</div>';return}assistantAnswer.innerHTML='<div class="notice">Buscando en los instructivos cargados…</div>';const activeIds=new Set(DOCS.filter(d=>d.active!==false).map(d=>d.id)),byDoc=new Map();for(const e of ASSIST){if(!activeIds.has(e.doc_id))continue;const s=assistantScore(e,terms,raw);if(s<=0)continue;const cur=byDoc.get(e.doc_id);if(!cur||s>cur.s)byDoc.set(e.doc_id,{x:e,s})}const ranked=[...byDoc.values()].sort((a,b)=>b.s-a.s).slice(0,Number(APP.assistantMaxSources||5));if(!ranked.length){assistantAnswer.innerHTML='<div class="notice">No encontré documentos suficientemente relacionados. Prueba con el equipo, código o término exacto.</div>';return}assistantLastResults=ranked.map(r=>r.x);assistantAnswer.innerHTML=`<div class="answercard"><div class="small" style="margin-bottom:8px"><b>${ranked.length} documento${ranked.length===1?'':'s'} relacionado${ranked.length===1?'':'s'}</b> · ordenados por coincidencia</div>${ranked.map((r,i)=>{const e=r.x;return`<div class="sourceitem"><b>${esc(e.title)}</b><div class="sourcepage">${esc(e.code)} · Rev. ${esc(e.revision)} · ${e.page?'pág. '+e.page:'documento completo'}</div><div class="sourcepage">${esc(e.zone||'Planta Tops')} · ${esc(e.equipment||'General')}</div><button class="sourcebtn" onclick="showAssistantSource(${i})">${e.page?'Abrir pág. '+e.page:'Abrir documento'}</button></div>`}).join('')}</div>`}

function showAssistantSource(i){const e=assistantLastResults[Number(i)];if(!e)return;openDoc(e.doc_id,Number(e.page||0))}

function fill(sel,vals,all){sel.innerHTML=(all!==undefined?`<option value="">${esc(all)}</option>`:'')+vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}

function docZones(d){return d.zones&&d.zones.length?d.zones:[d.zone||'Planta Tops']}

function initDocs(){fill(docZone,[...new Set(DOCS.flatMap(docZones))].sort(),'Todas las zonas');fill(docCat,[...new Set(DOCS.map(d=>d.category))].sort(),'Todas las categorías')}

function renderDocs(){const q=(docSearch.value||'').toLowerCase().trim(),z=docZone.value,c=docCat.value;let arr=DOCS.filter(d=>d.active!==false).filter(d=>(!z||docZones(d).includes(z))&&(!c||d.category===c));if(q)arr=arr.filter(d=>[d.code,d.title,d.proposed_name,d.equipment,d.keywords,d.file].join(' ').toLowerCase().includes(q));docCount.textContent=`${arr.length} documento${arr.length===1?'':'s'}`;docList.innerHTML=arr.slice(0,250).map(d=>`<div class="doccard"><div class="docname">${esc(d.proposed_name||d.title)}</div><div class="docmeta">${esc(d.code)} · Rev. ${esc(d.revision)} · ${esc(d.equipment||'General')}</div><div class="chips">${docZones(d).map(x=>`<span class="chip">${esc(x)}</span>`).join('')}<span class="chip">${esc(d.category)}</span></div><div class="docactions"><button class="btn" onclick="openDoc('${esc(d.id)}')">Abrir PDF</button></div></div>`).join('')||'<div class="notice">No se encontraron documentos.</div>'}

function b64Blob(b64,type='application/pdf'){const bin=atob(b64),chunk=1024,arr=[];for(let i=0;i<bin.length;i+=chunk){const s=bin.slice(i,i+chunk),u=new Uint8Array(s.length);for(let j=0;j<s.length;j++)u[j]=s.charCodeAt(j);arr.push(u)}return new Blob(arr,{type})}

function openDoc(id,page=0){const d=DOCS.find(x=>x.id===id);if(!d)return;const b64=getPdfB64(d);if(currentPdfUrl&&currentPdfUrl.startsWith('blob:'))URL.revokeObjectURL(currentPdfUrl);const relativePath=d.app_file||`docs/${d.file}`;currentPdfUrl=b64?URL.createObjectURL(b64Blob(b64)):new URL(relativePath,document.baseURI).href;currentPdfDoc=d;currentPdfPage=Number(page)||0;pdfTitle.textContent=(d.proposed_name||d.title);pdfPageHint.textContent=currentPdfPage?`Fuente indicada: página ${currentPdfPage}`:'Documento completo';const target=currentPdfUrl+(currentPdfPage?'#page='+currentPdfPage+'&view=FitH':'#view=FitH');pdfFrame.src='about:blank';pdfModal.classList.add('show');requestAnimationFrame(()=>{pdfFrame.src=target});history.pushState({view:currentView,pdf:true},'',location.href)}

function closePdf(back=true){pdfModal.classList.remove('show');pdfFrame.src='about:blank';if(back&&history.state&&history.state.pdf)history.back()}

function openPdfExternal(){if(!currentPdfUrl)return;const a=document.createElement('a');a.href=currentPdfUrl+(currentPdfPage?'#page='+currentPdfPage:'');a.target='_blank';a.rel='noopener';document.body.appendChild(a);a.click();a.remove()}

function openSource(codeText,page=0){const code=String(codeText||'').split('|')[0].trim(),d=DOCS.find(x=>x.code===code);if(d)openDoc(d.id,page);else{navigate('docs');docSearch.value=code;renderDocs()}}

function resolvedQuestionPage(q){if(!q)return 0;const preferred=Number(q.source_page||0),did=q.source_doc_id||(DOCS.find(d=>d.code===(q.source_primary_code||String(q.source_code||'').split('|')[0].trim()))||{}).id,entries=ASSIST.filter(e=>e.doc_id===did&&Number(e.page||0)>0);if(!entries.length)return preferred;const c=normalizeSearch(q.correct||''),ctx=normalizeSearch(q.source_context||''),ct=assistantTerms(q.correct||''),xt=assistantTerms(q.source_context||'').slice(0,45);let best={page:preferred,score:-1};for(const e of entries){const t=normalizeSearch(e.text);let s=0;if(c&&c.length>=8&&t.includes(c))s+=2200;else if(c){const frag=c.split(' ').slice(0,10).join(' ');if(frag.length>=12&&t.includes(frag))s+=900}if(ct.length){const h=ct.filter(x=>t.includes(x)).length;s+=h*34+(h/ct.length)*300}if(xt.length){const h=xt.filter(x=>t.includes(x)).length;s+=h*8+(h/xt.length)*260}if(Number(e.page)===preferred)s+=12;if(s>best.score)best={page:Number(e.page),score:s}}return best.score>=45?best.page:preferred}

function openQuestionSource(id){const q=QUESTIONS.find(x=>x.id===id);if(!q)return;const code=q.source_primary_code||String(q.source_code||'').split('|')[0].trim(),d=DOCS.find(x=>x.id===q.source_doc_id)||DOCS.find(x=>x.code===code);if(!d){openSource(code);return}openDoc(d.id,Number(q.source_page||0)||resolvedQuestionPage(q))}

function closeModal(id){document.getElementById(id).classList.remove('show');if(id==='accessModal'&&accessMode==='registerTarget')pendingTargetAuth=null}

function openDataModal(){const n=DATA.selfTests.length+DATA.supervisorEvals.length+DATA.chiefEvals.length+DATA.suggestions.length;const active=Object.values(DATA.profiles).filter(p=>p.status!=='inactive').length;dataInfo.innerHTML=`Registros locales: <b>${n}</b> · Personas activas: <b>${active}</b><br><span class="small">Último respaldo: ${DATA.meta.lastBackupAt?new Date(DATA.meta.lastBackupAt).toLocaleString():'sin respaldo registrado'}. Antes de reemplazar el HTML, exporta un respaldo.</span>`;dataModal.classList.add('show')}
// SELF TEST
async function selfLogin(){const code=selfCode.value.trim(),pin=selfPin.value.trim();beginLogin(code,pin,'Trabajador',()=>{selfSession={code};clearSecureInputs(['selfCode','selfPin']);renderSelfArea()})}

function selfLogout(){resetSelfAccess()}

function selfHistory(code){return DATA.selfTests.filter(x=>x.workerCode===code).sort((a,b)=>a.timestamp.localeCompare(b.timestamp))}

function renderSelfArea(){if(!selfSession){document.getElementById('selfLogin').classList.remove('hidden');document.getElementById('selfArea').classList.add('hidden');return}document.getElementById('selfLogin').classList.add('hidden');document.getElementById('selfArea').classList.remove('hidden');if(selfQuiz){renderQuiz();return}const p=profile(selfSession.code),hist=selfHistory(selfSession.code),last=hist.slice(-1)[0],avg=hist.length?Math.round(hist.reduce((s,x)=>s+x.score,0)/hist.length):null,zones=[...new Set(QUESTIONS.filter(q=>q.active&&q.type==='mcq').flatMap(q=>q.zones||[q.zone]))].sort();selfArea.innerHTML=`<div class="profilebar"><div><b>Código ${esc(selfSession.code)}</b><div class="small">Entrenamiento personal</div></div><button class="btn secondary" onclick="selfLogout()">Salir</button></div><div class="metricgrid"><div class="metric"><div class="n">${hist.length}</div><div class="l">auto tests</div></div><div class="metric"><div class="n">${avg===null?'—':avg+'%'}</div><div class="l">promedio</div></div><div class="metric"><div class="n">${last?last.score+'%':'—'}</div><div class="l">último</div></div></div>${renderTrend(hist)}<div class="section"><h3>Nuevo auto test</h3><div class="filters"><div class="field"><label>Zona</label><select id="quizZone"><option value="">Todas</option>${zones.map(x=>`<option>${esc(x)}</option>`).join('')}</select></div><div class="field"><label>Tema</label><select id="quizCat"><option value="">Todos</option>${CONFIG.knowledgeCategories.map(x=>`<option>${esc(x)}</option>`).join('')}</select></div><div class="field"><label>Preguntas</label><select id="quizLen"><option value="5" selected>5</option></select></div></div><button class="btn" onclick="startQuiz()">Iniciar</button></div>`}

function renderTrend(hist){const a=hist.slice(-8);if(!a.length)return'<div class="notice">Tu progreso aparecerá aquí después del primer auto test.</div>';return`<div class="section"><h3>Mi progreso</h3><div class="trend">${a.map(x=>`<div class="trendbar ${x.score>=80?'good':''}" style="height:${Math.max(8,x.score)}%"><span>${x.score}</span></div>`).join('')}</div></div>`}

function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}

function balancedQuestionPick(pool,n,recentIds=[]){const recent=new Set(recentIds||[]),fresh=pool.filter(q=>!recent.has(q.id)),base=fresh.length>=n?fresh:pool;const tech=shuffle(base.filter(q=>(q.knowledge_type||'technical')==='technical')),proc=shuffle(base.filter(q=>q.knowledge_type==='process'));const nt=Math.min(Math.round(n*.60),tech.length),np=Math.min(n-nt,proc.length);let pick=[...tech.slice(0,nt),...proc.slice(0,np)],used=new Set(pick.map(q=>q.id));if(pick.length<n)pick.push(...shuffle(base.filter(q=>!used.has(q.id))).slice(0,n-pick.length));return shuffle(pick).slice(0,Math.min(n,base.length))}

function startQuiz(){const z=quizZone.value,c=quizCat.value,n=Number(quizLen.value)||10;let pool=QUESTIONS.filter(q=>q.active&&q.type==='mcq'&&q.level!=='supervisor'&&(!z||(q.zones||[q.zone]).includes(z))&&(!c||q.category===c));if(pool.length<n&&z)pool=QUESTIONS.filter(q=>q.active&&q.type==='mcq'&&q.level!=='supervisor'&&(q.zones||[q.zone]).includes(z));if(!pool.length){toast('No hay preguntas activas para ese filtro.');return}const recent=DATA.selfTests.filter(x=>x.workerCode===selfSession.code).slice(-3).flatMap(x=>x.questionIds||[]);const pick=balancedQuestionPick(pool,n,recent);selfQuiz={questions:pick,index:0,answers:[],zone:z,category:c,startedAt:nowISO()};renderQuiz()}

function renderQuiz(){const q=selfQuiz.questions[selfQuiz.index];if(!q){finishQuiz();return}const ans=selfQuiz.answers[selfQuiz.index];selfArea.innerHTML=`<div class="profilebar"><div><b>${selfQuiz.index+1} / ${selfQuiz.questions.length}</b><div class="small">${esc(q.zone)} · ${esc(q.topic)}</div></div><button class="btn secondary" onclick="cancelQuiz()">Salir</button></div><div class="quizcard"><div class="qtag">${esc(q.source_code)} · Rev. ${esc(q.source_revision)} · pág. ${q.source_page||'s/p'}</div><div class="qtext">${esc(q.prompt)}</div><div class="options">${q.options.map((o,i)=>`<button class="option ${ans?(i===q.correct_index?'correct':(ans.choice===i?'wrong':'')):''}" ${ans?'disabled':''} onclick="answerQuiz(${i})">${esc(o)}</button>`).join('')}</div>${ans?`<div class="feedback ${ans.correct?'good':'bad'}"><b>${ans.correct?'Correcto':'Para repasar'}</b><div style="margin-top:6px">${esc(q.explanation)}</div><div class="btnrow"><button class="btn secondary" onclick="openQuestionSource('${q.id}')">Ver instructivo</button><button class="btn" onclick="nextQuiz()">${selfQuiz.index+1===selfQuiz.questions.length?'Ver resultado':'Siguiente'}</button></div></div>`:''}</div>`}

function answerQuiz(i){if(selfQuiz.answers[selfQuiz.index])return;const q=selfQuiz.questions[selfQuiz.index];selfQuiz.answers[selfQuiz.index]={questionId:q.id,questionVersion:q.version||1,choice:i,choiceText:q.options[i],correct:i===q.correct_index,correctText:q.correct,displayedOptions:[...q.options]};renderQuiz()}

function nextQuiz(){selfQuiz.index++;if(selfQuiz.index>=selfQuiz.questions.length)finishQuiz();else renderQuiz()}

function cancelQuiz(){if(confirm('¿Salir del auto test actual?')){selfQuiz=null;renderSelfArea()}}

function finishQuiz(){const ok=selfQuiz.answers.filter(x=>x.correct).length,total=selfQuiz.questions.length,score=Math.round(ok/total*100),rec={id:uuid('AT'),timestamp:nowISO(),workerCode:selfSession.code,score,correct:ok,total,zone:selfQuiz.zone||'',category:selfQuiz.category||'',questionIds:selfQuiz.questions.map(x=>x.id),questionSnapshots:selfQuiz.questions.map(q=>({id:q.id,version:q.version||1,prompt:q.prompt,source_code:q.source_code,source_revision:q.source_revision})),answers:selfQuiz.answers,appVersion:APP.version,device:APP.deviceLabel};DATA.selfTests.push(rec);saveData();selfQuiz=null;selfArea.innerHTML=`<div class="resultbig"><div class="score">${score}%</div><h3>${score>=80?'Buen dominio':'Hay temas para repasar'}</h3><div class="small">${ok} de ${total} respuestas correctas.</div><div class="btnrow" style="justify-content:center"><button class="btn" onclick="renderSelfArea()">Continuar</button></div></div>`}
// EVALUATION
function evalTab(m){if(m===evalMode)return;if(evalMode==='manage'&&mgmtSession){if(!confirm('¿Seguro que deseas salir? Se cerrará tu sesión.'))return}if(evalMode==='sup'&&window._supDraft){if(!confirm('¿Seguro que deseas salir? Se perderá la evaluación no guardada.'))return}if(evalMode==='chief'&&window._chiefDraft){if(!confirm('¿Seguro que deseas salir? Se perderá la evaluación no guardada.'))return}resetAllEvalAccess();evalMode=m;['sup','chief','manage'].forEach(x=>{document.getElementById('eval'+(x==='sup'?'Sup':x==='chief'?'Chief':'Manage')).classList.toggle('hidden',x!==m);document.getElementById('tab'+(x==='sup'?'Sup':x==='chief'?'Chief':'Manage')).classList.toggle('active',x===m)})}

function lineOptions(){return Object.keys(EQUIPMENT).map(x=>`<option>${esc(x)}</option>`).join('')}

function zoneOptions(){return['Rompedoras','Integradas','Prensas'].map(x=>`<option>${x}</option>`).join('')}

function templateByZone(zone){return TEMPLATES.find(x=>x.active!==false&&x.level==='supervisor_operator'&&x.zone===zone)}

function templateById(id){return TEMPLATES.find(x=>x.id===id)}

function renderEvalSup(){evalSup.innerHTML=`<div class="section"><h3>Supervisor → Operador</h3><div class="filters"><div class="field"><label>Código supervisor</label><input id="supCode" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="4 dígitos"/></div><div class="field"><label>PIN supervisor</label><input id="supPin" type="password" autocomplete="new-password" inputmode="numeric" maxlength="5" placeholder="5 dígitos"/></div><div class="field"><label>Código operador</label><input id="supWorker" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="4 dígitos"/></div><div class="field"><label>Línea</label><select id="supLine" onchange="syncSupMachine()">${lineOptions()}</select></div><div class="field"><label>Zona</label><select id="supZone" onchange="syncSupMachine();showSupPeriod()">${zoneOptions()}</select></div><div class="field"><label>Equipo</label><select id="supMachine"></select></div></div><div class="notice compact" id="supPeriod"></div><div class="btnrow"><button class="btn" onclick="startSupervisorEval()">Iniciar evaluación</button></div></div><div id="supEvalArea"></div>`;syncSupMachine();showSupPeriod()}

function syncSupMachine(){if(!supLine||!supZone||!supMachine)return;fill(supMachine,(EQUIPMENT[supLine.value]&&EQUIPMENT[supLine.value][supZone.value])||[],'General de zona')}

function showSupPeriod(){const t=templateByZone(supZone&&supZone.value);if(supPeriod)supPeriod.innerHTML=t?`<b>${esc(t.title)}</b> · Referencia: ${esc(t.periodicity)}`:'Evaluación técnica.'}

function activateScope(code,templateId,at,by){const k=code+'|'+templateId,cur=DATA.scopeOverrides[k];DATA.scopeOverrides[k]={active:true,startAt:(cur&&cur.startAt)||at||nowISO(),changedAt:nowISO(),changedBy:by||'',reason:'Evaluación realizada'}}
async function startSupervisorEval(){const vals={code:supCode.value.trim(),pin:supPin.value.trim(),worker:supWorker.value.trim(),line:supLine.value,zone:supZone.value,machine:supMachine.value};if(!validCode(vals.worker)){toast('Código de operador inválido.');return}beginLogin(vals.code,vals.pin,'Supervisor',()=>{clearSecureInputs(['supCode','supPin']);ensureEvaluationTargetRegistered(vals.worker,'Trabajador','operador',()=>continueSupervisorEval(vals))})}

function continueSupervisorEval(v){const {code,worker,line,zone,machine}=v;if(!validCode(worker)){toast('Código de operador inválido.');return}if(isInactiveCode(worker)){toast('El operador está inactivo.');return}const wp=profile(worker);if(!wp||!wp.pinHash){ensureEvaluationTargetRegistered(worker,'Trabajador','operador',()=>continueSupervisorEval(v));return}addRole(wp,'Trabajador');wp.lastSeenAt=nowISO();wp.updatedAt=nowISO();saveData();const t=templateByZone(zone);if(!t){toast('No hay una evaluación activa para esa zona.');return}let pool=QUESTIONS.filter(q=>q.active&&q.type==='mcq'&&(q.zones||[q.zone]).includes(zone));if(pool.length<15){toast('No hay al menos 15 preguntas activas para esta zona.');return}const recent=DATA.supervisorEvals.filter(x=>x.workerCode===worker&&x.zone===zone).slice(-2).flatMap(x=>(x.items||[]).map(i=>i.questionId));const qs=balancedQuestionPick(pool,Number(APP.supervisorEvaluationLength||15),recent);window._supDraft={templateId:t.id,templateVersion:t.version||1,evaluatorCode:code,workerCode:worker,line,zone,machine,items:qs.map(q=>({questionId:q.id,questionVersion:q.version||1,prompt:q.prompt,source_code:q.source_code,source_revision:q.source_revision,source_page:q.source_page||0,knowledge_type:q.knowledge_type||'technical',result:''}))};renderSupDraft(qs,t)}

function renderSupDraft(qs,t){const d=window._supDraft;supEvalArea.innerHTML=`<div class="profilebar"><div><b>${esc(d.zone)} · ${esc(d.workerCode)}</b><div class="small">${esc(d.line)} · ${esc(d.machine||'General')} · ${esc(t.periodicity)} · 15 preguntas aleatorias</div></div></div>${qs.map((q,i)=>`<div class="evalitem"><div class="qtag">${esc(q.knowledge_type==='process'?'Proceso':'Técnico')} · ${esc(q.source_code)} · pág. ${q.source_page||'s/p'}</div><div class="prompt">${esc(q.prompt)}</div><div class="btnrow"><button class="btn soft" onclick="toggleExpected(this)">Ver respuesta esperada</button><button class="btn secondary" onclick="openQuestionSource('${q.id}')">Ver instructivo</button></div><div class="expected">${esc(q.correct)}</div><div class="seg"><button onclick="setSupResult(${i},'Domina',this)">Domina</button><button onclick="setSupResult(${i},'Requiere refuerzo',this)">Requiere refuerzo</button><button onclick="setSupResult(${i},'No observado',this)">No observado</button></div></div>`).join('')}<div class="section"><div class="field"><label>Comentario general (opcional)</label><textarea id="supComment"></textarea></div><div class="btnrow"><button class="btn" onclick="saveSupervisorEval()">Guardar evaluación</button></div></div>`}

function toggleExpected(b){const box=b.closest('.evalitem');const e=box?box.querySelector('.expected'):null;if(!e)return;e.style.display=e.style.display==='block'?'none':'block'}

function setSupResult(i,r,b){window._supDraft.items[i].result=r;b.parentElement.querySelectorAll('button').forEach(x=>x.className='');b.classList.add('sel',r==='Domina'?'good':r==='Requiere refuerzo'?'warn':'na')}

function saveSupervisorEval(){const d=window._supDraft;if(!d)return;if(d.items.some(x=>!x.result)){toast('Responde todos los puntos.');return}const obs=d.items.filter(x=>x.result!=='No observado'),dom=obs.filter(x=>x.result==='Domina').length,score=obs.length?Math.round(dom/obs.length*100):null,ts=nowISO();DATA.supervisorEvals.push({...d,id:uuid('EVS'),timestamp:ts,score,comment:supComment.value.trim(),appVersion:APP.version,device:APP.deviceLabel});activateScope(d.workerCode,d.templateId,ts,d.evaluatorCode);saveData();toast('Evaluación guardada');window._supDraft=null;renderEvalSup()}

function renderEvalChief(){const t=templateById('EV-JT-GC');evalChief.innerHTML=`<div class="section"><h3>Jefatura → Supervisor</h3><div class="filters"><div class="field"><label>Código Jefatura</label><input id="chiefCode" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="4 dígitos"/></div><div class="field"><label>PIN</label><input id="chiefPin" type="password" autocomplete="new-password" inputmode="numeric" maxlength="5" placeholder="5 dígitos"/></div><div class="field"><label>Código supervisor</label><input id="chiefTarget" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="4 dígitos"/></div><div class="field"><label>Línea / alcance</label><select id="chiefLine"><option value="">General</option>${lineOptions()}</select></div><div class="field"><label>Zona / alcance</label><select id="chiefZone"><option value="">General</option>${zoneOptions()}</select></div></div><div class="notice compact"><b>${esc(t?t.title:'Gestión de conocimiento')}</b> · Referencia: ${esc(t?t.periodicity:'A demanda')}</div><div class="btnrow"><button class="btn" onclick="startChiefEval()">Iniciar evaluación</button></div></div><div id="chiefEvalArea"></div>`}
async function startChiefEval(){const vals={code:chiefCode.value.trim(),pin:chiefPin.value.trim(),target:chiefTarget.value.trim(),line:chiefLine.value,zone:chiefZone.value};if(!validCode(vals.target)){toast('Código de supervisor inválido.');return}beginLogin(vals.code,vals.pin,'Jefe',()=>{clearSecureInputs(['chiefCode','chiefPin']);ensureEvaluationTargetRegistered(vals.target,'Supervisor','supervisor',()=>continueChiefEval(vals))})}

function continueChiefEval(v){const {code,target,line,zone}=v;if(!validCode(target)){toast('Código de supervisor inválido.');return}if(isInactiveCode(target)){toast('El supervisor está inactivo.');return}const tp=profile(target);if(!tp||!tp.pinHash){ensureEvaluationTargetRegistered(target,'Supervisor','supervisor',()=>continueChiefEval(v));return}addRole(tp,'Supervisor');tp.lastSeenAt=nowISO();tp.updatedAt=nowISO();saveData();const t=templateById('EV-JT-GC');window._chiefDraft={templateId:t?t.id:'EV-JT-GC',templateVersion:t?t.version||1:1,evaluatorCode:code,supervisorCode:target,line,zone,items:RUBRIC.filter(x=>x.active!==false).map(x=>({rubricId:x.id,rubricVersion:x.version||1,dimension:x.dimension,criterion:x.criterion,result:''}))};chiefEvalArea.innerHTML=`<div class="profilebar"><div><b>Supervisor ${esc(target)}</b><div class="small">${esc(t?t.periodicity:'')}</div></div></div>${RUBRIC.filter(x=>x.active!==false).map((r,i)=>`<div class="evalitem"><div class="qtag">${esc(r.dimension)}</div><div class="prompt">${esc(r.criterion)}</div><div class="seg"><button onclick="setChiefResult(${i},'Consistente',this)">Consistente</button><button onclick="setChiefResult(${i},'En desarrollo',this)">En desarrollo</button><button onclick="setChiefResult(${i},'No observado',this)">No observado</button></div></div>`).join('')}<div class="section"><div class="field"><label>Comentario general (opcional)</label><textarea id="chiefComment"></textarea></div><button class="btn" onclick="saveChiefEval()">Guardar evaluación</button></div>`}

function setChiefResult(i,r,b){window._chiefDraft.items[i].result=r;b.parentElement.querySelectorAll('button').forEach(x=>x.className='');b.classList.add('sel',r==='Consistente'?'good':r==='En desarrollo'?'warn':'na')}

function saveChiefEval(){const d=window._chiefDraft;if(!d)return;if(d.items.some(x=>!x.result)){toast('Responde todos los puntos.');return}const obs=d.items.filter(x=>x.result!=='No observado'),ok=obs.filter(x=>x.result==='Consistente').length,score=obs.length?Math.round(ok/obs.length*100):null,ts=nowISO();DATA.chiefEvals.push({...d,id:uuid('EVJ'),timestamp:ts,score,comment:chiefComment.value.trim(),appVersion:APP.version,device:APP.deviceLabel});activateScope(d.supervisorCode,d.templateId,ts,d.evaluatorCode);saveData();toast('Evaluación guardada');window._chiefDraft=null;renderEvalChief()}
// MANAGEMENT / FOLLOW-UP
function renderEvalManage(){if(!mgmtSession){evalManage.innerHTML=`<div class="section loginbox"><h3>Gestión</h3><div class="filters"><div class="field"><label>Código</label><input id="mgCode" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="4 dígitos"/></div><div class="field"><label>PIN</label><input id="mgPin" type="password" autocomplete="new-password" inputmode="numeric" maxlength="5" placeholder="5 dígitos"/></div><div class="field"><label>Nivel</label><select id="mgRole"><option>Supervisor</option><option>Jefe</option></select></div></div><div class="btnrow"><button class="btn" onclick="managementLogin()">Ingresar</button></div></div>`;return}renderManagement()}
async function managementLogin(){const code=mgCode.value.trim(),pin=mgPin.value.trim(),role=mgRole.value;beginLogin(code,pin,role,()=>{mgmtSession={code,role};mgmtSub='tracking';renderManagement()})}

function managementLogout(){resetEvalModeAccess('manage')}

function mgmtTab(x){mgmtSub=x;renderManagement()}

function renderManagement(){evalManage.innerHTML=`<div class="profilebar"><div><b>${esc(mgmtSession.role)} ${esc(mgmtSession.code)}</b><div class="small">Seguimiento local de conocimiento</div></div><button class="btn secondary" onclick="managementLogout()">Salir</button></div><div class="mgmtbar"><button class="tab ${mgmtSub==='tracking'?'active':''}" onclick="mgmtTab('tracking')">Seguimiento</button><button class="tab ${mgmtSub==='people'?'active':''}" onclick="mgmtTab('people')">Personas</button></div><div id="mgmtContent"></div>`;if(mgmtSub==='tracking')renderTracking();else renderPeopleManagement()}

function yearsAvailable(){const ys=new Set([new Date().getFullYear()]);[...DATA.supervisorEvals,...DATA.chiefEvals].forEach(x=>ys.add(new Date(x.timestamp).getFullYear()));return [...ys].sort((a,b)=>b-a)}

function evalsFor(level,code){return level==='operator'?DATA.supervisorEvals.filter(x=>x.workerCode===code):DATA.chiefEvals.filter(x=>x.supervisorCode===code)}

function scopeKey(code,tid){return code+'|'+tid}

function inferredScopes(code,level){if(level==='supervisor'){const t=TEMPLATES.find(x=>x.level==='chief_supervisor'&&x.active!==false);if(!t)return[];const p=profile(code),at=(p&&p.roleSince&&p.roleSince.Supervisor)||p?.createdAt||nowISO(),ov=DATA.scopeOverrides[scopeKey(code,t.id)];if(ov&&ov.active===false)return[];return[{template:t,startAt:(ov&&ov.startAt)||at,override:ov||null}]}const map=new Map();DATA.supervisorEvals.filter(x=>x.workerCode===code).forEach(x=>{const tid=x.templateId||inferTemplateFromZone(x.zone),t=templateById(tid);if(!t)return;const cur=map.get(tid);if(!cur||x.timestamp<cur.startAt)map.set(tid,{template:t,startAt:x.timestamp})});Object.entries(DATA.scopeOverrides).forEach(([k,ov])=>{if(!k.startsWith(code+'|'))return;const tid=k.slice(code.length+1),t=templateById(tid);if(!t||t.level!=='supervisor_operator')return;if(ov.active===false)map.delete(tid);else map.set(tid,{template:t,startAt:ov.startAt||map.get(tid)?.startAt||nowISO(),override:ov})});return[...map.values()]}

function periodDefs(template,year){const p=template.periodicity||'Anual',defs=[];function add(label,sm,sd,em,ed,key){defs.push({label,key:`${year}-${key}`,start:new Date(year,sm,sd,0,0,0),end:new Date(year,em,ed,23,59,59)})}if(p==='Semestral'){add('S1',0,1,5,30,'S1');add('S2',6,1,11,31,'S2')}else if(p==='Trimestral'){add('T1',0,1,2,31,'T1');add('T2',3,1,5,30,'T2');add('T3',6,1,8,30,'T3');add('T4',9,1,11,31,'T4')}else if(p==='Sin control'||p==='A demanda'){}else add('Año',0,1,11,31,'A');return defs}

function coverageFor(code,level,year){const scopes=inferredScopes(code,level),now=new Date(),currentYear=now.getFullYear(),evals=evalsFor(level,code),items=[];if(!scopes.length)return{status:'Pendiente',done:0,required:1,items:[],initial:true};for(const sc of scopes){for(const pd of periodDefs(sc.template,year)){if(pd.end<new Date(sc.startAt)||year>currentYear||(year===currentYear&&pd.start>now))continue;const done=evals.some(e=>(e.templateId||inferTemplateFromZone(e.zone))===sc.template.id&&new Date(e.timestamp)>=pd.start&&new Date(e.timestamp)<=pd.end),status=done?'Evaluado':((year<currentYear||pd.end<now)?'Vencido':'Pendiente');items.push({template:sc.template,period:pd,status,done})}}if(!items.length)return{status:'Pendiente',done:0,required:1,items:[],initial:true};const rank={'Vencido':3,'Pendiente':2,'Evaluado':1},status=[...items].sort((a,b)=>rank[b.status]-rank[a.status])[0].status;return{status,done:items.filter(x=>x.done).length,required:items.length,items,initial:false}}

function statusClass(s){return s==='Evaluado'?'ok':s==='Vencido'?'bad':s==='Pendiente'?'warn':'na'}

function levelOfProfile(p){return highestRole(p)==='Supervisor'?'supervisor':highestRole(p)==='Jefe'?'chief':'operator'}

function trackingPeople(level){return Object.values(DATA.profiles).filter(p=>p.status!=='inactive').filter(p=>level==='operator'?highestRole(p)==='Trabajador':p.roles&&p.roles.includes('Supervisor')&&!p.roles.includes('Jefe'))}

function trackingRow(p,level,year){const ev=evalsFor(level,p.code).filter(x=>new Date(x.timestamp).getFullYear()===year),last=[...evalsFor(level,p.code)].sort((a,b)=>b.timestamp.localeCompare(a.timestamp))[0],scores=ev.filter(x=>x.score!==null&&x.score!==undefined),avg=scores.length?Math.round(scores.reduce((s,x)=>s+x.score,0)/scores.length):null,cov=coverageFor(p.code,level,year);return{p,level,year,ev,last,avg,cov}}

function renderTracking(){const isChief=mgmtSession.role==='Jefe',years=yearsAvailable();mgmtContent.innerHTML=`<div class="section"><div class="filter5"><div class="field"><label>Año</label><select id="trkYear" onchange="renderTrackingRows()">${years.map(y=>`<option ${y===new Date().getFullYear()?'selected':''}>${y}</option>`).join('')}</select></div>${isChief?`<div class="field"><label>Nivel</label><select id="trkLevel" onchange="renderTrackingRows()"><option value="operator">Operadores</option><option value="supervisor">Supervisores</option></select></div>`:'<input id="trkLevel" type="hidden" value="operator"/>'}<div class="field"><label>Código</label><input id="trkCode" oninput="renderTrackingRows()" placeholder="Buscar código"/></div><div class="field"><label>Estado</label><select id="trkStatus" onchange="renderTrackingRows()"><option value="">Todos</option><option>Evaluado</option><option>Pendiente</option><option>Vencido</option></select></div><div class="field"><label>Zona</label><select id="trkZone" onchange="renderTrackingRows()"><option value="">Todas</option>${zoneOptions()}</select></div></div></div><div id="trackingSummary"></div><div id="trackingRows"></div>`;renderTrackingRows()}

function renderTrackingRows(){const year=Number(trkYear.value),level=trkLevel.value||'operator',code=(trkCode.value||'').trim(),status=trkStatus.value,zone=trkZone.value;let rows=trackingPeople(level).map(p=>trackingRow(p,level,year));if(code)rows=rows.filter(r=>r.p.code.includes(code));if(status)rows=rows.filter(r=>r.cov.status===status);if(zone)rows=rows.filter(r=>inferredScopes(r.p.code,level).some(s=>s.template.zone===zone)||r.ev.some(e=>e.zone===zone));const pending=rows.filter(r=>r.cov.status!=='Evaluado').length,evaluated=rows.filter(r=>r.cov.status==='Evaluado').length;trackingSummary.innerHTML=`<div class="metricgrid"><div class="metric"><div class="n">${rows.length}</div><div class="l">personas</div></div><div class="metric"><div class="n">${evaluated}</div><div class="l">al día</div></div><div class="metric"><div class="n">${pending}</div><div class="l">con pendiente</div></div></div>`;trackingRows.innerHTML=rows.length?rows.map(r=>personTrackingHtml(r)).join(''):'<div class="notice">No hay personas para estos filtros.</div>'}

function personTrackingHtml(r){const evCount=r.ev.length,lastDate=r.last?new Date(r.last.timestamp).toLocaleDateString():'—',lastEval=r.last?(r.last.evaluatorCode||'—'):'—';return`<div class="personrow" id="pr-${esc(r.p.code)}"><div class="personhead"><b>${esc(r.p.code)}</b><span class="status ${statusClass(r.cov.status)}">${esc(r.cov.status)}</span><span class="hide-xs">${lastDate}</span><span>${evCount}</span><span class="hide-sm">${r.avg===null?'—':r.avg+'%'}</span><button class="btn secondary" onclick="togglePersonDetail('${esc(r.p.code)}','${esc(r.level)}',${r.year})">Detalle</button></div><div class="persondetail" id="pd-${esc(r.p.code)}"></div></div>`}

function togglePersonDetail(code,level,year){const row=document.getElementById('pr-'+code),box=document.getElementById('pd-'+code),opening=!row.classList.contains('open');document.querySelectorAll('.personrow.open').forEach(x=>x.classList.remove('open'));if(!opening)return;row.classList.add('open');const ev=[...evalsFor(level,code)].filter(x=>new Date(x.timestamp).getFullYear()===year).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)),cov=coverageFor(code,level,year),scopes=inferredScopes(code,level);box.innerHTML=`<div class="twocol"><div><h3 style="margin-top:0">Cobertura</h3><div class="periodlist">${cov.items.length?cov.items.map(i=>`<div class="perioditem"><span><b>${esc(i.template.title)}</b><div class="tiny">${esc(i.template.periodicity)} · ${esc(i.period.label)}</div></span><span class="status ${statusClass(i.status)}">${esc(i.status)}</span></div>`).join(''):'<div class="notice">Aún no tiene una evaluación inicial que defina un tema de seguimiento.</div>'}</div>${level==='operator'&&scopes.length?`<div style="margin-top:12px"><div class="tiny">Si cambió de zona, puedes dejar de considerar un tema sin borrar el histórico.</div><div class="rowactions">${scopes.map(s=>`<button class="btn secondary" onclick="toggleScope('${esc(code)}','${esc(s.template.id)}',false)">No considerar ${esc(s.template.zone)}</button>`).join('')}</div></div>`:''}</div><div><h3 style="margin-top:0">Evaluaciones ${year}</h3>${ev.length?`<div style="overflow:auto"><table class="summarytable"><thead><tr><th>Fecha</th><th>Tema / zona</th><th>Resultado</th><th>Evaluador</th></tr></thead><tbody>${ev.map(x=>`<tr><td>${new Date(x.timestamp).toLocaleDateString()}</td><td>${esc(templateById(x.templateId)?.title||x.zone||'General')}</td><td>${x.score===null?'—':x.score+'%'}</td><td>${esc(x.evaluatorCode||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="notice">Sin evaluaciones en este año.</div>'}</div></div>`}

function toggleScope(code,tid,active){const k=scopeKey(code,tid),cur=DATA.scopeOverrides[k]||{},t=templateById(tid);if(!active&&!confirm(`¿Dejar de considerar ${t?t.title:tid} para ${code}? El histórico se conserva.`))return;DATA.scopeOverrides[k]={...cur,active,startAt:cur.startAt||nowISO(),changedAt:nowISO(),changedBy:mgmtSession.code,reason:active?'Reactivado':'Cambio de alcance / zona'};saveData();renderTrackingRows();toast(active?'Tema reactivado':'Tema retirado del seguimiento')}

function renderPeopleManagement(){const people=Object.values(DATA.profiles).sort((a,b)=>a.code.localeCompare(b.code));mgmtContent.innerHTML=`<div class="section"><div class="filters"><div class="field"><label>Buscar código</label><input id="pmCode" oninput="renderPeopleRows()"/></div><div class="field"><label>Estado</label><select id="pmStatus" onchange="renderPeopleRows()"><option value="">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></div><div class="field"><label>Rol</label><select id="pmRole" onchange="renderPeopleRows()"><option value="">Todos</option><option>Trabajador</option><option>Supervisor</option><option>Jefe</option></select></div></div></div><div id="peopleRows"></div>`;renderPeopleRows()}

function renderPeopleRows(){const q=(pmCode.value||'').trim(),st=pmStatus.value,role=pmRole.value;let a=Object.values(DATA.profiles).filter(p=>(!q||p.code.includes(q))&&(!st||p.status===st)&&(!role||highestRole(p)===role)).sort((x,y)=>x.code.localeCompare(y.code));peopleRows.innerHTML=a.length?a.map(p=>`<div class="simpleitem"><div><b>${esc(p.code)} · ${esc(highestRole(p))}</b><div class="tiny">${p.status==='inactive'?'Baja / inactivo':'Activo'} · Último uso: ${p.lastSeenAt?new Date(p.lastSeenAt).toLocaleDateString():'—'}</div></div><div class="rowactions"><button class="btn ${p.status==='inactive'?'green':'secondary'}" onclick="togglePersonStatus('${esc(p.code)}')">${p.status==='inactive'?'Reactivar':'Dar de baja'}</button></div></div>`).join(''):'<div class="notice">No hay personas registradas.</div>'}

function togglePersonStatus(code){const p=profile(code);if(!p)return;if(code===mgmtSession.code&&p.status!=='inactive'){toast('No puedes darte de baja desde tu sesión actual.');return}const newStatus=p.status==='inactive'?'active':'inactive';if(newStatus==='inactive'&&!confirm(`¿Dar de baja el código ${code}? No se borrará su histórico.`))return;p.status=newStatus;p.statusChangedAt=nowISO();p.statusChangedBy=mgmtSession.code;p.updatedAt=nowISO();DATA.profileEvents.push({id:uuid('PE'),code,status:newStatus,timestamp:nowISO(),changedBy:mgmtSession.code});saveData();renderPeopleRows();toast(newStatus==='inactive'?'Persona dada de baja':'Persona reactivada')}
// SUGGESTIONS
function initSuggestions(){fill(sugType,CONFIG.suggestionTypes);fill(sugZone,[...new Set(DOCS.flatMap(docZones))].sort());sugDocResults.innerHTML='<div class="small">Escribe al menos 2 caracteres para buscar.</div>';toggleSuggestionDoc()}

function toggleSuggestionDoc(){const isNew=sugType.value==='Nuevo instructivo';sugDocArea.classList.toggle('hidden',isNew);if(isNew){selectedSuggestionDoc=null;sugSelected.classList.add('hidden');sugDocSearch.value='';sugDocResults.innerHTML='<div class="small">Escribe al menos 2 caracteres para buscar.</div>'}}

function renderSuggestionDocs(){const q=(sugDocSearch.value||'').toLowerCase().trim();if(q.length<2){sugDocResults.innerHTML='<div class="small">Escribe al menos 2 caracteres para buscar.</div>';return}const a=DOCS.filter(d=>d.active!==false&&[d.code,d.title,d.proposed_name,d.equipment,d.keywords].join(' ').toLowerCase().includes(q)).slice(0,8);sugDocResults.innerHTML=a.length?a.map(d=>`<button class="suggest-result" style="width:100%;text-align:left" onclick="selectSuggestionDoc('${esc(d.id)}')"><b>${esc(d.code)}</b><div>${esc(d.proposed_name||d.title)}</div></button>`).join(''):'<div class="notice">No se encontraron instructivos.</div>'}

function selectSuggestionDoc(id){selectedSuggestionDoc=DOCS.find(x=>x.id===id)||null;if(selectedSuggestionDoc){sugSelected.classList.remove('hidden');sugSelected.innerHTML=`Seleccionado: <b>${esc(selectedSuggestionDoc.code)}</b> · ${esc(selectedSuggestionDoc.title)}`;sugDocResults.innerHTML=''}else sugSelected.classList.add('hidden')}

function saveSuggestion(){const type=sugType.value,isNew=type==='Nuevo instructivo',code=sugCode.value.trim(),zone=sugZone.value,text=sugText.value.trim();if(!validCode(code)){toast('Ingresa un código válido de 4 dígitos.');return}if(isInactiveCode(code)){toast('Código inactivo.');return}if(!isNew&&!selectedSuggestionDoc){toast('Busca y selecciona el instructivo.');return}if(text.length<8){toast('Describe brevemente la propuesta.');return}touchProfile(code,'Trabajador','Sugerencia');DATA.suggestions.push({id:uuid('SUG'),timestamp:nowISO(),workerCode:code,anonymous:false,type,zone,docId:isNew?'':selectedSuggestionDoc.id,docCode:isNew?'':selectedSuggestionDoc.code,text,status:'Pendiente',appVersion:APP.version,device:APP.deviceLabel});saveData();sugText.value='';sugDocSearch.value='';selectedSuggestionDoc=null;sugSelected.classList.add('hidden');sugDocResults.innerHTML='<div class="small">Escribe al menos 2 caracteres para buscar.</div>';toast('Sugerencia guardada')}
// EXPORT / IMPORT
function download(name,content,type){const blob=content instanceof Blob?content:new Blob([content],{type:type||'text/plain;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2500)}

function exportBackup(){DATA.meta.lastBackupAt=nowISO();saveData();download(`TOPS_Respaldo_${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({schemaVersion:5,appVersion:APP.version,device:APP.deviceLabel,exportedAt:DATA.meta.lastBackupAt,data:DATA},null,2),'application/json')}

function mergeProfiles(a,b){const out={...a};Object.entries(b||{}).forEach(([code,p])=>{const cur=out[code];if(!cur){out[code]=p;return}const newer=(p.updatedAt||p.lastSeenAt||'')>(cur.updatedAt||cur.lastSeenAt||'')?p:cur,older=newer===p?cur:p;out[code]={...older,...newer,roles:[...new Set([...(cur.roles||[]),...(p.roles||[])])],roleSince:{...(older.roleSince||{}),...(newer.roleSince||{})}}});return out}
async function importBackup(file){if(!file)return;try{const x=JSON.parse(await file.text()),incoming=migrateData(x.data||x);if(!incoming||!incoming.profiles)throw new Error('Formato');if(!confirm('Se combinará el respaldo con los datos actuales. ¿Continuar?'))return;DATA.profiles=mergeProfiles(DATA.profiles,incoming.profiles);for(const k of ['selfTests','supervisorEvals','chiefEvals','suggestions','profileEvents','legacyRecords']){const map=new Map([...(DATA[k]||[]),...(incoming[k]||[])].map(r=>[r.id||JSON.stringify(r),r]));DATA[k]=[...map.values()]}for(const [k,v] of Object.entries(incoming.scopeOverrides||{})){const cur=DATA.scopeOverrides[k];if(!cur||(v.changedAt||'')>=(cur.changedAt||''))DATA.scopeOverrides[k]=v}DATA.schemaVersion=5;saveData();toast('Respaldo importado')}catch(e){toast('El archivo de respaldo no es válido.')}finally{backupInput.value=''}}

function csvEscape(v){return '"'+String(v??'').replace(/"/g,'""')+'"'}

function makeCSV(rows){if(!rows.length)return'';const h=[...new Set(rows.flatMap(r=>Object.keys(r)))];return '\ufeff'+[h.join(';'),...rows.map(r=>h.map(k=>csvEscape(r[k])).join(';'))].join('\r\n')}

function flatAll(){const out=[];for(const x of DATA.selfTests)out.push({Fecha:x.timestamp,Tipo:'Auto test',Evaluador:x.workerCode,Evaluado:x.workerCode,Linea:'',Zona:x.zone||'',Tema:x.category||'',Resultado:x.score,Detalle:`${x.correct}/${x.total}`,Comentario:'',Version:x.appVersion,Tablet:x.device});for(const x of DATA.supervisorEvals)out.push({Fecha:x.timestamp,Tipo:'Supervisor a Operador',Evaluador:x.evaluatorCode,Evaluado:x.workerCode,Linea:x.line,Zona:x.zone,Tema:templateById(x.templateId)?.title||x.templateId||'',Resultado:x.score,Detalle:`${x.items?.length||0} criterios`,Comentario:x.comment||'',Version:x.appVersion,Tablet:x.device});for(const x of DATA.chiefEvals)out.push({Fecha:x.timestamp,Tipo:'Jefatura a Supervisor',Evaluador:x.evaluatorCode,Evaluado:x.supervisorCode,Linea:x.line,Zona:x.zone,Tema:templateById(x.templateId)?.title||x.templateId||'',Resultado:x.score,Detalle:`${x.items?.length||0} criterios`,Comentario:x.comment||'',Version:x.appVersion,Tablet:x.device});for(const x of DATA.suggestions)out.push({Fecha:x.timestamp,Tipo:'Sugerencia',Evaluador:x.workerCode,Evaluado:'',Linea:'',Zona:x.zone,Tema:x.type,Resultado:x.status,Detalle:x.docCode||'',Comentario:x.text,Version:x.appVersion,Tablet:x.device});return out}

function exportAllCSV(){const rows=flatAll();if(!rows.length){toast('Aún no hay datos.');return}download(`TOPS_Conocimiento_Datos_${new Date().toISOString().slice(0,10)}.csv`,makeCSV(rows),'text/csv;charset=utf-8')}

function exportSuggestionsCSV(){const rows=DATA.suggestions.map(x=>({Fecha:x.timestamp,Codigo:x.workerCode,Tipo:x.type,Zona:x.zone,Codigo_IT:x.docCode,Propuesta:x.text,Estado:x.status,Version:x.appVersion,Tablet:x.device}));if(!rows.length){toast('Aún no hay sugerencias.');return}download(`TOPS_Sugerencias_${new Date().toISOString().slice(0,10)}.csv`,makeCSV(rows),'text/csv;charset=utf-8')}
window.addEventListener('load',init);
