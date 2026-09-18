'use strict';
let censusData,resilienceData,partnerRecords=[];
let savedPartners=new Set();try{savedPartners=new Set(JSON.parse(localStorage.getItem("england-atlas-partners")||"[]"));}catch{}
const NEEDS_SOURCE='https://www.gov.uk/government/statistics/english-indices-of-deprivation-2025';
const NEEDS_COLORS=['#fff5eb','#fee6ce','#fdae6b','#e6550d','#a63603','#662506'];
const NEEDS_METRICS={
 imd_top10_pct:{title:'Most-deprived neighbourhoods',short:'Deprivation concentration',unit:'% of neighbourhoods',decimals:1,breaks:[1,10,20,30,40],note:'Percentage of local neighbourhoods (LSOAs) in England’s most deprived tenth. This is a share of neighbourhoods, not of residents. IoD2025, corrected November 2025. Area context does not establish an individual’s needs.'},
 income_deprivation_pct:{title:'Income deprivation · all ages',short:'Low income',unit:'% · published area average',decimals:1,breaks:[10,20,30,40,50],note:'Income domain average score, multiplied by 100. Based on the official low-income definition and published population denominators. Use the source’s denominator, not WorldPop, when deriving counts. IoD2025 release uses inputs from different years.'},
 child_income_deprivation_pct:{title:'Income deprivation · children',short:'Children in low-income families',unit:'% · ages 0–15',decimals:1,breaks:[10,20,30,40,50],note:'Income Deprivation Affecting Children Index (IDACI), published local authority average score × 100. Children aged 0–15 in income-deprived families. IoD2025, corrected November 2025.'},
 older_income_deprivation_pct:{title:'Income deprivation · older people',short:'Older people on low incomes',unit:'% · ages 60+',decimals:1,breaks:[10,20,30,40,50],note:'Income Deprivation Affecting Older People Index (IDAOPI), published local authority average score × 100. People aged 60+ experiencing income deprivation. IoD2025, corrected November 2025.'}
};
async function initialisePreparedness(){
 const [data,foundations,census,resilience]=await Promise.all([getJSON('data/preparedness.json'),getJSON('data/community_foundations.geojson'),getJSON('data/census2021.json'),getJSON('data/resilience_forums.json')]);
 censusData=census;Object.assign(NEEDS_METRICS,census.metrics);
 preparednessData=data;foundationFeatures=foundations.features;resilienceData=resilience;
 partnerRecords=foundationFeatures.map((f,i)=>({...f.properties,id:'foundation-'+i,feature:f,category:'Community foundation',source_url:data.partner_source,directory_updated:'Not stated',role:'Local charitable funding and community support',verification:'UKCF directory entry; funding eligibility and service coverage require confirmation.'})).concat(resilience.records.map((p,i)=>({...p,id:'lrf-'+i}))).sort((a,b)=>a.name.localeCompare(b.name));
 const districts=layer('districts');
 for(const[key,meta]of Object.entries(NEEDS_METRICS)){
  manifest.analysis_metrics[key]={...meta,source:meta.source_url||NEEDS_SOURCE};
  manifest.layers.push({...districts,id:'district_need_'+key,title:meta.title,group:'Community needs',date:meta.date||'2025 release · corrected November 2025',source:meta.source||'MHCLG · English Indices of Deprivation',source_url:meta.source_url||NEEDS_SOURCE,unit:meta.unit,note:meta.note+' '+(meta.group?census.geography_note:data.geography),count:Object.keys(meta.group?census.records:data.records).length,style:{metric:key,breaks:meta.breaks,colors:NEEDS_COLORS}});
 }
 manifest.layers.push({id:'community_foundations',title:'Community foundation offices',group:'Local partners',kind:'vector',files:['data/community_foundations.geojson'],count:foundationFeatures.length,date:'Directory checked 18 September 2026',source:'UK Community Foundations',source_url:data.partner_source,note:data.partner_note,style:{points:true,color:'#7754a6'}});
 $('partnersTab').onclick=showPartners;$('partnerSearch').oninput=renderPartners;$('partnerRegion').onchange=renderPartners;$('partnerType').onchange=renderPartners;$('partnerSaved').onchange=renderPartners;$('partnerReset').onclick=()=>{$('partnerSearch').value='';$('partnerRegion').value='';$('partnerType').value='';$('partnerSaved').checked=false;renderPartners();};
 for(const region of [...new Set(partnerRecords.map(p=>p.region))].sort()){$('partnerRegion').add(new Option(region,region));}
 $('partnersExport').onclick=()=>downloadTable(filteredPartners().map(p=>({name:p.name,category:p.category,region:p.region,source_region:p.source_region||p.region,role:p.role,office_address:p.address||'',phone:p.phone||'',website:p.website||'',risk_register:p.risk_register||'',longitude:p.feature?.geometry.coordinates[0]??'',latitude:p.feature?.geometry.coordinates[1]??'',source_url:p.source_url,directory_checked:p.checked,directory_updated:p.directory_updated,verification:p.verification,coverage_note:p.feature?preparednessData.partner_note:resilienceData.note})),'England-partner-directory.csv');
 $('closeBriefing').onclick=()=>$('briefing').close();
}
function mergePreparedness(f,l){if(!l?.id.startsWith('district'))return f;return {...f,properties:{...f.properties,...(preparednessData?.records[f.properties.code]||{}),...(censusData?.records[f.properties.code]||{}),name:f.properties.name,code:f.properties.code}};}
function renderPreparednessControls(box,metrics){
 if(view==='needs'){
  const label=document.createElement('label');label.className='control-label';label.textContent='Compare community needs';label.htmlFor='needsIndicator';
  const select=document.createElement('select');select.id='needsIndicator';select.className='control-select';select.setAttribute('aria-label','Community needs indicator');
  for(const group of ['Financial pressures','Census 2021']){const optgroup=document.createElement('optgroup');optgroup.label=group;for(const[key,meta]of Object.entries(NEEDS_METRICS)){if((meta.group||'Financial pressures')!==group)continue;const option=new Option(meta.title,'district_need_'+key);option.selected=primaryId==='district_need_'+key;optgroup.append(option);}select.append(optgroup);}select.onchange=e=>choose(e.target.value);box.append(select);
  const p=document.createElement('p');p.className='measure-explanation';p.textContent=NEEDS_METRICS[primaryId?.replace('district_need_','')]?.group?'Census 2021 context for accessible support. Select an area for counts, denominators and a briefing.':primaryId==='district_need_imd_top10_pct'?'Share of neighbourhoods in England’s most deprived 10%. Select an area to open its briefing.':'Published income-deprivation measure. Select an area to open its briefing.';metrics.append(p);
  const b=document.createElement('button');b.textContent='Compare all areas';b.className='wide-action';b.onclick=()=>{$('analysisMetric').value=primaryId.replace('district_need_','');showAnalysis();};metrics.append(b);
 }
 if(view==='partners'){
  const p=document.createElement('p');p.className='measure-explanation';p.textContent=preparednessData.partner_note;metrics.append(p);
  const b=document.createElement('button');b.textContent='Search & export the directory';b.className='wide-action';b.onclick=showPartners;metrics.append(b);
 }
}
function renderDataContext(parent){
 let text='';
 if(view==='access')text='Historical travel-time model. Routes, closures and current service availability are not represented.';
 if(view==='environment'&&environment==='water')text='Historical satellite observations of surface water. Flood risk and current flood warnings require separate Environment Agency data.';
 if(view==='services')text='OpenStreetMap locations. A mapped facility may be closed, duplicated or missing. Confirm current services and capacity locally.';
 if(primaryId==='built2030')text='2030 projection. This layer does not show observed buildings.';
 if(view==='needs'){const detail=document.createElement('details');detail.className='coverage-detail';detail.innerHTML='<summary>294 of 296 areas matched</summary><p>Barnsley and Sheffield use different source and atlas codes and are shown without data pending reconciliation.</p>';parent.append(detail);}
 if(text){const p=document.createElement('p');p.className='data-context';p.textContent=text;parent.append(p);}
}
function addAreaBriefing(){
 const p=selectedArea.properties,box=$('areaCard');
 const data=preparednessData.records[p.code];
 const extra=document.createElement('div');extra.className='area-needs';extra.innerHTML=data?'<span>Neighbourhoods in England’s most deprived tenth</span><strong>'+fmt(data.imd_top10_pct,1)+'%</strong>':'<span>Deprivation data awaits boundary-code reconciliation.</span>';
 const button=document.createElement('button');button.className='wide-action primary-action';button.textContent='Open area briefing';button.onclick=openBriefing;extra.append(button);const keep=document.createElement('button');keep.id='shortlistArea';keep.className='wide-action';keep.textContent=shortlist.has(p.code)?'Remove from shortlist':'Add to shortlist';keep.setAttribute('aria-pressed',String(shortlist.has(p.code)));keep.onclick=()=>toggleShortlist(p.code);extra.append(keep);box.append(extra);
}
function metricCard(label,value,note){return '<div class="brief-stat"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></div>';}
function briefingHTML(){
 const p=selectedArea.properties,n=preparednessData.records[p.code];
 let html='<p class="brief-lead">'+esc(p.name)+' · '+esc(p.code)+' · England</p><div class="brief-grid">';
 html+=metricCard('Modelled population',fmt(p.population_2025),'WorldPop · 2025')+metricCard('Population density',fmt(p.density_km2,1),'People / km² · WorldPop 2025');
 for(const[key,meta]of Object.entries(NEEDS_METRICS)){const value=p[key],count=meta.numerator_field&&p[meta.numerator_field];html+=metricCard(meta.title,value!=null?fmt(value,1)+'%':'Unavailable',meta.unit+' · '+(meta.period||'IoD2025')+(count!=null?' · '+fmt(count)+' of '+fmt(p[meta.denominator_field]):''));}
 html+='</div><h3>Using this area profile</h3><p>These figures describe the whole local authority. For a specific incident, establish the affected footprint and households before estimating needs. Local averages can conceal pockets of deprivation.</p>';
 if(!n)html+='<p class="data-context">The atlas and deprivation source use different codes for this authority. Values have been withheld pending boundary reconciliation.</p>';
 html+='<h3>Local support and recovery</h3><p>Use the <a href="https://www.ukcommunityfoundations.org/find-a-foundation" target="_blank" rel="noopener">community foundation directory</a> to confirm local funding routes. Record practical assistance, financial help and longer-term wellbeing support separately when developing the response.</p>';
 html+='<h3>Current conditions</h3><p><a href="https://check-for-flooding.service.gov.uk/alerts-and-warnings" target="_blank" rel="noopener">Environment Agency flood alerts and warnings</a>. The atlas’s surface-water maps are historical observations and do not show current flooding.</p>';
 html+='<h3>Sources and interpretation</h3><p><a href="'+NEEDS_SOURCE+'" target="_blank" rel="noopener">MHCLG English Indices of Deprivation 2025, corrected File 10</a>. Deprivation concentration is a share of neighbourhoods. Income measures use published domain/sub-index average scores × 100 and their own source population bases. They have not been multiplied by the modelled population.</p><p>'+esc(preparednessData.geography)+'</p><p>Population: WorldPop R2025A, 2025 model estimate, aggregated by native source-cell centres. Source raster footprint: '+fmt(p.population_coverage_pct,1)+'% of this authority’s display mask; this is not a census response rate. Boundary area: '+fmt(p.area_km2,1)+' km². Different sources refer to different dates.</p><p class="method-note">Prepared '+new Date().toLocaleDateString('en-GB')+' · Mapping by Hugh Lamarque</p>';
 html+='<p>Census indicators: <a href="https://www.nomisweb.co.uk/datasets/c2021ts038" target="_blank" rel="noopener">ONS TS038 disability</a> and <a href="https://www.nomisweb.co.uk/datasets/c2021ts045" target="_blank" rel="noopener">TS045 car availability</a>. '+esc(censusData.geography_note)+' Rates are calculated from published numerator ÷ denominator × 100. Disability rates are crude, not age-standardised; differences partly reflect age structures. Census disclosure controls introduce small count changes.</p>';
 return html;
}
function openBriefing(){
 if(!selectedArea)return;const p=selectedArea.properties;$('briefTitle').textContent=p.name;$('briefBody').innerHTML=briefingHTML();
 $('downloadBriefCSV').onclick=()=>exportRows([p],'England-'+p.code+'-briefing.csv');
 $('downloadBrief').onclick=()=>{
  const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+esc(p.name)+' · Area briefing</title><style>body{max-width:880px;margin:40px auto;padding:0 24px;font:15px/1.6 Arial,sans-serif;color:#253d39}h1{font-size:32px}h3{margin-top:28px}.brief-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.brief-stat{padding:15px;background:#f1f5f2;border:1px solid #d4dfda}.brief-stat strong{display:block;font-size:26px}.brief-stat small{display:block}a{color:#185e52}.method-note{font-size:12px}@media print{body{margin:0}a{color:inherit}.brief-stat{break-inside:avoid}}@media(max-width:500px){.brief-grid{grid-template-columns:1fr}}</style><h1>'+esc(p.name)+' · Area briefing</h1>'+briefingHTML()+'</html>';
  downloadBlob(html,'England-'+p.code+'-briefing.html','text/html;charset=utf-8');
 };$('briefing').showModal();
}
function downloadBlob(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function downloadTable(rows,name){if(!rows.length){toast('No matching records to export.');return;}const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))],cell=v=>'"'+String(v??'').replace(/^[=+@\-]/,"'$&").replaceAll('"','""')+'"';downloadBlob('\ufeff'+[keys,...rows.map(r=>keys.map(k=>r[k]))].map(r=>r.map(cell).join(',')).join('\r\n'),name,'text/csv;charset=utf-8');}
function filteredPartners(){const q=$('partnerSearch').value.trim().toLowerCase(),region=$('partnerRegion').value,type=$('partnerType').value,saved=$('partnerSaved').checked;return partnerRecords.filter(p=>(!region||p.region===region)&&(!type||p.category===type)&&(!saved||savedPartners.has(p.id))&&(!q||[p.name,p.region,p.address,p.directory_area].join(' ').toLowerCase().includes(q)));}
function showPartners(){history.replaceState(null,'','#partners-directory');$('mapPage').hidden=true;$('analysisPage').hidden=true;$('partnersPage').hidden=false;$('mapTab').classList.remove('active');$('analysisTab').classList.remove('active');$('partnersTab').classList.add('active');renderPartners();}
function renderPartners(){
 const matches=filteredPartners();$('partnerCount').textContent=matches.length+' organisations shown · '+foundationFeatures.length+' community foundations + '+resilienceData.records.length+' resilience forums in this directory';$('partnersExport').disabled=!matches.length;const box=$('partnerCards');box.replaceChildren();
 if(!matches.length){const p=document.createElement('p');p.className='empty-state';p.textContent='No organisations match these filters. Clear the filters or try a broader area name.';box.append(p);return;}
 for(const p of matches){const card=document.createElement('article');card.className='partner-card';card.innerHTML='<p class="eyebrow">'+esc(p.region)+' · '+esc(p.category)+'</p><h2>'+esc(p.name)+'</h2><p>'+esc(p.role)+'</p>'+(p.address?'<p class="office-address">'+esc(p.address)+'</p>':'')+(p.phone?'<p><a href="tel:'+esc(p.phone.replace(/[^+0-9]/g,''))+'">'+esc(p.phone)+'</a></p>':'')+'<div class="partner-actions">'+(p.website&&/^https?:/.test(p.website)?'<a href="'+esc(p.website)+'" target="_blank" rel="noopener noreferrer">Website ↗</a>':'')+(p.risk_register?'<a href="'+esc(p.risk_register)+'" target="_blank" rel="noopener noreferrer">Risk register ↗</a>':'')+'<a href="'+esc(p.source_url)+'" target="_blank" rel="noopener noreferrer">Source & contacts ↗</a></div><details class="partner-provenance"><summary>Directory checked '+esc(p.checked)+'</summary><p>'+esc(p.verification)+'</p>'+(p.directory_updated!=='Not stated'?'<p>Source directory updated '+esc(p.directory_updated)+'.</p>':'')+'</details>';
 const actions=document.createElement('div');actions.className='partner-actions';
 const save=document.createElement('button');save.textContent=savedPartners.has(p.id)?'Saved ✓':'Save organisation';save.setAttribute('aria-pressed',String(savedPartners.has(p.id)));save.onclick=()=>{if(savedPartners.has(p.id))savedPartners.delete(p.id);else savedPartners.add(p.id);try{localStorage.setItem('england-atlas-partners',JSON.stringify([...savedPartners]));}catch{}renderPartners();};actions.append(save);
 if(p.feature){const mapButton=document.createElement('button');mapButton.textContent='Show office on map';mapButton.onclick=()=>{const f=p.feature;clearArea();setView('partners');map.setView([f.geometry.coordinates[1],f.geometry.coordinates[0]],11);L.popup().setLatLng([f.geometry.coordinates[1],f.geometry.coordinates[0]]).setContent(popup(layer('community_foundations'),f)).openOn(map);if(innerWidth<=1024)showPanel(false);};actions.append(mapButton);}
 card.append(actions);box.append(card);}
}
