/* England atlas volunteering referral pilot. No availability is inferred from map position.
 * Source freshness is evaluated at runtime so a static deployment cannot keep expired routes active.
 * See VOLUNTEERING-MAINTENANCE.md for the editorial and data-update workflow. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const LABELS = {
    theme: {preparedness:'Preparedness',recovery:'Recovery',community_support:'Community support',environment:'Environment',skills:'Charity skills & capacity',response:'Emergency response'},
    fit: {team_day:'Team volunteering',individual:'Individual volunteering',skills:'Professional skills',ongoing:'Ongoing commitment',unknown:'Format to confirm'},
    status: {advertised:'Published opportunity',enquiry:'Enquire with host',ongoing:'Ongoing commitment',closed:'Closed'},
    kind: {opportunity:'Opportunity',programme:'Programme',broker:'Local broker',platform:'Search platform'},
    basis: {venue:'Activity venue',office:'Organisation office',area_anchor:'Approximate area — not a venue',cluster:'Nearby map positions — select to zoom'}
  };
  const COLOURS = {preparedness:'#527d9a',recovery:'#a17837',community_support:'#437b62',environment:'#7b883c',skills:'#866298',response:'#b36052'};
  const STORAGE_KEY = 'england-atlas-volunteering-shortlist-v1';
  const FILTERS = ['area','authority','kind','theme','fit','status','freshness'];
  const PAGE_SIZE = 24; let visibleCount = PAGE_SIZE;
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  const today = () => new Date().toISOString().slice(0,10);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const arr = value => Array.isArray(value) ? value : [];
  const safeURL = value => {try {const u = new URL(value);return ['https:','http:'].includes(u.protocol) ? u.href : '';} catch {return '';}};
  const dateLabel = value => validDate(value) ? new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z')) : 'Not recorded';
  const external = (url,label,className='') => safeURL(url) ? `<a href="${esc(safeURL(url))}" target="_blank" rel="noopener noreferrer" class="${esc(className)}">${esc(label)} <span aria-hidden="true">↗</span></a>` : '';
  let data = {areas:[],records:[]}, filtered = [], saved = new Set(), map = null, markers = null, boundaryLayer = null;
  let lastDay = today(), lastArea = null, activeRecord = null, noticeTimer = null, searchTimer = null, mapReady = false;
  let storageAvailable = true;
  try {const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');if (Array.isArray(raw)) saved = new Set(raw.filter(x=>typeof x === 'string').slice(0,500));} catch {storageAvailable = false;}

  function freshness(record, day = today()) {
    if (record.status === 'closed') return {state:'ended',label:'Closed',reason:'The source record is marked closed.'};
    if (validDate(record.ends_on) && record.ends_on < day) return {state:'ended',label:'Ended',reason:'The published end date has passed.'};
    if (validDate(record.application_deadline) && record.application_deadline < day) return {state:'ended',label:'Deadline passed',reason:'The published application deadline has passed.'};
    if (!validDate(record.checked_at) || !validDate(record.review_due) || record.checked_at > day || record.review_due < record.checked_at) return {state:'review',label:'Needs source review',reason:'Source-check dates need correction or confirmation.'};
    if (record.review_due < day) return {state:'review',label:'Needs source review',reason:'The source review is overdue. This record is hidden from the default results.'};
    if (!['advertised','enquiry','ongoing'].includes(record.status)) return {state:'review',label:'Needs source review',reason:'The listing status needs confirmation.'};
    return {state:'current',label:LABELS.status[record.status],reason:record.review_due === day ? 'Source review is due today.' : ''};
  }
  const areaNames = record => arr(record.area_ids).map(id=>data.areas.find(a=>a.id===id)?.name || id).join(' · ');
  const isBroker = record => ['broker','platform'].includes(record.kind);
  const colour = record => COLOURS[arr(record.themes)[0]] || '#648472';
  const statusBadge = record => {const f=freshness(record);return `<span class="tag status-tag ${f.state==='current'?esc(record.status):'stale'}">${esc(f.label)}</span>`;};
  const primaryAction = record => freshness(record).state !== 'current' ? 'Visit source' : isBroker(record) ? 'Explore local options' : record.status==='advertised' ? 'View host opportunity' : record.status==='ongoing' ? 'Explore the role' : 'Enquire with host';
  const actionURL = record => freshness(record).state !== 'current' ? record.source_url : safeURL(record.apply_url) || record.source_url;

  function notice(message) {clearTimeout(noticeTimer);$('notice').textContent=message;$('notice').hidden=false;noticeTimer=setTimeout(()=>$('notice').hidden=true,4500);}
  function saveState() {try {localStorage.setItem(STORAGE_KEY,JSON.stringify([...saved]));storageAvailable=true;} catch {storageAvailable=false;notice('Your shortlist is available for this visit. Export it to keep a copy.');}}
  function updateSavedControls() {
    const count=data.records.filter(r=>saved.has(r.id)).length;
    $('savedCount').textContent=count;$('savedInline').textContent=count;$('exportSaved').disabled=count===0;
    document.querySelectorAll('[data-save]').forEach(button=>{const yes=saved.has(button.dataset.save);const record=data.records.find(r=>r.id===button.dataset.save);button.setAttribute('aria-pressed',String(yes));button.setAttribute('aria-label',(yes?'Remove from shortlist: ':'Save to shortlist: ')+(record?.title || 'listing'));button.title=yes?'Remove from shortlist':'Save to shortlist';button.textContent=button.classList.contains('save-button')?(yes?'★':'☆'):(yes?'Saved to shortlist':'Save to shortlist');});
  }
  function toggleSaved(id) {
    if (!data.records.some(r=>r.id===id)) return;
    if (saved.has(id)) saved.delete(id); else saved.add(id);
    saveState();updateSavedControls();
    if ($('savedOnly').checked) render(false);
    if (storageAvailable) notice(saved.has(id)?'Saved to your shortlist in this browser.':'Removed from your shortlist.');
  }
  function readFilters() {return Object.fromEntries([...FILTERS.map(key=>[key,$(key).value]),['q',$('search').value.trim().toLowerCase()],['saved',$('savedOnly').checked]]);}
  function matches(record, f) {
    const fresh=freshness(record).state;
    return (!f.area || arr(record.area_ids).includes(f.area)) && (!f.authority || arr(record.coverage_codes).includes(f.authority)) && (!f.kind || (f.kind==='broker' ? isBroker(record) : !isBroker(record))) && (!f.theme || arr(record.themes).includes(f.theme)) && (!f.fit || arr(record.employee_fit).includes(f.fit)) && (!f.status || record.status===f.status) && (f.freshness==='all' || (f.freshness==='review' ? fresh!=='current' : fresh==='current')) && (!f.saved || saved.has(record.id)) && (!f.q || [record.title,record.organisation,record.description,record.resilience_relevance,record.coverage_note,record.requirements,record.location_postcode,record.location?.label,...arr(record.coverage_names),areaNames(record),...arr(record.themes).map(t=>LABELS.theme[t]||t)].join(' ').toLowerCase().includes(f.q));
  }
  function shareURL() {
    const url=new URL(location.href);url.search='';url.hash='';
    for (const key of FILTERS) {const value=$(key).value;if (value && !(key==='freshness' && value==='current')) url.searchParams.set(key,value);}
    if ($('search').value.trim()) url.searchParams.set('q',$('search').value.trim());
    return url;
  }
  function writeURL() {try {history.replaceState(null,'',shareURL());} catch {}}
  function restoreFilters() {
    const p=new URL(location.href).searchParams;
    for (const key of FILTERS) if ([...$(key).options].some(o=>o.value===p.get(key))) $(key).value=p.get(key);
    $('search').value=(p.get('q')||'').slice(0,250);
  }
  function resetFilters() {for (const key of FILTERS) $(key).value=key==='freshness'?'current':'';$('search').value='';$('savedOnly').checked=false;populateAuthorities();render(true);}

  // Start with formats most useful for employee volunteering allowances.
  // This orders published formats; it is not an assessment of host need or capacity.
  function routeOrder(record) {
    if (isBroker(record)) return 5;
    if (record.status==='ongoing') return 4;
    if (arr(record.employee_fit).includes('team_day')) return 0;
    if (arr(record.employee_fit).includes('skills')) return 1;
    if (arr(record.employee_fit).includes('individual')) return 2;
    return 3;
  }

  function cardHTML(record) {
    const f=freshness(record), fit=arr(record.employee_fit).filter(v=>!(v==='ongoing'&&record.status==='ongoing')).map(v=>LABELS.fit[v]||v), themes=arr(record.themes).slice(0,2);
    const duration=record.duration?`<span><strong>Time:</strong> ${esc(record.duration)}</span>`:'';
    const dates=record.starts_on?`<span><strong>Date:</strong> ${esc(dateLabel(record.starts_on))}${record.ends_on&&record.ends_on!==record.starts_on?' – '+esc(dateLabel(record.ends_on)):''}</span>`:record.application_deadline?`<span><strong>Apply by:</strong> ${esc(dateLabel(record.application_deadline))}</span>`:'';
    return `<article class="route-card" id="route-${esc(record.id)}" style="--theme-color:${colour(record)}">
      <div class="card-top"><div><p class="card-kind">${esc(LABELS.kind[record.kind]||'Route')} · ${esc(areaNames(record))}</p><h3>${esc(record.title)}</h3><p class="organisation">${esc(record.organisation)}</p></div><button type="button" class="save-button" data-save="${esc(record.id)}" aria-pressed="${saved.has(record.id)}" aria-label="Save to shortlist: ${esc(record.title)}">☆</button></div>
      <p class="card-description">${esc(record.description)}</p>
      <div class="tag-row">${statusBadge(record)}${themes.map(theme=>`<span class="tag theme-tag">${esc(LABELS.theme[theme]||theme)}</span>`).join('')}${fit.slice(0,2).map(v=>`<span class="tag">${esc(v)}</span>`).join('')}</div>
      ${duration||record.team_size||dates?`<div class="card-facts">${dates}${duration}${record.team_size?`<span><strong>Team:</strong> ${esc(record.team_size)}</span>`:''}</div>`:''}
      ${f.state!=='current'?`<p class="stale-note">${esc(f.reason)}</p>`:''}
      <div class="card-bottom"><div class="card-actions">${external(actionURL(record),primaryAction(record),'button-link '+(f.state==='current'?'primary-link':''))}<button type="button" data-details="${esc(record.id)}">Details &amp; source</button></div><div class="card-source">${external(record.source_url,'Source checked')}<br>${esc(dateLabel(record.checked_at))}${f.reason&&f.state==='current'?'<br>Review due today':''}</div></div>
    </article>`;
  }
  function render(fitBounds = false, keepPage = false) {
    if (!data.records) return;
    const f=readFilters();if (!keepPage) visibleCount=PAGE_SIZE;
    filtered=data.records.filter(r=>matches(r,f)).sort((a,b)=>routeOrder(a)-routeOrder(b) || a.title.localeCompare(b.title));
    const activities=filtered.filter(r=>!isBroker(r)).length, brokers=filtered.length-activities;
    $('resultTitle').textContent=filtered.length+' '+(filtered.length===1?'route':'routes')+(f.saved?' saved':'');
    const stale=data.records.filter(r=>freshness(r).state!=='current').length;
    $('resultSummary').textContent=`${activities} activity / programme ${activities===1?'route':'routes'} · ${brokers} ${brokers===1?'broker or platform':'brokers / platforms'}`+(f.freshness==='current'&&stale?` · ${stale} older ${stale===1?'record':'records'} hidden`:'')+(f.freshness!=='current'?' · Review status is shown on each record.':'');
    $('results').innerHTML=filtered.length?filtered.slice(0,visibleCount).map(cardHTML).join(''):`<div class="empty-state"><h2>${f.saved?'No saved listings match':'No matching routes recorded'}</h2><p>${f.saved?'Save listings using the star button, or reset the filters to see your full shortlist.':'Try another area, theme or volunteer format. The directory does not yet cover every local organisation or opportunity. A blank result is a research gap, not an absence of local volunteering.'}</p><button type="button" data-reset>Reset filters</button>${f.freshness==='current'&&stale?'<p style="margin-top:14px;margin-bottom:0"><button class="text-button" type="button" data-review>Inspect records needing review</button></p>':''}</div>`;
    $('showMore').hidden=visibleCount>=filtered.length;$('showMore').textContent=`Show ${Math.min(PAGE_SIZE,Math.max(0,filtered.length-visibleCount))} more · ${Math.min(visibleCount,filtered.length)} of ${filtered.length}`;
    renderScope();
    $('exportResults').disabled=!filtered.length;updateSavedControls();renderCoverage();
    if (mapReady) renderMap(fitBounds || lastArea!==f.area+f.authority);
    lastArea=f.area+f.authority;writeURL();
  }
  function populateAuthorities(selected = '') {
    const rows=arr(data.authorities).filter(a=>!$('area').value||a.region_id===$('area').value);
    $('authority').replaceChildren(new Option('All council areas',''),...rows.map(a=>new Option(a.name,a.code)));
    if (rows.some(a=>a.code===selected)) $('authority').value=selected;
  }
  function renderScope() {
    const current=data.records.filter(r=>freshness(r).state==='current'), selected=$('authority').value;
    const authority=arr(data.authorities).find(a=>a.code===selected);
    if (authority) {
      const local=current.filter(r=>arr(r.coverage_codes).includes(selected));
      const regional=current.filter(r=>arr(r.area_ids).includes(authority.region_id)&&!arr(r.coverage_codes).includes(selected)).length;
      $('coverageSummary').innerHTML=`<strong>${esc(authority.name)}</strong><span>${local.length} current records have a source geography matched to this council, including ${local.filter(isBroker).length} broker / platform routes. Town-based listings may serve only part of the council. Confirm the host’s area note.</span>${regional?`<button type="button" data-broaden>Explore ${regional} other regional routes</button>`:''}`;
    } else {
      const covered=new Set(current.flatMap(r=>arr(r.coverage_codes)));
      $('coverageSummary').innerHTML=`<strong>England-wide discovery · locally uneven coverage</strong><span>${current.length} current records across ${data.areas.length} regions. Source geography matched in ${covered.size} of ${arr(data.authorities).length} councils. These counts describe the directory, not available places or local resilience.</span><a href="data/volunteering-coverage.json" target="_blank" rel="noopener noreferrer">Coverage audit ↗</a>`;
    }
  }
  function renderCoverage() {
    const rows=data.areas.map(area=>({...area,count:data.records.filter(r=>arr(r.area_ids).includes(area.id)&&freshness(r).state==='current').length}));
    const maximum=Math.max(1,...rows.map(r=>r.count));
    $('areaCoverage').innerHTML=rows.map(area=>`<button type="button" class="area-coverage-row" data-area="${esc(area.id)}" aria-pressed="${$('area').value===area.id}" aria-label="${esc(area.name)}: ${area.count} routes within review period"><span>${esc(area.name)}</span><span class="area-track" aria-hidden="true"><i style="width:${area.count/maximum*100}%"></i></span><strong>${area.count}</strong></button>`).join('');
  }
  function openRecord(id) {
    const r=data.records.find(record=>record.id===id);if (!r) return;
    activeRecord=id;const f=freshness(r);
    const fact=(label,value,wide=false)=>`<div${wide?' class="wide"':''}><dt>${esc(label)}</dt><dd>${esc(value||'Confirm with host')}</dd></div>`;
    $('recordBody').innerHTML=`<p class="card-kind">${esc(LABELS.kind[r.kind]||'Route')} · ${esc(areaNames(r))}</p><h2 id="recordTitle" class="record-title">${esc(r.title)}</h2><p class="organisation">${esc(r.organisation)}</p><div class="tag-row">${statusBadge(r)}${arr(r.themes).map(t=>`<span class="tag">${esc(LABELS.theme[t]||t)}</span>`).join('')}</div><p class="record-description">${esc(r.description)}</p>${r.resilience_relevance?`<p class="record-assessment"><strong>Atlas assessment · community resilience relevance</strong>${esc(r.resilience_relevance)}</p>`:''}${f.state!=='current'?`<p class="stale-note">${esc(f.reason)} The source link remains available for checking.</p>`:''}
      <dl class="record-facts">${fact('Volunteer format',arr(r.employee_fit).map(v=>LABELS.fit[v]||v).join(' · '))}${fact('Time commitment',r.duration)}${fact('Team size',r.team_size)}${fact('Costs or contributions',r.cost)}${fact('Accessibility',r.accessibility,true)}${fact('Requirements',r.requirements,true)}${fact('Area served',r.coverage_note,true)}${fact('Map location',r.location?`${LABELS.basis[r.location.basis]||'Location to confirm'} · ${r.location.label||areaNames(r)}`:'No map location recorded',true)}${r.starts_on?fact('Published start date',dateLabel(r.starts_on)):''}${r.ends_on?fact('Published end date',dateLabel(r.ends_on)):''}${r.application_deadline?fact('Application deadline',dateLabel(r.application_deadline)):''}${fact('Availability',r.availability_note||'Confirm current places, dates and location with the host.',true)}</dl>
      <div class="record-actions">${external(actionURL(r),primaryAction(r),'button-link '+(f.state==='current'?'primary-link':''))}<button type="button" data-save="${esc(r.id)}" aria-pressed="${saved.has(r.id)}">Save to shortlist</button>${r.location?`<button type="button" data-map="${esc(r.id)}">Locate on map</button>`:''}</div>
      <div class="record-provenance"><h3>Sources &amp; review</h3><p>Source checked: <strong>${esc(dateLabel(r.checked_at))}</strong> · Review due: <strong>${esc(dateLabel(r.review_due))}</strong>${r.source_published?' · Source published: '+esc(dateLabel(r.source_published)):''}. Source checks refer to published information, not confirmation of live places with the host.</p><p>${external(r.source_url,'Official source')}${r.location?.source_url?' · '+external(r.location.source_url,'Location source'):''}${r.location?.geocode_source_url?' · '+external(r.location.geocode_source_url,'Postcode coordinate source'):''}</p>${arr(r.evidence).length?`<details><summary>Evidence behind this record</summary><ul>${arr(r.evidence).map(e=>`<li>${esc(e.claim)} ${external(e.url,'Source')}</li>`).join('')}</ul></details>`:''}</div>`;
    updateSavedControls();if (!$('recordDialog').open) $('recordDialog').showModal();
  }

  function groupedLocations(records) {
    const groups=new Map();
    for (const r of records) {
      const loc=r.location;
      if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon) || Math.abs(loc.lat)>90 || Math.abs(loc.lon)>180) continue;
      const key=[loc.basis,loc.lat,loc.lon].join(':');
      if (!groups.has(key)) groups.set(key,{location:loc,records:[]});
      groups.get(key).records.push(r);
    }
    return [...groups.values()];
  }
  function displayLocations(records) {
    const points=groupedLocations(records);
    if (!map || map.getZoom()>=8) return points;
    const cells=new Map();
    for (const group of points) {
      const point=map.project([group.location.lat,group.location.lon],map.getZoom());
      const key=Math.floor(point.x/60)+':'+Math.floor(point.y/60);
      if (!cells.has(key)) cells.set(key,[]);
      cells.get(key).push(group);
    }
    return [...cells.values()].map(groups=>groups.length===1?groups[0]:{
      location:{lat:groups.reduce((n,g)=>n+g.location.lat,0)/groups.length,lon:groups.reduce((n,g)=>n+g.location.lon,0)/groups.length,label:'Grouped map locations',basis:'cluster'},
      records:groups.flatMap(g=>g.records),points:groups.map(g=>[g.location.lat,g.location.lon])
    });
  }
  async function initialiseMap() {
    if (!window.L) {$('mapMessage').hidden=false;$('mapMessage').textContent='Map unavailable. All route details remain available in the list.';return;}
    map=L.map('volunteerMap',{preferCanvas:true,scrollWheelZoom:false,minZoom:4,maxZoom:18}).setView([53,-2.5],6);
    L.control.scale({imperial:false}).addTo(map);
    map.attributionControl.addAttribution('<a href="https://postcodes.io/docs/licences/" target="_blank" rel="noopener noreferrer">Postcode data</a>');
    let tileError=false,tileSuccess=false;
    const tiles=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:16,maxZoom:18,attribution:'Esri, HERE, Garmin, © OpenStreetMap contributors'}).addTo(map);
    tiles.on('tileerror',()=>{if (!tileError && !tileSuccess) {$('mapMessage').hidden=false;$('mapMessage').textContent='Background map tiles could not load. Route markers and the results list remain available.';}tileError=true;});
    tiles.on('tileload',()=>{tileSuccess=true;if (tileError) $('mapMessage').hidden=true;});
    markers=L.layerGroup().addTo(map);mapReady=true;map.on('zoomend',()=>renderMap(false));renderMap(true);
    try {
      const response=await fetch('data/volunteering-areas.geojson',{cache:'no-cache'});if (!response.ok) return;
      const boundaries=await response.json();
      boundaryLayer=L.geoJSON(boundaries,{style:()=>({color:'#789380',weight:1,fillColor:'#9aaf9b',fillOpacity:.055}),onEachFeature:(feature,layer)=>{layer.bindTooltip(esc(feature.properties?.name||'Council area')+' · select council',{sticky:true,className:'area-tooltip'});layer.on('click',()=>{const id=feature.properties?.area_id;if (data.areas.some(a=>a.id===id)) {$('area').value=id;populateAuthorities(feature.properties.code);render(true);}});}}).addTo(map);
      boundaryLayer.bringToBack();fitMap();
    } catch { /* The independently useful list and point markers need no boundary file. */ }
  }
  function renderMap(shouldFit) {
    if (!mapReady) return;
    markers.clearLayers();
    const groups=displayLocations(filtered);
    for (const group of groups) {
      const {location:loc,records}=group,size=records.length>1?38:29,basis=['venue','office','area_anchor','cluster'].includes(loc.basis)?loc.basis:'area_anchor';
      const icon=L.divIcon({className:'area-marker marker-'+basis,html:`<span>${records.length}</span>`,iconSize:[size,size],iconAnchor:[size/2,size/2]});
      const title=`${loc.label||areaNames(records[0])}: ${records.length} ${records.length===1?'route':'routes'} · ${LABELS.basis[basis]}`;
      const marker=L.marker([loc.lat,loc.lon],{icon,title,alt:title,keyboard:true});
      marker.bindTooltip(esc(loc.label||areaNames(records[0]))+' · '+records.length,{direction:'top',offset:[0,-size/2],className:'area-tooltip'});
      if (basis==='cluster') marker.on('click',()=>map.fitBounds(L.latLngBounds(group.points),{padding:[45,45],maxZoom:12}));
      else marker.bindPopup(`<h3>${esc(loc.label||areaNames(records[0]))}</h3><p>${esc(LABELS.basis[basis])}${basis==='office'?' — activity location may differ.':''}${loc.precision==='postcode'?' · Approximate postcode position; confirm the meeting point with the host.':''}</p><div class="map-popup-list">${records.map(r=>`<button type="button" data-details="${esc(r.id)}">${esc(r.title)}<small>${esc(r.organisation)} · ${esc(freshness(r).label)}</small></button>`).join('')}</div>`,{maxWidth:315});
      marker.addTo(markers);marker._routeIDs=records.map(r=>r.id);
    }
    const mapped=groups.reduce((sum,g)=>sum+g.records.length,0);
    $('mapSummary').textContent=mapped?`${mapped} ${mapped===1?'route':'routes'} at ${groups.length} map ${groups.length===1?'marker':'markers'}. Select a marker for details.`:'No matching locations to show.';
    if (mapped<filtered.length) $('mapSummary').textContent+=` ${filtered.length-mapped} listed without a map location.`;
    if (shouldFit) fitMap();
  }
  function fitMap() {
    if (!mapReady) return;
    const selected=$('area').value,authority=$('authority').value,points=groupedLocations(filtered).map(g=>[g.location.lat,g.location.lon]);
    if (selected && !boundaryLayer) {const area=data.areas.find(a=>a.id===selected);if (area?.bounds) {map.fitBounds(area.bounds,{padding:[25,25],maxZoom:10});return;}}
    if ((selected || authority) && boundaryLayer) {const bounds=L.latLngBounds([]);boundaryLayer.eachLayer(layer=>{if (authority ? layer.feature.properties.code===authority : layer.feature.properties.area_id===selected) bounds.extend(layer.getBounds());});if (bounds.isValid()) {map.fitBounds(bounds,{padding:[25,25],maxZoom:10});return;}}
    if (points.length) map.fitBounds(L.latLngBounds(points),{padding:[45,45],maxZoom:selected?9:7});
    else if (selected) {const area=data.areas.find(a=>a.id===selected);if (area) map.setView([area.lat,area.lon],8);}
    else if (data.areas.length) map.fitBounds(L.latLngBounds(data.areas.map(a=>[a.lat,a.lon])),{padding:[40,40],maxZoom:7});
  }
  function locateRecord(id) {
    if (!mapReady) {notice('The map is unavailable. See the location note in the listing.');return;}
    const r=data.records.find(record=>record.id===id);if (!r?.location) return;
    $('recordDialog').close();$('volunteerMap').scrollIntoView({behavior:'smooth',block:'center'});map.invalidateSize();
    map.setView([r.location.lat,r.location.lon],r.location.basis==='venue'?13:r.location.basis==='office'?11:8);renderMap(false);
    let found=false;markers.eachLayer(marker=>{if (marker._routeIDs.includes(id)) {marker.openPopup();found=true;}});
    if (!found) notice('This listing is outside the current filters. Reset the filters to show it on the map.');
  }

  function csvValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    let text=String(value??'');if (/^[\s\uFEFF]*[=+@-]/.test(text)) text="'"+text;
    return '"'+text.replace(/"/g,'""')+'"';
  }
  function exportCSV(records,name) {
    if (!records.length) return;
    const cols=['id','title','organisation','kind','area','coverage_names','coverage_codes','coverage_note','themes','employee_fit','status','review_state','description','resilience_relevance_atlas_assessment','duration','team_size','cost','accessibility','requirements','availability_note','location_label','location_basis','location_precision','geocode_source_url','latitude','longitude','source_url','apply_url','checked_at','review_due','starts_on','ends_on','application_deadline','exported_at'];
    const stamp=new Date().toISOString();
    const rows=records.map(r=>({...r,area:areaNames(r),coverage_names:arr(r.coverage_names).join(' | '),coverage_codes:arr(r.coverage_codes).join(' | '),themes:arr(r.themes).map(t=>LABELS.theme[t]||t).join(' | '),employee_fit:arr(r.employee_fit).map(f=>LABELS.fit[f]||f).join(' | '),status:LABELS.status[r.status]||r.status,review_state:freshness(r).state,resilience_relevance_atlas_assessment:r.resilience_relevance,location_label:r.location?.label,location_basis:r.location?.basis,location_precision:r.location?.precision,geocode_source_url:r.location?.geocode_source_url,latitude:r.location?.lat,longitude:r.location?.lon,exported_at:stamp}));
    const csv='\uFEFF'+[cols.map(csvValue).join(','),...rows.map(row=>cols.map(c=>csvValue(row[c])).join(','))].join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})),link=document.createElement('a');link.href=url;link.download=name+'-'+today()+'.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notice(`${records.length} ${records.length===1?'record':'records'} exported with source dates and location precision.`);
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if (!button) return;
    if (button.dataset.save) toggleSaved(button.dataset.save);
    if (button.dataset.details) openRecord(button.dataset.details);
    if (button.dataset.map) locateRecord(button.dataset.map);
    if (button.dataset.area) {$('area').value=$('area').value===button.dataset.area?'':button.dataset.area;populateAuthorities();render(true);}
    if (button.hasAttribute('data-broaden')) {const a=arr(data.authorities).find(a=>a.code===$('authority').value);if (a) $('area').value=a.region_id;populateAuthorities();render(true);}
    if (button.hasAttribute('data-reset')) resetFilters();
    if (button.hasAttribute('data-review')) {$('freshness').value='review';render(false);}
  });
  $('showMore').addEventListener('click',()=>{const first=filtered[visibleCount]?.id;visibleCount+=PAGE_SIZE;render(false,true);if(first) document.querySelector(`[data-details="${CSS.escape(first)}"]`)?.focus();});
  FILTERS.forEach(key=>$(key).addEventListener('change',()=>{if (key==='area') populateAuthorities();if (key==='authority'&&$('authority').value) {const code=$('authority').value;const a=arr(data.authorities).find(a=>a.code===code);if(a){$('area').value=a.region_id;populateAuthorities(code);}}if (key==='status' && $('status').value==='closed' && $('freshness').value==='current') $('freshness').value='all';render(key==='area'||key==='authority');}));
  $('search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>render(false),160);});
  $('savedOnly').addEventListener('change',()=>render(false));$('resetFilters').addEventListener('click',resetFilters);$('fitMap').addEventListener('click',fitMap);
  $('exportResults').addEventListener('click',()=>exportCSV(filtered,'England-volunteering-results'));
  $('exportSaved').addEventListener('click',()=>exportCSV(data.records.filter(r=>saved.has(r.id)),'England-volunteering-shortlist'));
  $('closeRecord').addEventListener('click',()=>$('recordDialog').close());$('recordDialog').addEventListener('close',()=>activeRecord=null);
  $('shareView').addEventListener('click',()=>{$('shareURL').value=shareURL();$('shareStatus').textContent='';$('shareDialog').showModal();$('shareURL').select();});
  $('closeShare').addEventListener('click',()=>$('shareDialog').close());
  $('copyShare').addEventListener('click',async()=>{try {await navigator.clipboard.writeText($('shareURL').value);$('shareStatus').textContent='Link copied.';} catch {$('shareURL').focus();$('shareURL').select();$('shareStatus').textContent='Select and copy the link above.';}});
  for (const id of ['recordDialog','shareDialog']) $(id).addEventListener('click',event=>{if (event.target!==$(id)) return;const rect=$(id).getBoundingClientRect();if (event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom) $(id).close();});
  window.addEventListener('storage',event=>{if (event.key!==STORAGE_KEY) return;try {const incoming=JSON.parse(event.newValue||'[]');if (Array.isArray(incoming)) saved=new Set(incoming.filter(v=>typeof v==='string').slice(0,500));render(false);} catch {}});
  function checkDay() {if (today()===lastDay) return;lastDay=today();render(false);if (activeRecord) openRecord(activeRecord);}
  document.addEventListener('visibilitychange',()=>{if (!document.hidden) checkDay();});setInterval(checkDay,60000);

  async function load() {
    $('loadError').hidden=true;$('resultTitle').textContent='Loading local routes…';
    try {
      const response=await fetch('data/volunteering.json',{cache:'no-cache'});if (!response.ok) throw new Error('Source register returned HTTP '+response.status+'.');
      const incoming=await response.json();
      if (incoming.schema_version!==1 || !Array.isArray(incoming.records) || !Array.isArray(incoming.areas)) throw new Error('The source register has an unsupported format.');
      if (incoming.records.some(r=>!r.id||!r.title||!r.organisation) || new Set(incoming.records.map(r=>r.id)).size!==incoming.records.length) throw new Error('The source register contains incomplete or duplicate record identifiers.');
      data=incoming;
      $('area').replaceChildren(new Option('All England',''),...data.areas.map(area=>new Option(area.name,area.id)));
      const params=new URL(location.href).searchParams;const legacy=params.get('area');
      if (legacy==='somerset') {params.set('area','south-west');params.set('authority','E06000066');history.replaceState(null,'','?'+params);}
      if (legacy==='cumbria') {params.set('area','north-west');params.set('q','Cumbria');history.replaceState(null,'','?'+params);}
      populateAuthorities();restoreFilters();populateAuthorities($('authority').value);$('dataUpdated').textContent='Register updated '+dateLabel(data.updated);render(true);if (!mapReady) await initialiseMap();
      if (!storageAvailable) notice('Browser storage is unavailable. Export your shortlist to keep a copy.');
    } catch (error) {
      $('loadError').hidden=false;$('loadErrorMessage').textContent='The source register could not be read. '+error.message+' Please try again.';$('results').replaceChildren();$('resultTitle').textContent='Directory unavailable';$('resultSummary').textContent='The source register can also be downloaded at the foot of this page.';$('exportResults').disabled=true;
    }
  }
  $('postcodeForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const input=$('postcode').value.trim().toUpperCase().replace(/\s+/g,'');
    if (!/^(GIR0AA|[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2})$/.test(input)) {$('postcodeStatus').textContent='Enter a full UK postcode, such as SW1A 1AA.';return;}
    $('postcodeLookup').disabled=true;$('postcodeStatus').textContent='Finding the council area…';
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try {
      const response=await fetch('https://api.postcodes.io/postcodes/'+encodeURIComponent(input),{signal:controller.signal});
      if (response.status===404) {$('postcodeStatus').textContent='That postcode was not found. Check it and try again.';return;}
      if (!response.ok) throw new Error('Lookup service unavailable');
      const result=(await response.json()).result,code=result?.codes?.admin_district;
      const authority=arr(data.authorities).find(a=>a.code===code||arr(a.aliases).includes(code));
      if (!authority) {$('postcodeStatus').textContent=(result?.postcode||input)+' could not be matched to an English council in this directory. Choose a council manually; this service covers England only.';return;}
      $('area').value=authority.region_id;populateAuthorities(authority.code);render(true);
      $('postcodeStatus').textContent=(result.postcode||input)+' is in '+authority.name+'. Results use recorded source geography. Confirm the host’s service area and activity location.';
    } catch {$('postcodeStatus').textContent='The postcode service could not be reached. You can still choose a council area above.';}
    finally {clearTimeout(timer);$('postcodeLookup').disabled=false;}
  });
  $('retryLoad').addEventListener('click',load);load();
})();
