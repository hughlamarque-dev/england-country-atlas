'use strict';
let floodData;
const FLOOD_METRICS={};
const FLOOD_COLORS=['#f0f9ff','#cce6f5','#91c4e2','#4f99c5','#256393','#123d62'];
async function initialiseFlood(){
 floodData=await getJSON('data/flood_risk.json');Object.assign(FLOOD_METRICS,floodData.metrics);
 const districts=layer('districts');
 for(const[key,meta]of Object.entries(FLOOD_METRICS)){
  manifest.analysis_metrics[key]=meta;
  manifest.layers.push({...districts,id:'district_flood_'+key,title:meta.title+' · ≥1% annual chance',group:'Flood exposure',date:meta.period,source:meta.source,source_url:meta.source_url,unit:meta.unit+' · '+meta.period,note:meta.note+' '+floodData.geography_note,count:Object.keys(floodData.records).length,style:{metric:key,breaks:meta.breaks,colors:FLOOD_COLORS}});
 }
}
function renderFloodControls(box,metrics){
 if(view!=='flood')return;
 const key=primaryId?.replace('district_flood_',''),meta=FLOOD_METRICS[key],hazard=meta?.hazard||'rofrs';
 choiceBox(box,[['rofrs','Rivers & sea'],['rofsw','Surface water']],hazard,id=>{
  const candidate=id+key.slice(hazard.length);choose('district_flood_'+(FLOOD_METRICS[candidate]?candidate:id+'_people_high_medium_pct'));
 });
 const label=document.createElement('label');label.htmlFor='floodIndicator';label.className='control-label';label.textContent='Exposure at ≥1% annual chance';box.append(label);
 const select=document.createElement('select');select.id='floodIndicator';select.className='control-select';select.setAttribute('aria-label','Flood exposure indicator');
 for(const[k,m]of Object.entries(FLOOD_METRICS)){if(m.hazard!==hazard)continue;const option=new Option(m.title.split(' · ')[1],'district_flood_'+k);option.selected=k===key;select.append(option);}select.onchange=e=>choose(e.target.value);box.append(select);
 const p=document.createElement('p');p.className='measure-explanation';p.textContent='High + medium likelihood bands · '+meta.period+'. Shading compares whole authorities; it does not show where flooding occurs within them.';metrics.append(p);
 const b=document.createElement('button');b.className='wide-action';b.textContent='Compare all areas';b.onclick=()=>{$('analysisMetric').value=key;showAnalysis();};metrics.append(b);
 const details=document.createElement('details');details.className='coverage-detail';details.innerHTML='<summary>293 of 296 areas matched</summary><p>'+esc(floodData.geography_note)+'</p>';metrics.append(details);
 const definitions=document.createElement('details');definitions.className='coverage-detail';definitions.innerHTML='<summary>Definitions & source checks</summary><p>'+esc(meta.note)+'</p><p>'+esc(floodData.source_issue)+'</p><p>'+esc(floodData.percentage_note)+'</p><a href="'+esc(meta.source_url)+'" target="_blank" rel="noopener">Environment Agency source ↗</a>';metrics.append(definitions);
}
function floodSourceHTML(){
 return '<p>Environment Agency: <a href="'+floodData.sources.rofrs.url+'" target="_blank" rel="noopener">rivers and sea · June 2026</a>; <a href="'+floodData.sources.rofsw.url+'" target="_blank" rel="noopener">surface water · September 2025</a>. NRD 2023 property base. Estimated people equal residential properties × 2.36 for rivers and sea, or × 2.35 for surface water. These are long-term exposure estimates. The two sources overlap and must not be added.</p><p>'+esc(floodData.geography_note)+'</p><details><summary>Source inconsistencies retained</summary><p>'+esc(floodData.source_issue)+'</p><p>'+esc(floodData.percentage_note)+'</p></details>';
}
function floodBriefingHTML(p){
 let html='<h3>Flood exposure</h3><p>Whole-authority summaries. High and medium bands together represent at least a 1% annual chance. Property counts include homes, non-residential and unclassified properties.</p>';
 if(!floodData.records[p.code])return html+'<p class="data-context">'+esc(floodData.withheld[p.name]||'No matching flood data.')+'</p>';
 for(const[hazard,s]of Object.entries(floodData.sources)){
  html+='<h4>'+esc(s.title)+' · '+esc(s.period)+'</h4><div class="table-wrap"><table class="flood-table"><thead><tr><th>Likelihood</th><th>Estimated people</th><th>People (%)</th><th>Properties</th>'+(hazard==='rofsw'?'<th>Ground-floor properties</th>':'')+'</tr></thead><tbody>';
  for(const band of [...s.bands,'all']){const label=band==='all'?'All published bands':band.replace('_',' ').replace(/^./,c=>c.toUpperCase());html+='<tr><th scope="row">'+esc(label)+'</th><td>'+fmt(p[hazard+'_people_'+band])+'</td><td>'+fmt(p[hazard+'_people_'+band+'_pct'],1)+'%</td><td>'+fmt(p[hazard+'_properties_'+band])+'</td>'+(hazard==='rofsw'?'<td>'+fmt(p[hazard+'_groundfloor_'+band])+'</td>':'')+'</tr>';}
  html+='</tbody></table></div>';
 }
 return html+'<p class="method-note">High: ≥3.3% annual chance; medium: 1–&lt;3.3%. Rivers/sea low: 0.1–&lt;1%; very low: &lt;0.1%. Surface-water low: &lt;1%. “All published bands” covers different likelihood ranges in the two products. People are shown rounded to whole estimates; exports retain source precision.</p>'+floodSourceHTML();
}
function floodExportMetadata(p){return {
 flood_match_method:p.flood_match_method||'',flood_source_name:p.flood_source_name||'',flood_geography_note:floodData.geography_note,
 flood_missing_reason:floodData.withheld[p.name]||'',rofrs_period:'June 2026',rofsw_period:'September 2025',flood_property_base:'NRD 2023',
 rofrs_source:floodData.sources.rofrs.url,rofsw_source:floodData.sources.rofsw.url,
 flood_people_method:'Published residential-property estimates: RoFRS × 2.36; RoFSW × 2.35. Not Census or WorldPop counts.',
 flood_high_medium_method:'Sum of published high and medium bands; annual likelihood at least 1%. Percentage fields already on 0–100 scale.',
 flood_source_issue:floodData.source_issue,flood_percentage_note:floodData.percentage_note,
 flood_interpretation:'Whole-authority long-term exposure. Do not add river/sea and surface-water figures. Does not estimate people affected by a current incident.'
};}
