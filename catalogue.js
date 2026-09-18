'use strict';
function catalogueRows(){
 const rows=[...manifest.layers,...(manifest.archived_layers||[]).map(l=>({...l,group:'Archived source · not displayed',note:l.archive_reason+' '+l.note}))].map(l=>({id:l.id,title:l.title,group:l.group||'Map data',format:l.kind,period:l.date,source:l.source,source_url:l.source_url||'',coverage:l.kind==='raster'?fmt(l.coverage_pct,1)+'% of display mask':fmt(l.count)+' records',interpretation:l.note||'See the original source documentation.'}));
 rows.push({id:'resilience_forums',title:'English Local Resilience Forums',group:'Local partners',format:'directory',period:'Directory updated '+resilienceData.directory_updated,source:'Cabinet Office',source_url:resilienceData.source_url,coverage:resilienceData.records.length+' directory entries',interpretation:resilienceData.note+' Directory checked '+resilienceData.checked+'. Individual linked websites and current contact roles were not independently verified.'});
 rows.push({id:'volunteering_pilot',title:'Resilience volunteering pilot',group:'Local partners',format:'referral directory',period:'Public sources checked 18 September 2026',source:'Host and local broker websites',source_url:'volunteering.html',coverage:'London, Somerset Council and Cumbria',interpretation:'Published opportunities and enquiry routes are distinct. Source checks do not establish host-confirmed places or NET endorsement. Activity locations, offices and area markers are identified separately. Listings move out of active results after their end, application or review date.'});
 rows.push({id:'volunteering_partners',title:'Pilot-area volunteering connections',group:'Local partners',format:'directory',period:'Sources checked 18 September 2026',source:'Local broker and community network websites',source_url:'data/volunteering-partners.json',coverage:volunteeringPartners.length+' entries in three pilot areas',interpretation:'Local infrastructure and coordination routes; not a complete England-wide volunteer-centre directory. Coverage notes are sourced descriptions, not service-area polygons.'});
 return rows;
}
function renderCatalogue(){
 const q=$('sourceSearch').value.trim().toLowerCase(),group=$('sourceGroup').value;
 const rows=catalogueRows().filter(r=>(!group||r.group===group)&&(!q||[r.title,r.source,r.period,r.interpretation].join(' ').toLowerCase().includes(q)));
 $('coverageSummary').textContent=rows.length+' layers and directories shown · '+manifest.district_count+' local authorities';
 $('coverageRows').innerHTML=rows.map(r=>'<tr><th scope="row">'+esc(r.title)+'<small>'+esc(r.group)+'</small></th><td>'+esc(r.period)+'</td><td>'+esc(r.coverage)+'</td><td>'+(r.source_url?'<a href="'+esc(r.source_url)+'" target="_blank" rel="noopener noreferrer">'+esc(r.source)+' ↗</a>':esc(r.source))+'<details><summary>Interpretation</summary><p>'+esc(r.interpretation)+'</p></details></td></tr>').join('')||'<tr><td colspan="4">No sources match these filters.</td></tr>';
 $('sourceExport').disabled=!rows.length;$('sourceExport').onclick=()=>downloadTable(rows,'England-source-catalogue.csv');
}
function openCatalogue(){
 const selected=$('sourceGroup').value;$('sourceGroup').replaceChildren(new Option('All groups',''));
 for(const group of [...new Set(catalogueRows().map(r=>r.group))].sort())$('sourceGroup').add(new Option(group,group));$('sourceGroup').value=selected;
 renderCatalogue();
 const missing=areas.filter(a=>a.properties.imd_top10_pct==null).map(a=>a.properties.name);
 $('issues').innerHTML=manifest.issues.map(x=>'<li><strong>'+esc(x.layer)+':</strong> '+esc(x.layer==='Flood risk'?'Authority flood exposure summaries are included. Detailed flood-extent geometries are not included; historical surface-water observations remain separate.':x.layer==='Rainfall'?'The rainfall layer is unavailable in this release.':x.message)+'</li>').join('');
 $('issues').innerHTML+='<li><strong>Flood geography:</strong> '+esc(floodData.geography_note)+'</li>';
 if(missing.length)$('issues').innerHTML+='<li><strong>Geography:</strong> '+esc(missing.join(', '))+' have no matched deprivation values. Source and atlas codes differ.</li>';
 $('buildDate').textContent='Map data built '+new Date(manifest.built_at).toLocaleDateString('en-GB')+' · Community data and web interface reviewed 18 September 2026 · '+(manifest.web_version||'');
 $('sources').showModal();
}
function initialiseCatalogue(){
 $('sourceSearch').oninput=renderCatalogue;$('sourceGroup').onchange=renderCatalogue;
 $('downloadAllProfiles').onclick=async()=>{await loadAreas();exportRows(areas.map(f=>f.properties),'England-community-profiles.csv');};
 $('sourceJSON').onclick=()=>downloadBlob(JSON.stringify({exported_at:new Date().toISOString(),layers:catalogueRows(),comparison_exclusions:manifest.comparison_exclusions||{},census_provenance:censusData.sources,flood_provenance:{sources:floodData.sources,tables:floodData.tables,geography:floodData.geography_note,source_issue:floodData.source_issue,percentage_note:floodData.percentage_note},deprivation_provenance:{source:preparednessData.source,workbook:preparednessData.workbook,sha256:preparednessData.source_sha256},partner_sources:[preparednessData.partner_source,resilienceData.source_url]},null,2),'England-source-catalogue.json','application/json');
}
