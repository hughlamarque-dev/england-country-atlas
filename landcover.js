'use strict';
let landCoverClass='all',landCoverPixelsPromise=null;

function landCoverClasses(){
 const source=layer('landcover');
 return (source?.legend||[]).filter(c=>!source.display_class_values||source.display_class_values.includes(c.value));
}
function renderLandCoverControls(parent){
 if(primaryId!=='landcover')return;
 const group=document.createElement('div');group.className='land-cover-choices';group.setAttribute('role','group');group.setAttribute('aria-label','Show land-cover class');
 for(const c of [{value:'all',label:'All land-cover classes'},...landCoverClasses()]){
  const b=document.createElement('button');b.dataset.landcover=String(c.value);b.setAttribute('aria-pressed',String(landCoverClass===String(c.value)));
  b.innerHTML=(c.color?'<span class="cover-swatch" style="background:'+esc(c.color)+'" aria-hidden="true"></span>':'')+esc(c.label);
  b.onclick=()=>{landCoverClass=String(c.value);map.closePopup();renderControls();renderLegend();loadLayer('landcover');$('themeControls').querySelector('[data-landcover="'+landCoverClass+'"]')?.focus();};group.append(b);
 }
 parent.append(group);
 const note=document.createElement('p');note.className='measure-explanation';note.textContent='Select one class to isolate it. ESA WorldCover 2021 · generalised 300 m display. Hidden classes become transparent; this does not alter area statistics.';parent.append(note);
}
async function landCoverPixels(){
 if(landCoverPixelsPromise)return landCoverPixelsPromise;
 landCoverPixelsPromise=(async()=>{
  const source=layer('landcover'),img=new Image();img.src=source.files[0];await img.decode();
  const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),classes=new Uint8Array(canvas.width*canvas.height),lookup=new Map();
  // Canvas alpha premultiplication can shift a channel by one level. Match only
  // the tightly bounded neighbourhood of the source's categorical colours.
  for(const c of source.legend){const rgb=c.color.slice(1).match(/../g).map(x=>parseInt(x,16));for(let r=-2;r<=2;r++)for(let g=-2;g<=2;g++)for(let b=-2;b<=2;b++){
   const triplet=[rgb[0]+r,rgb[1]+g,rgb[2]+b];if(triplet.some(x=>x<0||x>255))continue;
   lookup.set((triplet[0]<<16)|(triplet[1]<<8)|triplet[2],c.value);
  }}
  const counts={};let unknown=0;
  for(let i=0;i<classes.length;i++){const j=i*4;if(!pixels.data[j+3])continue;const code=lookup.get((pixels.data[j]<<16)|(pixels.data[j+1]<<8)|pixels.data[j+2]);if(!code){unknown++;continue;}classes[i]=code;counts[code]=(counts[code]||0)+1;}
  if(unknown)throw Error('Land-cover colours could not be identified. Please use the all-classes display.');
  canvas.width=canvas.height=1;
  return {pixels,classes,counts,width:pixels.width,height:pixels.height};
 })();
 try{return await landCoverPixelsPromise;}catch(e){landCoverPixelsPromise=null;throw e;}
}
async function landCoverRaster(selected){
 const source=layer('landcover');if(selected==='all')return source.files[0];
 const data=await landCoverPixels(),canvas=document.createElement('canvas');canvas.width=data.width;canvas.height=data.height;
 const rgba=new Uint8ClampedArray(data.pixels.data),code=Number(selected);
 for(let i=0;i<data.classes.length;i++)if(data.classes[i]!==code)rgba[i*4+3]=0;
 canvas.getContext('2d').putImageData(new ImageData(rgba,data.width,data.height),0,0);
 const url=canvas.toDataURL('image/png');canvas.width=canvas.height=1;return url;
}
async function inspectLandCover(latlng){
 const selected=landCoverClass,source=layer('landcover'),data=await landCoverPixels();if(primaryId!=='landcover'||selected!==landCoverClass)return;
 const p=L.CRS.EPSG3857.project(latlng),sw=L.CRS.EPSG3857.project(L.latLng(source.bounds[0])),ne=L.CRS.EPSG3857.project(L.latLng(source.bounds[1]));
 const x=Math.floor((p.x-sw.x)/(ne.x-sw.x)*data.width),y=Math.floor((ne.y-p.y)/(ne.y-sw.y)*data.height);
 if(x<0||y<0||x>=data.width||y>=data.height)return;
 const code=data.classes[y*data.width+x];if(!code||(selected!=='all'&&Number(selected)!==code))return;
 L.popup().setLatLng(latlng).setContent('<h3>'+esc(source.categories[code])+'</h3><small>ESA WorldCover 2021 · generalised 300 m display cell. Native source resolution: 10 m.</small>').openOn(map);
}
