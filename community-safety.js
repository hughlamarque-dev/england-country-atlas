'use strict';

/*
 * Optional adapter for data/community_safety.json.
 *
 * The file is deliberately optional: the existing England Atlas continues to
 * load normally until the QGIS importer has produced and uploaded the first
 * aggregated Police.uk file.
 */
let communitySafetyData = null;
let communitySafetyPeriod = null;

const COMMUNITY_SAFETY_COLORS = [
 '#f3f7f4', '#d5e9dc', '#a5ccb1', '#6d9e82', '#39715a', '#174a38'
];

const COMMUNITY_SAFETY_FALLBACK_CATEGORIES = [
 ['total','All recorded crime'],
 ['violence','Violence and sexual offences'],
 ['burglary','Burglary'],
 ['robbery','Robbery'],
 ['anti_social','Anti-social behaviour'],
 ['vehicle','Vehicle crime'],
 ['theft','Theft'],
 ['criminal_damage','Criminal damage and arson'],
 ['drugs','Drugs'],
 ['public_order','Public order'],
 ['weapons','Possession of weapons'],
 ['other','Other recorded crime']
];

const COMMUNITY_SAFETY_SOURCE = 'https://data.police.uk/data/';

function communitySafetyCategories(){
 const incoming=communitySafetyData?.categories;
 return Array.isArray(incoming)&&incoming.length?incoming:COMMUNITY_SAFETY_FALLBACK_CATEGORIES.map(([key,title])=>({key,title}));
}

// The total-rate field in the QGIS export is intentionally shorter than the
// category fields: crime_rate_per_1000 rather than crime_total_rate_per_1000.
function communitySafetyAnalysisKey(key){return key==='total'?'crime_rate_per_1000':'crime_'+key+'_rate_per_1000';}
function communitySafetyCountKey(key){return key==='total'?'crime_total_12m':'crime_'+key+'_12m';}
function communitySafetyLayerId(key){return 'district_safety_'+key;}
function communitySafetyKeyForAnalysis(metric){
 const prefix='crime_';
 const suffix='_rate_per_1000';
 if(!String(metric).startsWith(prefix)||!String(metric).endsWith(suffix))return null;
 return String(metric).slice(prefix.length,-suffix.length)||'total';
}

function communitySafetyAvailableMonths(){
 const months=new Set();
 for(const record of Object.values(communitySafetyData?.records||{})){
  for(const row of (record.crime_monthly||[]))if(row?.month)months.add(row.month);
 }
 if(!months.size)for(const month of (communitySafetyData?.months||[]))months.add(month);
 return [...months].sort();
}

function communitySafetyMonthLabel(month){
 const [year,number]=String(month).split('-').map(Number);
 if(!year||!number)return String(month);
 return new Date(Date.UTC(year,number-1,1)).toLocaleDateString('en-GB',{month:'short',year:'numeric',timeZone:'UTC'});
}

function communitySafetyRangeLabel(months){
 if(!months.length)return 'available months';
 const first=communitySafetyMonthLabel(months[0]),last=communitySafetyMonthLabel(months.at(-1));
 return first===last?first:first+'–'+last;
}

function communitySafetyPeriodOptions(){
 const months=communitySafetyAvailableMonths(),options=[];
 for(const count of [12,6,3,1]){
  if(months.length<count)continue;
  const selected=months.slice(-count);
  options.push({value:'range:'+count,months:selected,label:(count===1?'Latest month':'Latest '+count+' months')+' · '+communitySafetyRangeLabel(selected)});
 }
 for(const month of [...months].reverse())options.push({value:'month:'+month,months:[month],label:communitySafetyMonthLabel(month)});
 return options;
}

function communitySafetyPeriodText(){
 const period=communitySafetyPeriod;
 return period?.label||'the selected period';
}

function communitySafetyMeasureText(){
 if(!communitySafetyData)return 'The community-safety file has not been uploaded yet. Run the QGIS importer and upload the aggregated JSON.';
 return 'Police-recorded activity for '+communitySafetyPeriodText()+', shown as an annualised rate per 1,000 residents. Counts come from the selected months. It reflects reporting and policing patterns as well as underlying incidents.';
}

function communitySafetySelectedCount(record,key){
 const selected=record?.__crime_selected_counts;
 if(selected&&Object.prototype.hasOwnProperty.call(selected,key))return selected[key];
 return record?.[communitySafetyCountKey(key)];
}

function communitySafetyRecordFields(record){
 const fields={};
 for(const [key,value] of Object.entries(record||{}))if(key.startsWith('crime_')||key.startsWith('__crime_'))fields[key]=value;
 return fields;
}

function communitySafetyRefreshFeatures(){
 const records=communitySafetyData?.records||{};
 const update=feature=>{
  const code=feature?.properties?.code,record=records[code];
  if(record)Object.assign(feature.properties,communitySafetyRecordFields(record));
 };
 for(const feature of areas||[])update(feature);
 for(const entry of active?.values?.()||[])if(entry.layer?.id?.startsWith('district_safety_'))for(const feature of entry.features||[])update(feature);
 if(selectedArea)update(selectedArea);
}

function communitySafetyApplyPeriod(value,{refresh=true}={}){
 if(!communitySafetyData)return;
 const option=(typeof value==='string'?communitySafetyPeriodOptions().find(item=>item.value===value):value)||communitySafetyPeriodOptions()[0];
 if(!option)return;
 communitySafetyPeriod=option;
 const categories=communitySafetyCategories();
 for(const record of Object.values(communitySafetyData.records||{})){
  const monthly=new Map((record.crime_monthly||[]).map(row=>[row.month,row]));
  const rows=option.months.map(month=>monthly.get(month)).filter(Boolean);
  const counts={};
  for(const category of categories){
   const field=category.key==='total'?'total':category.key;
   const count=rows.reduce((sum,row)=>sum+(Number(row[field])||0),0);
   counts[category.key]=rows.length?count:undefined;
   const population=Number(record.population_2025);
   const metric=communitySafetyAnalysisKey(category.key);
   record[metric]=rows.length&&population>0?count*12/rows.length*1000/population:record[metric]??null;
  }
  record.__crime_selected_counts=counts;
  record.__crime_selected_months=option.months.slice();
 }
 for(const category of categories){
  const metric=communitySafetyAnalysisKey(category.key),entry=layer?.(communitySafetyLayerId(category.key));
  if(entry){
   entry.title=category.title+' · annualised rate';
   entry.date=communitySafetyPeriodText();
   entry.unit='Annualised recorded offences per 1,000 residents';
  }
  const meta=manifest?.analysis_metrics?.[metric];
  if(meta){meta.title=category.title+' · annualised rate';meta.unit='annualised recorded offences per 1,000 residents';meta.period=communitySafetyPeriodText();}
 }
 if(!refresh)return;
 communitySafetyRefreshFeatures();
 if(typeof renderControls==='function')renderControls();
 if(typeof renderLegend==='function')renderLegend();
 if(selectedArea&&typeof renderAreaCard==='function'&&typeof addAreaBriefing==='function'){renderAreaCard();addAreaBriefing();}
 if($('briefing')?.open&&typeof briefingHTML==='function')$('briefBody').innerHTML=briefingHTML();
}

async function initialiseCommunitySafety(){
 try{
  const data=await getJSON('data/community_safety.json?v=20260919.1');
  if(!data||!data.records)throw Error('The community-safety data file is incomplete.');
  communitySafetyData=data;
  const districts=layer('districts');
  if(!districts)return;
  for(const category of communitySafetyCategories()){
   const key=category.key,title=category.title,metric=communitySafetyAnalysisKey(key);
   const breaks=data.breaks?.[key]||[10,20,40,80,120];
   const note=(data.measure_note||'Police-recorded activity.')+' '+(data.geography_note||'');
   manifest.layers.push({...districts,
    id:communitySafetyLayerId(key),
    title:title+' · annualised rate',
    group:'Community safety',
    date:'latest available period',
    source:'Police.uk open data downloads',
    source_url:data.source_url||COMMUNITY_SAFETY_SOURCE,
    unit:'Annualised recorded offences per 1,000 residents',
    note,
    count:Object.keys(data.records).length,
    style:{metric,breaks,colors:COMMUNITY_SAFETY_COLORS}
   });
   manifest.analysis_metrics[metric]={
    title:title+' · annualised rate',
    unit:'annualised recorded offences per 1,000 residents',
    decimals:1,
    period:'latest available period',
    source:'Police.uk open data downloads',
    source_url:data.source_url||COMMUNITY_SAFETY_SOURCE,
    note
   };
 }
 communitySafetyApplyPeriod(communitySafetyPeriodOptions().find(item=>item.value==='range:12')?.value,{refresh:false});
 }catch(error){
  communitySafetyData=null;
  if(typeof VIEWS!=='undefined'){
   const index=VIEWS.findIndex(item=>item[0]==='safety');
   if(index>=0)VIEWS.splice(index,1);
  }
  // A missing optional file must not stop the main atlas from opening.
  console.info('Community safety is not available in this release:',error.message);
 }
}

function renderCommunitySafetyControls(box,metrics){
 if(view!=='safety')return;
 const categories=communitySafetyCategories();
 const indicatorLabel=document.createElement('label');indicatorLabel.className='control-label';indicatorLabel.textContent='Recorded crime measure';indicatorLabel.htmlFor='safetyIndicator';
 const select=document.createElement('select');
 select.id='safetyIndicator';
 select.className='control-select';
 select.setAttribute('aria-label','Community safety indicator');
 for(const category of categories){
  const option=new Option(category.title,communitySafetyLayerId(category.key));
  option.selected=primaryId===communitySafetyLayerId(category.key);
  select.append(option);
 }
 select.onchange=e=>choose(e.target.value);
 indicatorLabel.append(select);box.append(indicatorLabel);
 const periodLabel=document.createElement('label');periodLabel.className='control-label';periodLabel.textContent='Time period';periodLabel.htmlFor='safetyPeriod';
 const periodSelect=document.createElement('select');periodSelect.id='safetyPeriod';periodSelect.className='control-select';periodSelect.setAttribute('aria-label','Community safety time period');
 const periods=communitySafetyPeriodOptions(),recent=document.createElement('optgroup');recent.label='Recent periods';
 for(const option of periods.filter(item=>item.value.startsWith('range:'))){const item=new Option(option.label,option.value);item.selected=option.value===communitySafetyPeriod?.value;recent.append(item);}
 periodSelect.append(recent);
 const monthly=periods.filter(item=>item.value.startsWith('month:'));
 if(monthly.length){const group=document.createElement('optgroup');group.label='Monthly releases';for(const option of monthly){const item=new Option(option.label,option.value);item.selected=option.value===communitySafetyPeriod?.value;group.append(item);}periodSelect.append(group);}
 periodSelect.onchange=e=>communitySafetyApplyPeriod(e.target.value);
 periodLabel.append(periodSelect);box.append(periodLabel);
 const p=document.createElement('p');p.className='measure-explanation';
 if(communitySafetyData){
  p.textContent=communitySafetyMeasureText();
 }else{
  p.textContent='The community-safety file has not been uploaded yet. Run the QGIS importer and upload the aggregated JSON.';
 }
 metrics.append(p);
 if(communitySafetyData){
  const b=document.createElement('button');b.textContent='Compare all areas';b.className='wide-action';
  b.onclick=()=>{$('analysisMetric').value=communitySafetyAnalysisKey(categories[0].key);showAnalysis();};
  metrics.append(b);
 }
}

function communitySafetyContext(parent){
 if(view!=='safety')return;
 const p=document.createElement('p');p.className='data-context';
 p.textContent=communitySafetyData?
  'The map uses local-authority aggregation. Police.uk street locations are anonymised and approximate, so this view does not publish incident points.':
  'No community-safety data has been uploaded yet. The QGIS importer produces the required aggregated file.';
 parent.append(p);
}

function communitySafetyBriefingHTML(properties){
 const record=communitySafetyData?.records?.[properties.code];
 if(!record)return '';
 const categories=communitySafetyCategories().filter(category=>category.key!=='total').slice(0,6);
 let html='<h3>Community safety</h3>';
 html+='<p class="data-context">Police-recorded activity · '+esc(communitySafetyPeriodText())+'. Rates are annualised for comparability. These figures describe recorded/reporting patterns, not all underlying harm.</p>';
 html+='<div class="brief-grid">';
 html+='<div class="brief-stat"><span>All recorded crime</span><strong>'+esc(metricValue(record.crime_rate_per_1000,'crime_rate_per_1000',1))+'</strong><small>annualised per 1,000 · '+fmt(communitySafetySelectedCount(record,'total'))+' in selected period</small></div>';
 for(const category of categories){
  const field=communitySafetyAnalysisKey(category.key);
  html+='<div class="brief-stat"><span>'+esc(category.title)+'</span><strong>'+esc(metricValue(record[field],field,1))+'</strong><small>annualised per 1,000 · '+fmt(communitySafetySelectedCount(record,category.key))+' in selected period</small></div>';
 }
 html+='</div>';
 html+='<p><a href="'+esc(communitySafetyData.source_url||COMMUNITY_SAFETY_SOURCE)+'" target="_blank" rel="noopener">Police.uk source and downloads ↗</a></p>';
 return html;
}
