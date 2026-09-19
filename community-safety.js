'use strict';

/*
 * Optional adapter for data/community_safety.json.
 *
 * The file is deliberately optional: the existing England Atlas continues to
 * load normally until the QGIS importer has produced and uploaded the first
 * aggregated Police.uk file.
 */
let communitySafetyData = null;

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

function communitySafetyAnalysisKey(key){return 'crime_'+key+'_rate_per_1000';}
function communitySafetyLayerId(key){return 'district_safety_'+key;}
function communitySafetyKeyForAnalysis(metric){
 const prefix='crime_';
 const suffix='_rate_per_1000';
 if(!String(metric).startsWith(prefix)||!String(metric).endsWith(suffix))return null;
 return String(metric).slice(prefix.length,-suffix.length);
}

async function initialiseCommunitySafety(){
 try{
  const data=await getJSON('data/community_safety.json?v=20260919.1');
  if(!data||!data.records)throw Error('The community-safety data file is incomplete.');
  communitySafetyData=data;
  const districts=layer('districts');
  if(!districts)return;
  const period=(data.period_start&&data.period_end)?data.period_start+' to '+data.period_end:'latest release months';
  for(const category of communitySafetyCategories()){
   const key=category.key,title=category.title,metric=communitySafetyAnalysisKey(key);
   const breaks=data.breaks?.[key]||[10,20,40,80,120];
   const note=(data.measure_note||'Police-recorded activity.')+' '+(data.geography_note||'');
   manifest.layers.push({...districts,
    id:communitySafetyLayerId(key),
    title:title+' · 12-month rate',
    group:'Community safety',
    date:period,
    source:'Police.uk open data downloads',
    source_url:data.source_url||COMMUNITY_SAFETY_SOURCE,
    unit:'Recorded offences per 1,000 residents',
    note,
    count:Object.keys(data.records).length,
    style:{metric,breaks,colors:COMMUNITY_SAFETY_COLORS}
   });
   manifest.analysis_metrics[metric]={
    title:title+' · 12-month rate',
    unit:'recorded offences per 1,000 residents',
    decimals:1,
    period,
    source:'Police.uk open data downloads',
    source_url:data.source_url||COMMUNITY_SAFETY_SOURCE,
    note
   };
 }
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
 const select=document.createElement('select');
 select.className='control-select';
 select.setAttribute('aria-label','Community safety indicator');
 for(const category of categories){
  const option=new Option(category.title,communitySafetyLayerId(category.key));
  option.selected=primaryId===communitySafetyLayerId(category.key);
  select.append(option);
 }
 select.onchange=e=>choose(e.target.value);
 box.append(select);
 const p=document.createElement('p');p.className='measure-explanation';
 if(communitySafetyData){
  p.textContent='Police-recorded activity, shown as a rate per 1,000 residents for '+communitySafetyData.period_start+' to '+communitySafetyData.period_end+'. It reflects reporting and policing patterns as well as underlying incidents.';
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
 html+='<p class="data-context">Police-recorded activity · '+esc(communitySafetyData.period_start)+' to '+esc(communitySafetyData.period_end)+'. These figures describe recorded/reporting patterns, not all underlying harm.</p>';
 html+='<div class="brief-grid">';
 html+='<div class="brief-stat"><span>All recorded crime</span><strong>'+esc(metricValue(record.crime_rate_per_1000,'crime_rate_per_1000',1))+'</strong><small>per 1,000 residents · '+fmt(record.crime_total_12m)+'</small></div>';
 for(const category of categories){
  const field='crime_'+category.key+'_rate_per_1000',count='crime_'+category.key+'_12m';
  html+='<div class="brief-stat"><span>'+esc(category.title)+'</span><strong>'+esc(metricValue(record[field],field,1))+'</strong><small>per 1,000 residents · '+fmt(record[count])+'</small></div>';
 }
 html+='</div>';
 html+='<p><a href="'+esc(communitySafetyData.source_url||COMMUNITY_SAFETY_SOURCE)+'" target="_blank" rel="noopener">Police.uk source and downloads ↗</a></p>';
 return html;
}
