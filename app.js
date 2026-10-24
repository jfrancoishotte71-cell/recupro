// ===== RecuPro — PWA de gestion de reçus (Windows 11 / Android) =====
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const toast=(m,t=2600)=>{const e=$('#toast');e.textContent=m;e.style.display='block';clearTimeout(e._t);e._t=setTimeout(()=>e.style.display='none',t)};
const money=n=>(+n||0).toLocaleString('fr-CA',{style:'currency',currency:'CAD'});
const FIELDS=[['date','Date de la transaction'],['fournisseur','Nom du fournisseur'],['numero','Numéro du reçu/facture'],['categorie','Catégorie'],['avantTaxes','Montant avant taxes'],['tps','TPS'],['tvq','TVQ'],['hst','HST'],['total','Montant total payé'],['paiement','Mode de paiement'],['projet','Projet / job'],['fichier','Nom de fichier du reçu'],['lot','Répertoire (lot)']];
const NUM=['avantTaxes','tps','tvq','hst','total'];
// ---------- Réglages ----------
const S=Object.assign({aiProv:'openai',aiKey:'',aiModel:'',gClient:'',cats:'Matériaux, Transport, Outils, Location d\'équipement, Carburant, Repas, Sous-traitance, Bureau, Autre'},JSON.parse(localStorage.recuSet||'{}'));
const cats=()=>S.cats.split(',').map(s=>s.trim()).filter(Boolean);
// ---------- Base de données locale (IndexedDB) ----------
let db;const openDB=()=>new Promise(r=>{const q=indexedDB.open('recupro',1);q.onupgradeneeded=()=>{const d=q.result;d.createObjectStore('files',{keyPath:'id'});d.createObjectStore('recs',{keyPath:'id'});d.createObjectStore('lots',{keyPath:'name'})};q.onsuccess=()=>r(db=q.result)});
const tx=(st,m='readonly')=>db.transaction(st,m).objectStore(st);
const all=st=>new Promise(r=>{const q=tx(st).getAll();q.onsuccess=()=>r(q.result)});
const put=(st,v)=>new Promise(r=>{const q=tx(st,'readwrite').put(v);q.onsuccess=()=>r()});
const del=(st,k)=>new Promise(r=>{const q=tx(st,'readwrite').delete(k);q.onsuccess=()=>r()});
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const stamp=(d=new Date())=>{const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`};
let curLot=localStorage.curLot||'';
async function ensureLot(){const lots=await all('lots');if(!curLot||!lots.find(l=>l.name===curLot))await newLot();$$('.curLot').forEach(e=>e.textContent=curLot)}
async function newLot(){curLot=stamp();localStorage.curLot=curLot;await put('lots',{name:curLot,projet:'',created:new Date().toISOString()});$$('.curLot').forEach(e=>e.textContent=curLot);$('#defProj').value='';renderThumbs();toast('📁 Nouveau lot : '+curLot)}
// ---------- Dossier Windows (File System Access API) ----------
let rootDir=null;
async function idbKV(k,v){return new Promise(r=>{const q=indexedDB.open('recupro-kv',1);q.onupgradeneeded=()=>q.result.createObjectStore('kv');q.onsuccess=()=>{const s=q.result.transaction('kv','readwrite').objectStore('kv');const o=v===undefined?s.get(k):s.put(v,k);o.onsuccess=()=>r(o.result)}})}
async function writeToDisk(lot,name,blob){if(!rootDir)return;try{if(await rootDir.queryPermission({mode:'readwrite'})!=='granted'&&await rootDir.requestPermission({mode:'readwrite'})!=='granted')return;const d=await rootDir.getDirectoryHandle(lot,{create:true});const f=await d.getFileHandle(name,{create:true});const w=await f.createWritable();await w.write(blob);await w.close()}catch(e){console.warn(e)}}
// ---------- Ajout de fichiers ----------
const safe=n=>n.replace(/[\\/:*?"<>|]+/g,'_').slice(0,120);
async function addFile(blob,name,source='scan'){await ensureLot();const files=await all('files');let n=safe(name);if(files.some(f=>f.lot===curLot&&f.name===n))n=n.replace(/(\.\w+)?$/,'_'+uid().slice(-4)+'$1');
 const f={id:uid(),lot:curLot,name:n,type:blob.type||guessType(n),blob,status:'en attente',source,added:new Date().toISOString()};await put('files',f);await writeToDisk(curLot,n,blob);return f}
const guessType=n=>/\.pdf$/i.test(n)?'application/pdf':/\.eml$/i.test(n)?'message/rfc822':/\.html?$/i.test(n)?'text/html':/\.(jpe?g)$/i.test(n)?'image/jpeg':/\.png$/i.test(n)?'image/png':'text/plain';
async function handleFiles(list){for(const f of list){let b=f,n=f.name;if(f.type.startsWith('image/'))b=await shrink(f);if(/^image\.|^IMG|^\d+\./.test(n)||!n)n='recu_'+stamp()+'.jpg';await addFile(b,n)}toast(`✔ ${list.length} reçu(s) ajouté(s) au lot ${curLot}`);renderThumbs();renderLots();kpis()}
function shrink(file){return new Promise(r=>{const img=new Image();img.onload=()=>{const m=1800,s=Math.min(1,m/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=img.width*s;c.height=img.height*s;c.getContext('2d').drawImage(img,0,0,c.width,c.height);c.toBlob(b=>r(b||file),'image/jpeg',.85)};img.onerror=()=>r(file);img.src=URL.createObjectURL(file)})}
async function renderThumbs(){const fs=(await all('files')).filter(f=>f.lot===curLot);$('#thumbs').innerHTML=fs.map(f=>`<div class="th" data-v="${f.id}">${f.type.startsWith('image/')?`<img src="${URL.createObjectURL(f.blob)}" alt="">`:`<div class="ic">${f.type.includes('pdf')?'📄':'✉️'}</div>`}${f.name}<br><span class="badge ${f.status==='analysé'?'ok':f.status==='erreur'?'err':'wait'}">${f.status}</span></div>`).join('')||'<p class="muted">Aucun reçu dans ce lot pour l\'instant.</p>'}
async function view(id){const f=(await all('files')).find(x=>x.id===id);if(!f)return;const u=URL.createObjectURL(f.blob);$('#vbody').innerHTML=f.type.startsWith('image/')?`<img src="${u}">`:`<iframe src="${u}"></iframe>`;$('#viewer').showModal()}
// ---------- Lots ----------
async function renderLots(){const lots=(await all('lots')).sort((a,b)=>b.name.localeCompare(a.name));const fs=await all('files');
 $('#lotList').innerHTML=lots.map(l=>{const f=fs.filter(x=>x.lot===l.name),ok=f.filter(x=>x.status==='analysé').length;return `<div class="box"><div class="lot"><div><h4>📁 ${l.name} ${l.name===curLot?'<span class="badge ok">actif</span>':''}</h4><span class="muted">${f.length} fichier(s) · ${ok} analysé(s) ${l.projet?'· Projet : '+l.projet:''}</span></div>
 <div><button class="btn amber sm" style="background:var(--a)" data-an="${l.name}">🤖 Analyser</button> <button class="btn ghost sm" data-act="${l.name}">Activer</button> <button class="btn ghost sm" data-zip="${l.name}">⬇ ZIP</button> <button class="btn danger sm" data-dl="${l.name}">🗑</button></div></div><progress id="pg-${l.name}" value="${ok}" max="${f.length||1}"></progress></div>`}).join('')||'<p class="muted">Aucun lot.</p>'}
async function zipLot(name){const z=new JSZip(),d=z.folder(name);(await all('files')).filter(f=>f.lot===name).forEach(f=>d.file(f.name,f.blob));dl(await z.generateAsync({type:'blob'}),name+'.zip')}
const dl=(b,n)=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=n;a.click()};
// ---------- IA ----------
const b64=blob=>new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result.split(',')[1]);fr.readAsDataURL(blob)});
const PROMPT=()=>`Tu es un expert-comptable québécois. Analyse ce reçu/cette facture d'achat et retourne UNIQUEMENT un JSON avec les clés :
{"date":"AAAA-MM-JJ","fournisseur":"","numero":"","categorie":"une parmi: ${cats().join(' | ')}","avantTaxes":0,"tps":0,"tvq":0,"hst":0,"total":0,"paiement":"Carte de crédit | Débit | Comptant | Virement | Autre","projet":"","est_recu":true}
Règles : TPS = GST 5 % (fédéral), TVQ = QST 9,975 % (Québec), HST/TVH = 13 % (Ontario). Montants en nombres (point décimal). Si un champ est absent, mets "" ou 0. "projet" : seulement si un nom/numéro de projet, job, PO ou adresse de chantier apparaît. Si le document n'est pas un reçu d'achat, mets "est_recu":false.`;
async function emlToText(blob){let t=await blob.text();t=t.replace(/=\r?\n/g,'').replace(/=([0-9A-F]{2})/g,(m,h)=>String.fromCharCode(parseInt(h,16)));return htmlText(t).slice(0,30000)}
const htmlText=h=>h.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ');
async function aiExtract(f){if(!S.aiKey)throw new Error('Ajoutez une clé API dans Réglages');
 const isImg=f.type.startsWith('image/'),isPdf=f.type.includes('pdf');let text=null;if(!isImg&&!isPdf)text=f.type.includes('rfc822')?await emlToText(f.blob):htmlText(await f.blob.text()).slice(0,30000);
 const data=(isImg||isPdf)?await b64(f.blob):null;let out;
 if(S.aiProv==='gemini'){const parts=[{text:PROMPT()}];if(data)parts.push({inline_data:{mime_type:f.type,data}});else parts.push({text});
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${S.aiModel||'gemini-2.5-flash'}:generateContent?key=${S.aiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts}],generationConfig:{responseMimeType:'application/json'}})});
  const j=await r.json();if(j.error)throw new Error(j.error.message);out=j.candidates[0].content.parts[0].text}
 else{const c=[{type:'text',text:PROMPT()}];if(isImg)c.push({type:'image_url',image_url:{url:`data:${f.type};base64,${data}`}});else if(isPdf)c.push({type:'file',file:{filename:f.name,file_data:`data:application/pdf;base64,${data}`}});else c.push({type:'text',text});
  const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+S.aiKey},body:JSON.stringify({model:S.aiModel||'gpt-4o-mini',response_format:{type:'json_object'},messages:[{role:'user',content:c}]})});
  const j=await r.json();if(j.error)throw new Error(j.error.message);out=j.choices[0].message.content}
 return JSON.parse(out.replace(/```json|```/g,''))}
async function analyzeLot(name){const lots=await all('lots'),lot=lots.find(l=>l.name===name)||{};const fs=(await all('files')).filter(f=>f.lot===name&&f.status!=='analysé');const recs=await all('recs');let i=0,err=0;
 if(!fs.length)return toast('Tout est déjà analysé dans ce lot');toast(`🤖 Analyse de ${fs.length} fichier(s)…`,4000);
 for(const f of fs){try{const x=await aiExtract(f);if(x.est_recu!==false){const old=recs.find(r=>r.fileId===f.id);
   const rec={id:old?.id||uid(),fileId:f.id,lot:name,fichier:f.name,...Object.fromEntries(FIELDS.slice(0,11).map(([k])=>[k,x[k]??''])),projet:x.projet||lot.projet||''};
   NUM.forEach(k=>rec[k]=Math.round((parseFloat(String(rec[k]).replace(',','.'))||0)*100)/100);
   if(!rec.avantTaxes&&rec.total)rec.avantTaxes=+(rec.total-rec.tps-rec.tvq-rec.hst).toFixed(2);
   rec.alerte=Math.abs(rec.avantTaxes+rec.tps+rec.tvq+rec.hst-rec.total)>0.05;await put('recs',rec)}
   f.status=x.est_recu===false?'pas un reçu':'analysé'}catch(e){f.status='erreur';f.err=e.message;err++;console.error(e)}
  await put('files',f);const p=document.getElementById('pg-'+name);if(p)p.value=++i}
 toast(err?`⚠ Terminé avec ${err} erreur(s) : vérifiez la clé API`:'✔ Analyse terminée',4000);renderLots();renderTable();kpis();renderThumbs()}
// ---------- Tableau / base de données ----------
async function renderTable(){const recs=(await all('recs')).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
 const t=$('#fTxt').value.toLowerCase(),c=$('#fCat').value,p=$('#fProj').value;
 $('#fCat').innerHTML='<option value="">Toutes catégories</option>'+cats().map(x=>`<option ${x===c?'selected':''}>${x}</option>`).join('');
 const projs=[...new Set(recs.map(r=>r.projet).filter(Boolean))];$('#fProj').innerHTML='<option value="">Tous projets</option>'+projs.map(x=>`<option ${x===p?'selected':''}>${x}</option>`).join('');
 const rows=recs.filter(r=>(!c||r.categorie===c)&&(!p||r.projet===p)&&(!t||JSON.stringify(r).toLowerCase().includes(t)));
 $('#tbl tbody').innerHTML=rows.map(r=>`<tr data-id="${r.id}" ${r.alerte?'style="outline:2px solid #e09f3e" title="Le total ne correspond pas à la somme"':''}>${FIELDS.map(([k])=>k==='lot'?`<td class="muted">${r.lot}</td>`:k==='fichier'?`<td><a href="#" data-vf="${r.fileId}">${r.fichier}</a></td>`:k==='categorie'?`<td><select data-k="categorie">${cats().map(x=>`<option ${x===r.categorie?'selected':''}>${x}</option>`).join('')}</select></td>`:`<td><input data-k="${k}" class="${NUM.includes(k)?'num':''}" value="${r[k]??''}" ${k==='date'?'type="date"':''}></td>`).join('')}<td><button class="btn danger sm" data-dr="${r.id}">✕</button></td></tr>`).join('')||'<tr><td colspan="14" class="muted" style="padding:20px">Aucune donnée. Analysez un lot pour remplir la base.</td></tr>';
 kpis(rows,'#kpis2')}
async function kpis(rows,sel='#kpis'){rows=rows||await all('recs');const s=k=>rows.reduce((a,r)=>a+(+r[k]||0),0);const fs=await all('files');
 $(sel).innerHTML=[['🧾 Reçus',rows.length,1],['💵 Avant taxes',s('avantTaxes')],['🇨🇦 TPS',s('tps')],['⚜️ TVQ',s('tvq')],['🍁 HST',s('hst')],['💳 Total payé',s('total')]].map(([l,v,n])=>`<div class="kpi"><b>${n?v:money(v)}</b><span>${l}</span></div>`).join('')+(sel==='#kpis'?`<div class="kpi" style="border-color:var(--a)"><b>${fs.filter(f=>f.status==='en attente').length}</b><span>⏳ À analyser</span></div>`:'')}
function exportXlsx(){all('recs').then(recs=>{const rows=recs.sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(r=>Object.fromEntries(FIELDS.map(([k,l])=>[l,r[k]])));
 const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(rows);ws['!cols']=FIELDS.map(()=>({wch:18}));XLSX.utils.book_append_sheet(wb,ws,'Reçus');
 const by={};recs.forEach(r=>{const k=r.projet||'(sans projet)';by[k]=by[k]||{Projet:k,'Nb reçus':0,'Avant taxes':0,TPS:0,TVQ:0,HST:0,Total:0};const o=by[k];o['Nb reçus']++;o['Avant taxes']+=+r.avantTaxes;o.TPS+=+r.tps;o.TVQ+=+r.tvq;o.HST+=+r.hst;o.Total+=+r.total});
 XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(Object.values(by)),'Par projet');XLSX.writeFile(wb,`Recus_${stamp()}.xlsx`)})}
async function importXlsx(file){const wb=XLSX.read(await file.arrayBuffer());const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);let n=0;
 for(const row of rows){const r={id:uid(),fileId:'',lot:'importé'};FIELDS.forEach(([k,l])=>r[k]=row[l]??row[k]??'');NUM.forEach(k=>r[k]=+r[k]||0);if(r.fournisseur||r.total){await put('recs',r);n++}}toast(`✔ ${n} ligne(s) importée(s)`);renderTable()}
// ---------- Gmail (plusieurs comptes) ----------
let accts=[];let mailHits=[];
function addAcct(){if(!S.gClient)return toast('Ajoutez l\'ID client OAuth Google dans Réglages',4000);if(!window.google?.accounts)return toast('Service Google non chargé');
 google.accounts.oauth2.initTokenClient({client_id:S.gClient,scope:'https://www.googleapis.com/auth/gmail.readonly',prompt:'select_account',callback:async t=>{if(t.error)return toast('Connexion refusée');
  const p=await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:'Bearer '+t.access_token}})).json();accts=accts.filter(a=>a.email!==p.emailAddress);accts.push({email:p.emailAddress,token:t.access_token,on:true});renderAccts();toast('✔ '+p.emailAddress+' connecté')}}).requestAccessToken()}
const renderAccts=()=>$('#accts').innerHTML=accts.map((a,i)=>`<label class="chk"><input type="checkbox" ${a.on?'checked':''} data-ac="${i}"> 📧 ${a.email}</label>`).join('')||'<p class="muted">Aucun compte connecté.</p>';
const gget=(a,u)=>fetch('https://gmail.googleapis.com/gmail/v1/users/me/'+u,{headers:{Authorization:'Bearer '+a.token}}).then(r=>r.json());
async function searchMail(){const on=accts.filter(a=>a.on);if(!on.length)return toast('Connectez au moins un compte Gmail');
 const f=$('#dFrom').value,t=$('#dTo').value;let q=`(${$('#q').value})`+(f?` after:${f.replace(/-/g,'/')}`:'')+(t?` before:${t.replace(/-/g,'/')}`:'')+($('#onlyAtt').checked?' has:attachment':'');
 $('#mailRes').innerHTML='<div class="box">🔎 Recherche…</div>';mailHits=[];
 for(const a of on){const l=await gget(a,'messages?maxResults=100&q='+encodeURIComponent(q));for(const m of l.messages||[]){const d=await gget(a,`messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`);const h=n=>(d.payload.headers.find(x=>x.name===n)||{}).value||'';mailHits.push({a,id:m.id,subj:h('Subject'),from:h('From'),date:h('Date')})}}
 $('#mailRes').innerHTML=`<div class="box"><div class="lot"><h4>${mailHits.length} courriel(s) trouvé(s)</h4><div><button class="btn ghost sm" id="selAll">Tout cocher</button> <button class="btn green" id="impMail">⬇ Importer la sélection dans le lot</button></div></div>`+mailHits.map((m,i)=>`<label class="mail"><input type="checkbox" data-mi="${i}" checked><span style="flex:1"><b>${m.subj||'(sans objet)'}</b><br><span class="muted">${m.from} · ${m.a.email} · ${new Date(m.date).toLocaleDateString('fr-CA')}</span></span></label>`).join('')+'</div>'}
const ub64=s=>{const b=atob(s.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(b,c=>c.charCodeAt(0))};
async function importMail(){const sel=$$('[data-mi]:checked').map(e=>mailHits[+e.dataset.mi]);let n=0;await ensureLot();toast(`⬇ Import de ${sel.length} courriel(s)…`,5000);
 for(const m of sel){const d=await gget(m.a,`messages/${m.id}?format=full`);const parts=[];const walk=p=>{parts.push(p);(p.parts||[]).forEach(walk)};walk(d.payload);
  const base=safe(`${new Date(m.date).toISOString().slice(0,10)}_${(m.from.split('<')[0]||'courriel').trim()}_${m.id.slice(-5)}`);let got=false;
  for(const p of parts)if(p.filename&&/pdf|image/.test(p.mimeType)){const att=p.body.attachmentId?await gget(m.a,`messages/${m.id}/attachments/${p.body.attachmentId}`):p.body;await addFile(new Blob([ub64(att.data)],{type:p.mimeType}),base+'_'+p.filename,'courriel');got=true;n++}
  if(!got){const h=parts.find(p=>p.mimeType==='text/html')||parts.find(p=>p.mimeType==='text/plain');if(h?.body?.data){await addFile(new Blob([`<h3>${m.subj}</h3><p>${m.from} — ${m.date}</p>`,ub64(h.body.data)],{type:'text/html'}),base+'.html','courriel');n++}}}
 toast(`✔ ${n} reçu(s) importé(s) dans ${curLot}`);renderThumbs();renderLots();kpis()}
// ---------- Événements ----------
function tab(t){$$('.tab').forEach(e=>e.classList.toggle('on',e.id===t));$$('nav button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));if(t==='donnees')renderTable();if(t==='lots')renderLots();if(t==='scan')renderThumbs()}
document.addEventListener('click',async e=>{const g=e.target.closest('[data-t],[data-go]');if(g)return tab(g.dataset.t||g.dataset.go);const d=e.target.closest('[data-an],[data-act],[data-zip],[data-dl],[data-dr],[data-v],[data-vf]');if(!d)return;const s=d.dataset;
 if(s.an)analyzeLot(s.an);if(s.act){curLot=s.act;localStorage.curLot=curLot;$$('.curLot').forEach(x=>x.textContent=curLot);renderLots();toast('Lot actif : '+curLot)}if(s.zip)zipLot(s.zip);
 if(s.dl&&confirm('Supprimer ce lot et ses reçus ?')){for(const f of (await all('files')).filter(f=>f.lot===s.dl))await del('files',f.id);for(const r of (await all('recs')).filter(r=>r.lot===s.dl))await del('recs',r.id);await del('lots',s.dl);renderLots();kpis()}
 if(s.dr&&confirm('Supprimer cette ligne ?')){await del('recs',s.dr);renderTable()}if(s.v)view(s.v);if(s.vf){e.preventDefault();view(s.vf)}});
document.addEventListener('change',async e=>{const el=e.target;if(el.dataset.k){const id=el.closest('tr').dataset.id;const r=(await all('recs')).find(x=>x.id===id);r[el.dataset.k]=NUM.includes(el.dataset.k)?+String(el.value).replace(',','.')||0:el.value;await put('recs',r);kpis(null,'#kpis')}
 if(el.dataset.ac)accts[+el.dataset.ac].on=el.checked});
$('#camIn').onchange=e=>handleFiles([...e.target.files]);$('#fileIn').onchange=e=>handleFiles([...e.target.files]);
const dr=$('#drop');dr.ondragover=e=>{e.preventDefault();dr.classList.add('over')};dr.ondragleave=()=>dr.classList.remove('over');dr.ondrop=e=>{e.preventDefault();dr.classList.remove('over');handleFiles([...e.dataTransfer.files])};
$('#newLot').onclick=newLot;$('#defProj').onchange=async e=>{await put('lots',{...(await all('lots')).find(l=>l.name===curLot),projet:e.target.value});toast('Projet enregistré pour le lot')};
$('#addAcct').onclick=addAcct;$('#searchMail').onclick=searchMail;$('#mailRes').addEventListener('click',e=>{if(e.target.id==='impMail')importMail();if(e.target.id==='selAll')$$('[data-mi]').forEach(c=>c.checked=true)});
$('#expX').onclick=exportXlsx;$('#impX').onchange=e=>importXlsx(e.target.files[0]);['#fTxt','#fCat','#fProj'].forEach(s=>$(s).oninput=renderTable);
$('#saveSet').onclick=()=>{['aiProv','aiKey','aiModel','gClient','cats'].forEach(k=>S[k]=$('#'+k).value.trim());localStorage.recuSet=JSON.stringify(S);toast('✔ Réglages enregistrés')};
$('#pickDir').onclick=async()=>{if(!window.showDirectoryPicker)return toast('Disponible sur Chrome/Edge pour Windows seulement',4000);rootDir=await showDirectoryPicker({mode:'readwrite'});await idbKV('root',rootDir);$('#dirName').textContent='📂 '+rootDir.name};
$('#backup').onclick=async()=>{const z=new JSZip();(await all('files')).forEach(f=>z.folder(f.lot).file(f.name,f.blob));z.file('base_de_donnees.json',JSON.stringify({lots:await all('lots'),recus:await all('recs')},null,1));dl(await z.generateAsync({type:'blob'}),'RecuPro_sauvegarde_'+stamp()+'.zip')};
$('#wipe').onclick=async()=>{if(!confirm('Effacer TOUTES les données ?'))return;for(const st of['files','recs','lots'])for(const x of await all(st))await del(st,x.id||x.name);curLot='';await ensureLot();kpis();toast('Données effacées')};
let deferred;addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;$('#installBtn').hidden=false});$('#installBtn').onclick=()=>deferred?.prompt();
(async()=>{await openDB();['aiProv','aiKey','aiModel','gClient','cats'].forEach(k=>$('#'+k).value=S[k]);rootDir=await idbKV('root').catch(()=>null);if(rootDir)$('#dirName').textContent='📂 '+rootDir.name;
 await ensureLot();const l=(await all('lots')).find(x=>x.name===curLot);$('#defProj').value=l?.projet||'';kpis();renderAccts();if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js')})();
