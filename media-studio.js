import { defaultEditorState, normalizeEditorState } from './editor-state.js?v=1';

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const uid=()=>globalThis.crypto?.randomUUID?.()||('layer-'+Date.now()+'-'+Math.random().toString(36).slice(2));
const escapeHtml=(value='')=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function distance(a,b){
  return Math.hypot(b.x-a.x,b.y-a.y);
}

function angle(a,b){
  return Math.atan2(b.y-a.y,b.x-a.x);
}

function normalizeDegrees(value){
  let n=Number(value)||0;
  while(n>180)n-=360;
  while(n<-180)n+=360;
  return n;
}

export function createMediaStudio({
  mount,
  file,
  type='photo',
  initialState,
  meta={},
  aspectRatio=.5625,
  onStateChange,
  onChangeMedia
}={}){
  if(!mount||!file)return null;

  let state=normalizeEditorState(initialState||defaultEditorState());
  state.layout={showBook:true,showRating:true,actions:'right'};
  let activeTab='media';
  let selectedOverlayId=null;
  let mediaUrl=URL.createObjectURL(file);
  const pointers=new Map();
  let gesture=null;
  let overlayDrag=null;
  let destroyed=false;

  mount.innerHTML=`
    <div class="studio-shell">
      <header class="studio-header">
        <span><strong>${type==='video'?'Video studio':'Photo studio'}</strong><small>Touch the post to edit it directly</small></span>
        <button type="button" data-studio-change>Change</button>
      </header>

      <div class="studio-phone" data-studio-canvas style="aspect-ratio:${aspectRatio}">
        ${type==='video'
          ? '<video class="studio-media" data-studio-media playsinline loop autoplay></video>'
          : '<img class="studio-media" data-studio-media alt="Post media preview" draggable="false" />'}
        <div class="studio-dim" data-studio-dim></div>
        <div class="studio-vignette" data-studio-vignette></div>
        <div class="studio-overlay-layer" data-studio-overlays></div>

        <div class="studio-book-chip" data-studio-book>
          <i data-studio-cover>B</i>
          <span><strong data-studio-title>Choose a book</strong><small data-studio-author></small></span>
          <em data-studio-rating></em>
        </div>

        <div class="studio-action-rail" data-studio-actions aria-hidden="true">
          <span>♥</span><span>◌</span><span>＋</span><span>↗</span>
        </div>

        <div class="studio-gesture-hint">Drag · pinch to resize</div>
      </div>

      <nav class="studio-tabs" aria-label="Editor tools">
        <button type="button" class="active" data-studio-tab="media"><span>⌘</span>Media</button>
        <button type="button" data-studio-tab="text"><span>Aa</span>Text</button>
        <button type="button" data-studio-tab="look"><span>✦</span>Look</button>
        ${type==='video'?'<button type="button" data-studio-tab="video"><span>▶</span>Video</button>':''}
      </nav>

      <div class="studio-tool-panel" data-studio-panel></div>
    </div>`;

  const canvas=mount.querySelector('[data-studio-canvas]');
  const media=mount.querySelector('[data-studio-media]');
  const overlayLayer=mount.querySelector('[data-studio-overlays]');
  const panel=mount.querySelector('[data-studio-panel]');

  if(type==='video'){
    media.src=mediaUrl;
    media.muted=state.video.muted;
    media.play().catch(()=>{});
  }else{
    media.src=mediaUrl;
  }

  function emit(){
    if(destroyed)return;
    onStateChange?.(normalizeEditorState(state));
  }

  function overlayById(id){
    return state.overlays.find(o=>o.id===id)||null;
  }

  function setMeta(next={}){
    meta={...meta,...next};
    const title=mount.querySelector('[data-studio-title]');
    const author=mount.querySelector('[data-studio-author]');
    const cover=mount.querySelector('[data-studio-cover]');
    const rating=mount.querySelector('[data-studio-rating]');
    if(title)title.textContent=meta.title||'Choose a book';
    if(author)author.textContent=meta.author||'';
    if(cover){
      if(meta.coverUrl){
        cover.style.backgroundImage='url("'+String(meta.coverUrl).replace(/"/g,'\"')+'")';
        cover.textContent='';
      }else{
        cover.style.backgroundImage='';
        cover.textContent=(meta.title||'B').trim().charAt(0).toUpperCase()||'B';
      }
    }
    const ratingValue=Number(meta.rating)||0;
    if(rating){
      rating.textContent=ratingValue?`★ ${ratingValue.toFixed(1)}`:'';
      rating.hidden=!ratingValue||!state.layout.showRating;
    }
  }

  function renderMedia(){
    const m=state.media;
    media.style.objectFit=m.fit;
    media.style.transform=`translate3d(${m.x}%,${m.y}%,0) scale(${m.scale}) rotate(${m.rotation}deg)`;
    media.style.filter=`brightness(${Math.max(.35,1-m.dim)}) blur(${m.blur}px)`;
    mount.querySelector('[data-studio-vignette]')?.classList.toggle('active',m.vignette);

    const book=mount.querySelector('[data-studio-book]');
    if(book)book.hidden=!state.layout.showBook;
    const rating=mount.querySelector('[data-studio-rating]');
    if(rating)rating.hidden=!state.layout.showRating||!(Number(meta.rating)||0);
    const actions=mount.querySelector('[data-studio-actions]');
    if(actions)actions.classList.toggle('left',state.layout.actions==='left');
    canvas.classList.toggle('actions-left',state.layout.actions==='left');
  }

  function renderOverlays(){
    overlayLayer.innerHTML=state.overlays.map(o=>`
      <div
        class="studio-text-layer font-${o.font} bg-${o.background}${o.id===selectedOverlayId?' selected':''}"
        data-overlay-id="${escapeHtml(o.id)}"
        style="left:${o.x}%;top:${o.y}%;--layer-scale:${o.scale};--layer-rotation:${o.rotation}deg;--layer-color:${o.color};--layer-size:${o.size}px;text-align:${o.align}"
      >
        <span data-overlay-content>${escapeHtml(o.text)}</span>
        ${o.id===selectedOverlayId?'<button type="button" class="studio-layer-delete-handle" data-overlay-delete aria-label="Delete text">×</button>':''}
      </div>`).join('');
  }

  function renderPanel(){
    mount.querySelectorAll('[data-studio-tab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.studioTab===activeTab));
    const selected=overlayById(selectedOverlayId);

    if(activeTab==='media'){
      panel.innerHTML=`
        <div class="studio-panel-copy"><strong>Move it directly</strong><small>Drag to position · pinch to resize and rotate · double tap to fit/fill.</small></div>
        <div class="studio-quick-row">
          <button type="button" data-media-fit="cover" class="${state.media.fit==='cover'?'active':''}">Fill</button>
          <button type="button" data-media-fit="contain" class="${state.media.fit==='contain'?'active':''}">Fit</button>
          <button type="button" data-media-reset>Reset</button>
        </div>
        <label class="studio-rotation-range"><span>Rotate</span><input type="range" min="-180" max="180" step="1" value="${normalizeDegrees(state.media.rotation)}" data-media-rotation /><b>${Math.round(normalizeDegrees(state.media.rotation))}°</b></label>`;
      return;
    }

    if(activeTab==='text'){
      if(!selected){
        panel.innerHTML=`
          <div class="studio-add-text-row">
            <button type="button" class="studio-add-text" data-add-text>＋ Add text</button>
            <span>Add text, then drag it anywhere on your post.</span>
          </div>
;
        return;
      }
      const colours=['#ffffff','#f7ead4','#c96832','#241a17','#e8bfd0','#d9efe3'];
      panel.innerHTML=`
        <div class="studio-layer-editor">
          <div class="studio-text-entry">
            <textarea rows="2" maxlength="180" data-layer-text aria-label="Overlay text">${escapeHtml(selected.text)}</textarea>
            <span>Text</span>
          </div>
          <div class="studio-control-strip">
            <div class="studio-option-row studio-font-row">
              <button type="button" data-layer-font="serif" class="${selected.font==='serif'?'active':''}">Serif</button>
              <button type="button" data-layer-font="clean" class="${selected.font==='clean'?'active':''}">Clean</button>
              <button type="button" data-layer-font="bold" class="${selected.font==='bold'?'active':''}">Bold</button>
            </div>
            <div class="studio-align-row" aria-label="Text alignment">
              <button type="button" data-layer-align="left" class="${selected.align==='left'?'active':''}" aria-label="Align left">≡</button>
              <button type="button" data-layer-align="center" class="${selected.align==='center'?'active':''}" aria-label="Align centre">≡</button>
              <button type="button" data-layer-align="right" class="${selected.align==='right'?'active':''}" aria-label="Align right">≡</button>
            </div>
            <div class="studio-colour-row">
              ${colours.map(c=>`<button type="button" data-layer-colour="${c}" class="${selected.color.toLowerCase()===c?'active':''}" style="background:${c}" aria-label="Text colour"></button>`).join('')}
            </div>
          </div>
          <div class="studio-control-strip studio-control-strip-bottom">
            <div class="studio-option-row">
              <button type="button" data-layer-bg="none" class="${selected.background==='none'?'active':''}">Clear</button>
              <button type="button" data-layer-bg="soft" class="${selected.background==='soft'?'active':''}">Glass</button>
              <button type="button" data-layer-bg="solid" class="${selected.background==='solid'?'active':''}">Paper</button>
            </div>
            <label class="studio-range studio-size-range"><span>A</span><input type="range" min="12" max="52" step="1" value="${selected.size}" data-layer-size /><b>A</b></label>
          </div>
        </div>`;
      return;
    }


    if(activeTab==='look'){
      panel.innerHTML=`
        <label class="studio-range"><span>Dim</span><input type="range" min="0" max="0.55" step="0.01" value="${state.media.dim}" data-look-dim /></label>
        <label class="studio-range"><span>Blur</span><input type="range" min="0" max="5" step="0.1" value="${state.media.blur}" data-look-blur /></label>
        <button type="button" class="studio-vignette-toggle ${state.media.vignette?'active':''}" data-look-vignette>Vignette</button>`;
      return;
    }

    if(activeTab==='video'&&type==='video'){
      panel.innerHTML=`
        <div class="studio-video-controls">
          <button type="button" data-video-play>${media.paused?'▶ Play':'❚❚ Pause'}</button>
          <button type="button" data-video-mute>${media.muted?'🔇 Muted':'🔊 Sound'}</button>
        </div>
        <label class="studio-range"><span>Scrub</span><input type="range" min="0" max="${Math.max(1,media.duration||1)}" step="0.01" value="${media.currentTime||0}" data-video-scrub /></label>`;
    }
  }

  function updateAll(){
    renderMedia();
    renderOverlays();
    setMeta(meta);
    renderPanel();
  }

  function addOverlay(preset='text'){
    const presetMap={
      text:{text:'Add text',font:'serif',size:28,background:'none',y:30},
      heading:{text:'Add a heading',font:'bold',size:34,background:'none',y:24},
      quote:{text:'“Add a quote”',font:'serif',size:30,background:'soft',y:38},
      tag:{text:'BOOK THOUGHTS',font:'clean',size:18,background:'solid',y:18}
    };
    const p=presetMap[preset]||presetMap.text;
    const layer={id:uid(),text:p.text,x:50,y:p.y,scale:1,rotation:0,font:p.font,color:'#ffffff',background:p.background,size:p.size,align:'center'};
    state.overlays.push(layer);
    selectedOverlayId=layer.id;
    activeTab='text';
    updateAll();
    setTimeout(()=>panel.querySelector('[data-layer-text]')?.select(),20);
    emit();
  }

  function changeSelected(mutator){
    const layer=overlayById(selectedOverlayId);
    if(!layer)return;
    mutator(layer);
    renderOverlays();
    renderPanel();
    emit();
  }

  mount.addEventListener('click',e=>{
    const overlayDelete=e.target.closest('[data-overlay-delete]');
    if(overlayDelete){
      e.preventDefault();
      e.stopPropagation();
      const layerEl=overlayDelete.closest('[data-overlay-id]');
      const id=layerEl?.dataset.overlayId||selectedOverlayId;
      state.overlays=state.overlays.filter(o=>o.id!==id);
      if(selectedOverlayId===id)selectedOverlayId=null;
      renderOverlays();
      renderPanel();
      emit();
      return;
    }

    const tab=e.target.closest('[data-studio-tab]');
    if(tab){
      activeTab=tab.dataset.studioTab;
      renderPanel();
      return;
    }
    if(e.target.closest('[data-studio-change]')){
      onChangeMedia?.();
      return;
    }
    if(e.target.closest('[data-add-text]')){
      addOverlay('text');
      return;
    }
    const preset=e.target.closest('[data-add-preset]');
    if(preset){addOverlay(preset.dataset.addPreset);return;}

    const fit=e.target.closest('[data-media-fit]');
    if(fit){
      state.media.fit=fit.dataset.mediaFit==='contain'?'contain':'cover';
      state.media.scale=1;state.media.x=0;state.media.y=0;
      updateAll();emit();return;
    }
    if(e.target.closest('[data-media-reset]')){
      const fresh=defaultEditorState();
      state.media=fresh.media;
      updateAll();emit();return;
    }
    if(e.target.closest('[data-look-vignette]')){
      state.media.vignette=!state.media.vignette;updateAll();emit();return;
    }
    const font=e.target.closest('[data-layer-font]');
    if(font){changeSelected(layer=>layer.font=font.dataset.layerFont);return;}
    const colour=e.target.closest('[data-layer-colour]');
    if(colour){changeSelected(layer=>layer.color=colour.dataset.layerColour);return;}
    const bg=e.target.closest('[data-layer-bg]');
    if(bg){changeSelected(layer=>layer.background=bg.dataset.layerBg);return;}
    const align=e.target.closest('[data-layer-align]');
    if(align){changeSelected(layer=>layer.align=align.dataset.layerAlign);return;}
    if(e.target.closest('[data-video-play]')&&type==='video'){
      media.paused?media.play().catch(()=>{}):media.pause();
      renderPanel();return;
    }
    if(e.target.closest('[data-video-mute]')&&type==='video'){
      media.muted=!media.muted;state.video.muted=media.muted;renderPanel();emit();return;
    }

    const layer=e.target.closest('[data-overlay-id]');
    if(layer){
      selectedOverlayId=layer.dataset.overlayId;
      activeTab='text';
      renderOverlays();
      renderPanel();
      return;
    }
    if(e.target===canvas||e.target===media||e.target.closest('.studio-dim')){
      selectedOverlayId=null;
      renderOverlays();
      if(activeTab==='text')renderPanel();
    }
  });

  mount.addEventListener('input',e=>{
    if(e.target.matches('[data-layer-text]')){
      const layer=overlayById(selectedOverlayId);
      if(!layer)return;
      layer.text=e.target.value.slice(0,180);
      const live=overlayLayer.querySelector('[data-overlay-id="'+CSS.escape(layer.id)+'"] [data-overlay-content]');
      if(live)live.textContent=layer.text;
      emit();
      return;
    }
    if(e.target.matches('[data-layer-size]')){
      const layer=overlayById(selectedOverlayId);
      if(!layer)return;
      layer.size=clamp(Number(e.target.value)||26,12,52);
      const live=overlayLayer.querySelector('[data-overlay-id="'+CSS.escape(layer.id)+'"]');
      if(live)live.style.setProperty('--layer-size',layer.size+'px');
      emit();
      return;
    }
    if(e.target.matches('[data-media-rotation]')){
      state.media.rotation=normalizeDegrees(Number(e.target.value)||0);
      const readout=e.target.closest('.studio-rotation-range')?.querySelector('b');
      if(readout)readout.textContent=Math.round(state.media.rotation)+'°';
      renderMedia();emit();return;
    }
    if(e.target.matches('[data-look-dim]')){
      state.media.dim=clamp(Number(e.target.value)||0,0,.55);renderMedia();emit();return;
    }
    if(e.target.matches('[data-look-blur]')){
      state.media.blur=clamp(Number(e.target.value)||0,0,5);renderMedia();emit();return;
    }
    if(e.target.matches('[data-video-scrub]')&&type==='video'){
      media.currentTime=clamp(Number(e.target.value)||0,0,media.duration||0);return;
    }
  });

  canvas.addEventListener('wheel',e=>{
    if(e.target.closest('[data-overlay-id]'))return;
    e.preventDefault();
    state.media.scale=clamp(state.media.scale+(e.deltaY<0 ? .08 : -.08),.5,3);
    renderMedia();emit();
  },{passive:false});

  canvas.addEventListener('dblclick',e=>{
    if(e.target.closest('[data-overlay-id]'))return;
    state.media.fit=state.media.fit==='cover'?'contain':'cover';
    state.media.scale=1;state.media.x=0;state.media.y=0;
    updateAll();emit();
  });

  canvas.addEventListener('pointerdown',e=>{
    if(e.target.closest('[data-overlay-delete]'))return;
    const layerEl=e.target.closest('[data-overlay-id]');
    if(layerEl){
      const layer=overlayById(layerEl.dataset.overlayId);
      if(!layer)return;
      selectedOverlayId=layer.id;
      activeTab='text';
      overlayDrag={id:layer.id,startX:e.clientX,startY:e.clientY,x:layer.x,y:layer.y,pointerId:e.pointerId};
      layerEl.setPointerCapture?.(e.pointerId);
      renderOverlays();renderPanel();
      return;
    }

    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    canvas.setPointerCapture?.(e.pointerId);
    if(pointers.size===1){
      gesture={kind:'drag',pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,x:state.media.x,y:state.media.y};
    }else if(pointers.size===2){
      const [a,b]=[...pointers.values()];
      gesture={kind:'pinch',distance:Math.max(1,distance(a,b)),scale:state.media.scale,angle:angle(a,b),rotation:state.media.rotation};
    }
  });

  canvas.addEventListener('pointermove',e=>{
    if(overlayDrag&&overlayDrag.pointerId===e.pointerId){
      const layer=overlayById(overlayDrag.id);
      if(!layer)return;
      const rect=canvas.getBoundingClientRect();
      layer.x=clamp(overlayDrag.x+((e.clientX-overlayDrag.startX)/rect.width)*100,4,96);
      layer.y=clamp(overlayDrag.y+((e.clientY-overlayDrag.startY)/rect.height)*100,4,96);
      renderOverlays();emit();return;
    }

    if(!pointers.has(e.pointerId))return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});

    if(pointers.size>=2){
      const [a,b]=[...pointers.values()];
      if(gesture?.kind!=='pinch')gesture={kind:'pinch',distance:Math.max(1,distance(a,b)),scale:state.media.scale,angle:angle(a,b),rotation:state.media.rotation};
      state.media.scale=clamp(gesture.scale*(distance(a,b)/gesture.distance),.5,3);
      state.media.rotation=normalizeDegrees(gesture.rotation+((angle(a,b)-gesture.angle)*(180/Math.PI)));
      renderMedia();emit();return;
    }

    if(gesture?.kind==='drag'&&gesture.pointerId===e.pointerId){
      const rect=canvas.getBoundingClientRect();
      state.media.x=clamp(gesture.x+((e.clientX-gesture.startX)/rect.width)*100,-60,60);
      state.media.y=clamp(gesture.y+((e.clientY-gesture.startY)/rect.height)*100,-60,60);
      renderMedia();emit();
    }
  });

  const endPointer=e=>{
    if(overlayDrag?.pointerId===e.pointerId)overlayDrag=null;
    pointers.delete(e.pointerId);
    if(pointers.size===1){
      const [id,p]=[...pointers.entries()][0];
      gesture={kind:'drag',pointerId:id,startX:p.x,startY:p.y,x:state.media.x,y:state.media.y};
    }else if(!pointers.size){
      gesture=null;
    }
  };
  canvas.addEventListener('pointerup',endPointer);
  canvas.addEventListener('pointercancel',endPointer);

  if(type==='video'){
    media.addEventListener('timeupdate',()=>{
      const scrub=panel.querySelector('[data-video-scrub]');
      if(scrub&&!scrub.matches(':active'))scrub.value=String(media.currentTime||0);
    });
    media.addEventListener('loadedmetadata',()=>{if(activeTab==='video')renderPanel();});
  }

  setMeta(meta);
  updateAll();

  return {
    getState:()=>normalizeEditorState(state),
    setMeta,
    destroy(){
      destroyed=true;
      try{URL.revokeObjectURL(mediaUrl);}catch{}
      mount.innerHTML='';
    }
  };
}
