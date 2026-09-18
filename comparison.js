'use strict';
let comparisonHazard='rofsw',inspectedAuthority='';

// Five equal-width intervals, with readable limits and no discarded extremes.
function chartExtent(values){
 const low=Math.min(0,...values),high=Math.max(0,...values),span=high-low||1;
 const power=10**Math.floor(Math.log10(span/5)),step=Math.ceil(span/5/power)*power;
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
function chartGrid(x,y,w,h,maxY){
 let svg='';for(let i=0;i<=4;i++){const value=maxY*i/4,cy=y+h-h*i/4;svg+='<line class="chart-gridline" x1="'+x+'" y1="'+cy+'" x2="'+(x+w)+'" y2="'+cy+'"/><text class="chart-tick" x="'+(x-9)+'" y="'+(cy+4)+'" text-anchor="end">'+chartNumber(value)+'</text>';}
 return svg;
}
function renderComparisonCharts(){
 if(!$('distributionCard'))return;
 renderDistributionChart();renderRelationshipChart();
}
function renderDistributionChart(){
 const metric=$('analysisMetric').value,meta=METRICS[metric],rows=analysisRows.filter(p=>Number.isFinite(p[metric]));
 const values=rows.map(p=>p[metric]).sort((a,b)=>a-b),missing=analysisRows.length-rows.length,box=$('distributionCard');
 const period=meta.period||(NEEDS_METRICS[metric]?'IoD2025':metric==='population_2025'||metric==='density_km2'?'WorldPop 2025':'');
 let html='<div class="chart-heading"><div><p class="eyebrow">THE SELECTED INDICATOR</p><h2>How do areas compare?</h2></div><span class="chart-badge">'+rows.length+' with data</span></div><p class="chart-subtitle">'+esc(meta.title)+' · '+esc(meta.unit)+(period?' · '+esc(period):'')+'</p>';
 if(!values.length){box.innerHTML=html+'<p class="chart-empty">No matching authorities have data for this indicator. Change the search or indicator.</p>';return;}
 const data=histogramData(values),middle=Math.floor(values.length/2),median=values.length%2?values[middle]:(values[middle-1]+values[middle])/2;
 const x=44,y=22,w=416,h=153,maxY=Math.max(4,Math.ceil(Math.max(...data.bins.map(b=>b.count))/4)*4),sx=v=>x+(v-data.min)/(data.max-data.min)*w;
 let svg=chartGrid(x,y,w,h,maxY)+'<text class="chart-axis-caption" x="44" y="12">Number of authorities</text>';
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
  const x=44,y=22,w=416,h=153,maxX=chartExtent(rows.map(p=>p.income_deprivation_pct)).max,maxY=chartExtent(rows.map(p=>p[key])).max,sx=v=>x+v/maxX*w,sy=v=>y+h-v/maxY*h;
  let svg=chartGrid(x,y,w,h,maxY)+'<text class="chart-axis-caption" x="44" y="12">Estimated people exposed · % of EA population</text>';
  for(let i=0;i<=4;i++)svg+='<text class="chart-tick" x="'+(x+w*i/4)+'" y="195" text-anchor="middle">'+chartNumber(maxX*i/4)+'</text>';
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
 box.querySelectorAll('[data-hazard]').forEach(b=>b.onclick=()=>{comparisonHazard=b.dataset.hazard;renderRelationshipChart();box.querySelector('[data-hazard="'+comparisonHazard+'"]').focus();});
 const inspect=$('inspectAuthority');
 if(inspect){
  inspect.onchange=()=>{inspectedAuthority=inspect.value;renderRelationshipChart();$('inspectAuthority').focus();};
  box.querySelectorAll('[data-authority]').forEach(dot=>dot.onclick=()=>{inspectedAuthority=dot.dataset.authority;renderRelationshipChart();});
  $('chartShortlist').onclick=()=>{toggleShortlist(inspectedAuthority);$('chartShortlist')?.focus();};
 }
}
