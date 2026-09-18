'use strict';
let comparisonHazard='rofsw',inspectedAuthority='',exposureBasis='people';
const PLANNING_PRESETS=[
 ['no_car_pct','Transport','Households without a car or van'],
 ['disability_limited_lot_pct','Accessible support','Disability · activities limited a lot'],
 ['child_income_deprivation_pct','Children','Income deprivation affecting children'],
 ['older_income_deprivation_pct','Older people','Income deprivation affecting older people'],
 ['income_deprivation_pct','Financial pressure','Income deprivation · all ages']
];

// Five equal-width intervals, with readable limits and no discarded extremes.
function chartExtent(values){
 const low=Math.min(0,...values),high=Math.max(0,...values),span=high-low||1;
 const power=10**Math.floor(Math.log10(span/5)),normal=span/5/power,step=([1,2,2.5,5,10].find(n=>n>=normal)||10)*power;
 const min=Math.floor(low/step)*step,max=Math.ceil(high/step)*step;
 return {min,max:max===min?min+step:max,step};
}
function histogramData(values){
 const extent=chartExtent(values),count=Math.round((extent.max-extent.min)/extent.step);
 const bins=Array.from({length:count},(_,i)=>({low:extent.min+i*extent.step,high:extent.min+(i+1)*extent.step,count:0}));
 for(const value of values)bins[Math.min(count-1,Math.max(0,Math.floor((value-extent.min)/extent.step)))].count++;
 return {...extent,bins};
}
function chartNumber(value){
 const abs=Math.abs(value);
 return abs>=1e6?fmt(value/1e6,1)+'m':abs>=10000?fmt(value/1000,1)+'k':fmt(value,abs>0&&abs<1?3:1);
}
function chartSVG(title,description,body){
 return '<svg viewBox="0 0 480 224" role="img" aria-label="'+esc(title)+'"><title>'+esc(title)+'</title><desc>'+esc(description)+'</desc>'+body+'</svg>';
}
function chartGrid(x,y,w,h,maxY,steps){
 let svg='';for(let i=0;i<=steps;i++){const value=maxY*i/steps,cy=y+h-h*i/steps;svg+='<line class="chart-gridline" x1="'+x+'" y1="'+cy+'" x2="'+(x+w)+'" y2="'+cy+'"/><text class="chart-tick" x="'+(x-9)+'" y="'+(cy+4)+'" text-anchor="end">'+chartNumber(value)+'</text>';}
 return svg;
}
function renderComparisonCharts(){
 if(!$('distributionCard'))return;
 renderPlanningPresets();renderPriorityChart();renderExposureChart();renderDistributionChart();renderRelationshipChart();
}
function renderDistributionChart(){
 const metric=$('analysisMetric').value,meta=METRICS[metric],rows=analysisRows.filter(p=>Number.isFinite(p[metric]));
 const values=rows.map(p=>p[metric]).sort((a,b)=>a-b),missing=analysisRows.length-rows.length,box=$('distributionCard');
 const period=meta.period||(NEEDS_METRICS[metric]?'IoD2025':metric==='population_2025'||metric==='density_km2'?'WorldPop 2025':'');
 let html='<div class="chart-heading"><div><p class="eyebrow">THE SELECTED INDICATOR</p><h2>How do areas compare?</h2></div><span class="chart-badge">'+rows.length+' with data</span></div><p class="chart-subtitle">'+esc(meta.title)+' · '+esc(meta.unit)+(period?' · '+esc(period):'')+'</p>';
 if(!values.length){box.innerHTML=html+'<p class="chart-empty">No matching authorities have data for this indicator. Change the search or indicator.</p>';return;}
 const data=histogramData(values),middle=Math.floor(values.length/2),median=values.length%2?values[middle]:(values[middle-1]+values[middle])/2;
 const countExtent=chartExtent(data.bins.map(b=>b.count)),maxY=Math.max(1,countExtent.max),steps=maxY/Math.max(1,countExtent.step);
 const x=44,y=22,w=416,h=153,sx=v=>x+(v-data.min)/(data.max-data.min)*w;
 let svg=chartGrid(x,y,w,h,maxY,steps)+'<text class="chart-axis-caption" x="44" y="12">Number of authorities</text>';
 data.bins.forEach((b,i)=>{const bx=sx(b.low),bw=w/data.bins.length,bh=b.count/maxY*h;svg+='<rect class="histogram-bar" x="'+(bx+3)+'" y="'+(y+h-bh)+'" width="'+(bw-6)+'" height="'+bh+'"><title>'+esc(chartNumber(b.low)+' to '+chartNumber(b.high)+': '+b.count+' authorities')+'</title></rect>';});
 for(let i=0;i<=data.bins.length;i++){const value=data.min+i*data.step;svg+='<text class="chart-tick" x="'+sx(value)+'" y="195" text-anchor="middle">'+chartNumber(value)+'</text>';}
 svg+='<line class="median-line" x1="'+sx(median)+'" y1="'+y+'" x2="'+sx(median)+'" y2="'+(y+h)+'"><title>Median authority: '+esc(metricValue(median,metric,meta.decimals))+'</title></line>';
 for(const p of rows.filter(p=>shortlist.has(p.code)))svg+='<path class="shortlist-mark" d="M '+sx(p[metric])+' 177 l -5 8 h 10 z"><title>'+esc(p.name+': '+metricValue(p[metric],metric,meta.decimals))+'</title></path>';
 svg+='<text class="chart-axis-caption" x="252" y="218" text-anchor="middle">'+esc(meta.unit)+'</text>';
 html+=chartSVG('Distribution of '+meta.title,rows.length+' authorities grouped by value. '+missing+' unavailable. Dashed line is the unweighted authority median.',svg);
 html+='<div class="chart-statline"><span><i class="median-key"></i>Median authority <strong>'+esc(metricValue(median,metric,meta.decimals))+'</strong></span><span><i class="shortlist-key"></i>Shortlisted</span></div><p class="chart-note">'+rows.length+' of '+analysisRows.length+' authorities in this search · '+missing+' unavailable. Each authority has equal weight; the median is not an England-wide population rate.</p>';
 html+='<details class="chart-data"><summary>View chart values</summary><table><caption>'+esc(meta.title)+' · '+esc(meta.unit)+'</caption><thead><tr><th scope="col">Value interval</th><th scope="col">Authorities</th></tr></thead><tbody>'+data.bins.map((b,i)=>'<tr><th scope="row">'+chartNumber(b.low)+' to '+(i===data.bins.length-1?'':'&lt; ')+chartNumber(b.high)+'</th><td>'+b.count+'</td></tr>').join('')+'</tbody></table><p class="chart-note">'+esc(meta.note||'Values summarise December 2025 local authority boundaries. Population is modelled, not a Census count.')+'</p></details>';
 box.innerHTML=html;
}
function renderRelationshipChart(){
 const box=$('relationshipCard'),key=comparisonHazard+'_people_high_medium_pct',source=floodData.sources[comparisonHazard];
 const rows=analysisRows.filter(p=>Number.isFinite(p.income_deprivation_pct)&&Number.isFinite(p[key]));
 if(!rows.some(p=>p.code===inspectedAuthority))inspectedAuthority='';
 let html='<div class="chart-heading"><div><p class="eyebrow">TWO PLANNING PERSPECTIVES</p><h2>Income & flood exposure</h2></div><span class="chart-badge">'+rows.length+' matched</span></div><div class="chart-hazards" role="group" aria-label="Flood source for relationship chart"><button data-hazard="rofsw" aria-pressed="'+(comparisonHazard==='rofsw')+'">Surface water</button><button data-hazard="rofrs" aria-pressed="'+(comparisonHazard==='rofrs')+'">Rivers & sea</button></div>';
 if(rows.length){
  const x=44,y=22,w=416,h=153,xExtent=chartExtent(rows.map(p=>p.income_deprivation_pct)),yExtent=chartExtent(rows.map(p=>p[key])),maxX=xExtent.max,maxY=yExtent.max,sx=v=>x+v/maxX*w,sy=v=>y+h-v/maxY*h;
  let svg=chartGrid(x,y,w,h,maxY,maxY/yExtent.step)+'<text class="chart-axis-caption" x="44" y="12">Estimated people exposed · % of EA population</text>';
  for(let i=0;i<=maxX/xExtent.step;i++)svg+='<text class="chart-tick" x="'+sx(i*xExtent.step)+'" y="195" text-anchor="middle">'+chartNumber(i*xExtent.step)+'</text>';
  for(const p of [...rows].sort((a,b)=>Number(shortlist.has(a.code))-Number(shortlist.has(b.code))))svg+='<circle class="scatter-dot '+(shortlist.has(p.code)?'shortlisted':'')+'" data-authority="'+p.code+'" cx="'+sx(p.income_deprivation_pct)+'" cy="'+sy(p[key])+'" r="'+(shortlist.has(p.code)?5:3.8)+'"><title>'+esc(p.name+' · Income deprivation '+fmt(p.income_deprivation_pct,1)+'%; flood exposure '+metricValue(p[key],key,1))+'</title></circle>';
  const inspected=rows.find(p=>p.code===inspectedAuthority);
  if(inspected)svg+='<circle class="inspected-dot" cx="'+sx(inspected.income_deprivation_pct)+'" cy="'+sy(inspected[key])+'" r="8"/>';
  svg+='<text class="chart-axis-caption" x="252" y="218" text-anchor="middle">Income deprivation · % · IoD2025</text>';
  html+=chartSVG('Income deprivation and '+source.title.toLowerCase()+' flood exposure',rows.length+' local authorities. Each dot is one authority. Use the area selector below for exact values.',svg);
  html+='<div class="chart-inspector"><label for="inspectAuthority" class="sr-only">Inspect an authority on the income and flood chart</label><select id="inspectAuthority"><option value="">Inspect an authority…</option>'+[...rows].sort((a,b)=>a.name.localeCompare(b.name)).map(p=>'<option value="'+p.code+'"'+(p.code===inspectedAuthority?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select><button id="chartShortlist"'+(!inspected?' disabled':'')+'>'+(inspected&&shortlist.has(inspected.code)?'Remove':'Shortlist')+'</button></div>';
  html+='<p class="chart-inspection" role="status">'+(inspected?'<strong>'+esc(inspected.name)+'</strong> · Income '+fmt(inspected.income_deprivation_pct,1)+'% · Flood '+esc(metricValue(inspected[key],key,1)):'Select an area or a dot to inspect it. Gold dots are shortlisted areas.')+'</p>';
 }else html+='<p class="chart-empty">No authorities in this search have both measures.</p>';
 html+='<p class="chart-note">'+rows.length+' of '+analysisRows.length+' authorities in this search · '+(analysisRows.length-rows.length)+' without both measures. <a href="'+esc(source.url)+'" target="_blank" rel="noopener">EA '+esc(source.period)+'</a> · high + medium likelihood (≥1% annual chance). <a href="'+NEEDS_SOURCE+'" target="_blank" rel="noopener">IoD2025</a> uses inputs from different years. Area-level association does not identify which low-income households are exposed.</p>';
 box.innerHTML=html;
 box.querySelectorAll('[data-hazard]').forEach(b=>b.onclick=()=>{comparisonHazard=b.dataset.hazard;renderExposureChart();renderRelationshipChart();box.querySelector('[data-hazard="'+comparisonHazard+'"]').focus();});
 const inspect=$('inspectAuthority');
 if(inspect){
  inspect.onchange=()=>{inspectedAuthority=inspect.value;renderRelationshipChart();$('inspectAuthority').focus();};
  box.querySelectorAll('[data-authority]').forEach(dot=>dot.onclick=()=>{inspectedAuthority=dot.dataset.authority;renderRelationshipChart();});
  $('chartShortlist').onclick=()=>{toggleShortlist(inspectedAuthority);$('chartShortlist')?.focus();};
 }
}

function renderPlanningPresets(){
 const box=$('planningPresets');box.innerHTML='<span>Start with a planning question</span>';
 for(const[key,label,title]of PLANNING_PRESETS){const b=document.createElement('button');b.textContent=label;b.title=title;b.dataset.planning=key;b.setAttribute('aria-pressed',String($('analysisMetric').value===key));b.onclick=()=>{$('analysisMetric').value=key;renderAnalysis();box.querySelector('[data-planning="'+key+'"]').focus();};box.append(b);}
}
function topComparisonRows(key){
 return analysisRows.filter(p=>Number.isFinite(p[key])).sort((a,b)=>b[key]-a[key]||a.name.localeCompare(b.name)).slice(0,8);
}
function practicalBars(rows,key,meta,allValues){
 const max=Math.max(1,...allValues.filter(Number.isFinite));
 if(!rows.length)return '<p class="chart-empty">No authorities in this search have this measure.</p>';
 return '<div class="practical-bars" role="group" aria-label="Select an authority to add or remove it from the shortlist">'+rows.map((p,i)=>'<button class="practical-bar" data-shortlist="'+p.code+'" aria-pressed="'+shortlist.has(p.code)+'" aria-label="'+esc((shortlist.has(p.code)?'Remove ':'Shortlist ')+p.name)+'"><span class="practical-rank">'+(i+1)+'</span><span class="practical-name">'+esc(p.name)+'</span><strong>'+esc(metricValue(p[key],key,meta.decimals))+'</strong><span class="practical-track" aria-hidden="true"><span style="width:'+Math.max(0,100*p[key]/max)+'%"></span></span></button>').join('')+'</div>';
}
function wirePracticalBars(box){
 box.querySelectorAll('[data-shortlist]').forEach(b=>b.onclick=()=>{const code=b.dataset.shortlist;toggleShortlist(code);box.querySelector('[data-shortlist="'+code+'"]')?.focus();});
}
function renderPriorityChart(){
 const box=$('priorityCard'),key=$('analysisMetric').value,meta=METRICS[key],rows=topComparisonRows(key),valid=analysisRows.filter(p=>Number.isFinite(p[key])).length;
 const questions={no_car_pct:'Where might transport support matter?',disability_limited_lot_pct:'Where might accessible support matter?',disability_pct:'Where is disability more prevalent?',child_income_deprivation_pct:'Where is child income deprivation higher?',older_income_deprivation_pct:'Where is older-age income deprivation higher?',income_deprivation_pct:'Where is income deprivation higher?',imd_top10_pct:'Where is deprivation concentrated?'};
 const period=meta.period||(NEEDS_METRICS[key]?'IoD2025':key==='population_2025'||key==='density_km2'?'WorldPop 2025':'');
 const interpretation=key==='no_car_pct'?'Households, not people. Read alongside local public transport: no car does not establish transport isolation.':key.startsWith('disability')?'Crude Census rates, not age-standardised. Confirm individual support and access requirements locally.':NEEDS_METRICS[key]?'Area-level context for planning outreach. It does not establish an individual household’s need.':'Higher values describe this measure; they do not constitute an emergency-priority score.';
 box.innerHTML='<div class="chart-heading"><div><p class="eyebrow">SUPPORT PLANNING · SELECTED INDICATOR</p><h2>'+esc(questions[key]||'Which areas have the highest values?')+'</h2></div></div><p class="chart-subtitle">'+esc(meta.title)+' · '+esc(meta.unit)+(period?' · '+esc(period):'')+'</p>'+practicalBars(rows,key,meta,areas.map(f=>f.properties[key]))+'<p class="chart-note">Highest '+rows.length+' of '+valid+' authorities with data in this search · '+(analysisRows.length-valid)+' unavailable. Select an area to add or remove it from your shortlist; selected bars are gold.</p><p class="chart-note">'+esc(interpretation)+(meta.source_url?' <a href="'+esc(meta.source_url)+'" target="_blank" rel="noopener">Source ↗</a>':NEEDS_METRICS[key]?' <a href="'+NEEDS_SOURCE+'" target="_blank" rel="noopener">IoD2025 ↗</a>':'')+'</p>';
 wirePracticalBars(box);
}
function renderExposureChart(){
 const box=$('exposureCard'),key=comparisonHazard+'_people_high_medium'+(exposureBasis==='share'?'_pct':''),meta=FLOOD_METRICS[key],source=floodData.sources[comparisonHazard],rows=topComparisonRows(key),valid=analysisRows.filter(p=>Number.isFinite(p[key])).length;
 box.innerHTML='<div class="chart-heading"><div><p class="eyebrow">LONG-TERM FLOOD EXPOSURE</p><h2>Where is exposure greatest?</h2></div></div><div class="exposure-options"><div class="chart-hazards" role="group" aria-label="Flood source for exposure ranking"><button data-source="rofsw" aria-pressed="'+(comparisonHazard==='rofsw')+'">Surface water</button><button data-source="rofrs" aria-pressed="'+(comparisonHazard==='rofrs')+'">Rivers & sea</button></div><div class="chart-hazards" role="group" aria-label="Exposure ranking basis"><button data-basis="people" aria-pressed="'+(exposureBasis==='people')+'">Estimated people</button><button data-basis="share" aria-pressed="'+(exposureBasis==='share')+'">% exposed</button></div></div><p class="chart-subtitle">'+(exposureBasis==='share'?'Share of EA estimated population':'EA estimated people')+' · high + medium likelihood (≥1% annual chance) · '+esc(source.period)+'</p>'+practicalBars(rows,key,meta,areas.map(f=>f.properties[key]))+'<p class="chart-note">Highest '+rows.length+' of '+valid+' authorities with data in this search · '+(analysisRows.length-valid)+' unavailable. Select an area to shortlist it.</p><p class="chart-note">'+(exposureBasis==='share'?'Published high + medium percentages, using the EA denominator.':'Estimates use residential properties × '+source.factor+'.')+' These are whole-authority exposure estimates, not people affected by a current event. Flood sources overlap; do not add them. <a href="'+esc(source.url)+'" target="_blank" rel="noopener">EA source ↗</a></p>';
 wirePracticalBars(box);
 box.querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>{comparisonHazard=b.dataset.source;renderExposureChart();renderRelationshipChart();box.querySelector('[data-source="'+comparisonHazard+'"]').focus();});
 box.querySelectorAll('[data-basis]').forEach(b=>b.onclick=()=>{exposureBasis=b.dataset.basis;renderExposureChart();box.querySelector('[data-basis="'+exposureBasis+'"]').focus();});
}
