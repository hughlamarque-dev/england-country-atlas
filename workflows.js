'use strict';
const initialAtlasState=new URLSearchParams(location.search);
let shortlist=new Set();
try{shortlist=new Set(JSON.parse(localStorage.getItem('england-atlas-shortlist')||'[]').filter(x=>/^E\d{8}$/.test(x)).slice(0,6));}catch{}
function saveShortlist(){try{localStorage.setItem('england-atlas-shortlist',JSON.stringify([...shortlist]));}catch{}}
function toggleShortlist(code){
 if(shortlist.has(code))shortlist.delete(code);
 else if(shortlist.size<6)shortlist.add(code);
 else{toast('Choose up to six areas. Remove one to add another.');return;}
 saveShortlist();renderShortlist();if(!$('analysisPage').hidden)renderAnalysis();
 const b=$('shortlistArea');if(b){b.textContent=shortlist.has(selectedArea?.properties.code)?'Remove from shortlist':'Add to shortlist';b.setAttribute('aria-pressed',String(shortlist.has(selectedArea?.properties.code)));}
}
function shortlistRows(){return [...shortlist].map(code=>areas.find(f=>f.properties.code===code)?.properties).filter(Boolean);}
function comparisonHTML(){
 const rows=shortlistRows();
 if(!rows.length)return '<p>Add areas from the list below or from an area’s map card.</p>';
 let html='<table class="comparison-table"><caption>Area profiles · source periods differ. Flood measures: high + medium likelihood (≥1% annual chance).</caption><thead><tr><th scope="col">Measure</th>'+rows.map(p=>'<th scope="col">'+esc(p.name)+'</th>').join('')+'</tr></thead><tbody>';
 const metrics={population_2025:{title:'Modelled population',unit:'residents',period:'WorldPop 2025',decimals:0},...NEEDS_METRICS,...FLOOD_METRICS};
 for(const[key,m]of Object.entries(metrics))html+='<tr><th scope="row">'+esc(m.title)+'<small>'+esc(m.unit+' · '+(m.period||'IoD2025'))+'</small></th>'+rows.map(p=>'<td>'+esc(p[key]==null?'Unavailable':metricValue(p[key],key,m.decimals))+'</td>').join('')+'</tr>';
 return html+'</tbody></table>';
}
function renderShortlist(){
 const rows=shortlistRows();$('shortlistCount').textContent=rows.length+' / 6 areas';$('shortlistChips').replaceChildren();
 for(const p of rows){const b=document.createElement('button');b.textContent=p.name+' ×';b.setAttribute('aria-label','Remove '+p.name+' from shortlist');b.onclick=()=>toggleShortlist(p.code);$('shortlistChips').append(b);}
 $('shortlistTable').innerHTML=comparisonHTML();$('shortlistExport').disabled=!rows.length;$('shortlistBrief').disabled=!rows.length;$('shortlistClear').disabled=!rows.length;
}
function currentAtlasLink(){
 const u=new URL(location.href);u.search='';
 if(selectedArea)u.searchParams.set('area',selectedArea.properties.code);
 const key=!$('analysisPage').hidden?$('analysisMetric').value:primaryId?.replace('district_need_','').replace('district_flood_','');
 if(key&&(NEEDS_METRICS[key]||METRICS[key]))u.searchParams.set('indicator',key);
 if(shortlist.size)u.searchParams.set('compare',[...shortlist].join(','));
 if(!$('partnersPage').hidden){if($('partnerSearch').value)u.searchParams.set('partner',$('partnerSearch').value);if($('partnerRegion').value)u.searchParams.set('region',$('partnerRegion').value);if($('partnerType').value)u.searchParams.set('partnerType',$('partnerType').value);if($('partnerSaved').checked)u.searchParams.set('saved',filteredPartners().map(p=>p.id).join(','));}
 return u.href;
}
function shareAtlasView(){
 $('shareURL').value=currentAtlasLink();$('shareStatus').textContent='The link includes the selected area, indicator, shortlist and directory filters, where applicable.';
 $('shareDialog').showModal();$('shareURL').focus();$('shareURL').select();
}
async function restoreAtlasState(){
 await loadAreas();shortlist=new Set([...shortlist].filter(code=>areas.some(a=>a.properties.code===code)));
 if(initialAtlasState.has('compare'))shortlist=new Set(initialAtlasState.get('compare').split(',').filter(code=>areas.some(a=>a.properties.code===code)).slice(0,6));
 saveShortlist();const metric=initialAtlasState.get('indicator');
 if(metric&&METRICS[metric]){if(!$('analysisPage').hidden){$('analysisMetric').value=metric;renderAnalysis();}else if(view==='flood'&&FLOOD_METRICS[metric])choose('district_flood_'+metric);else if(view==='needs'&&NEEDS_METRICS[metric])choose('district_need_'+metric);else if(view==='population'&&['population_2025','density_km2'].includes(metric))choose(metric==='population_2025'?'district_population':'district_density');}
 const area=areas.find(a=>a.properties.code===initialAtlasState.get('area'));if(area)selectArea(area,{zoom:true});
 if(initialAtlasState.has('partner'))$('partnerSearch').value=initialAtlasState.get('partner');
 if(initialAtlasState.has('region'))$('partnerRegion').value=initialAtlasState.get('region');
 if(initialAtlasState.has('partnerType'))$('partnerType').value=initialAtlasState.get('partnerType');if(initialAtlasState.has('saved')){savedPartners=new Set(initialAtlasState.get('saved').split(',').filter(id=>partnerRecords.some(p=>p.id===id)));$('partnerSaved').checked=true;}if(!$('partnersPage').hidden)renderPartners();renderShortlist();
}
function initialiseWorkflows(){
 for(const id of ['shareView','shareComparison','sharePartners'])$(id).onclick=shareAtlasView;
 $('closeShare').onclick=()=>$('shareDialog').close();
 $('copyShare').onclick=async()=>{try{await navigator.clipboard.writeText($('shareURL').value);$('shareStatus').textContent='Link copied.';}catch{$('shareURL').focus();$('shareURL').select();$('shareStatus').textContent='Select and copy the link above.';}};
 $('shortlistClear').onclick=()=>{shortlist.clear();saveShortlist();renderShortlist();renderAnalysis();};
 $('shortlistExport').onclick=()=>exportRows(shortlistRows(),'England-shortlist.csv');
 $('shortlistBrief').onclick=()=>downloadBlob('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>England · Area comparison</title><style>body{font:14px/1.6 Arial;color:#244e46;margin:30px}table{border-collapse:collapse;width:100%}th,td{padding:12px;text-align:left;border-bottom:1px solid #ccc}th small{display:block;font-weight:400}tr{break-inside:avoid}a{color:inherit}@media print{body{margin:0}table{font-size:10px}}</style><h1>England · Area comparison</h1>'+comparisonHTML()+floodSourceHTML()+'<p>Whole local-authority context. These are not estimates of people affected by an incident. Percentages describe different populations and must not be added or averaged. Disability rates are crude, not age-standardised.</p><p><a href="'+NEEDS_SOURCE+'">IoD2025 corrected File 10</a> · <a href="https://www.nomisweb.co.uk/datasets/c2021ts038">Census TS038 disability</a> · <a href="https://www.nomisweb.co.uk/datasets/c2021ts045">Census TS045 car availability</a>. '+esc(censusData.geography_note)+'</p><p>Population: WorldPop R2025A, 2025 model. Export CSV for Census numerators and denominators.</p><p><a href="'+esc(currentAtlasLink())+'">Open this atlas view</a></p><p>Prepared '+new Date().toLocaleDateString('en-GB')+' · Mapping by Hugh Lamarque</p></html>','England-area-comparison.html','text/html;charset=utf-8');
}
