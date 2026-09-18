export function defaultEditorState(){
  return {
    media:{scale:1,x:0,y:0,rotation:0,fit:'cover',dim:0,blur:0,vignette:false},
    layout:{showBook:true,showRating:true,actions:'right'},
    overlays:[],
    video:{muted:true}
  };
}

export function normalizeEditorState(value){
  const base=defaultEditorState();
  const input=(value&&typeof value==='object')?value:{};
  const media=input.media&&typeof input.media==='object'?input.media:{};
  const layout=input.layout&&typeof input.layout==='object'?input.layout:{};
  const video=input.video&&typeof input.video==='object'?input.video:{};
  const overlays=Array.isArray(input.overlays)?input.overlays:[];
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(v))?Number(v):min));
  return {
    media:{
      scale:clamp(media.scale??1,.5,3),
      x:clamp(media.x??0,-60,60),
      y:clamp(media.y??0,-60,60),
      rotation:((Number(media.rotation)||0)%360+360)%360,
      fit:media.fit==='contain'?'contain':'cover',
      dim:clamp(media.dim??0,0,.55),
      blur:clamp(media.blur??0,0,5),
      vignette:Boolean(media.vignette)
    },
    layout:{
      showBook:layout.showBook!==false,
      showRating:layout.showRating!==false,
      actions:layout.actions==='left'?'left':'right'
    },
    overlays:overlays.slice(0,12).map((o,index)=>({
      id:String(o?.id||('text-'+index)),
      text:String(o?.text||'').slice(0,180),
      x:clamp(o?.x??50,4,96),
      y:clamp(o?.y??34,4,96),
      scale:clamp(o?.scale??1,.5,3),
      rotation:clamp(o?.rotation??0,-180,180),
      font:['serif','clean','bold'].includes(o?.font)?o.font:'serif',
      color:/^#[0-9a-f]{6}$/i.test(String(o?.color||''))?String(o.color):'#ffffff',
      background:['none','soft','solid'].includes(o?.background)?o.background:'soft',
      size:clamp(o?.size??26,12,52),
      align:['left','center','right'].includes(o?.align)?o.align:'center'
    })).filter(o=>o.text.trim()),
    video:{muted:video.muted!==false}
  };
}

export function editorMediaStyle(state){
  const s=normalizeEditorState(state);
  const m=s.media;
  const brightness=Math.max(.35,1-m.dim);
  return [
    `object-fit:${m.fit}`,
    `transform:translate3d(${m.x}%,${m.y}%,0) scale(${m.scale}) rotate(${m.rotation}deg)`,
    'transform-origin:center center',
    `filter:brightness(${brightness}) blur(${m.blur}px)`
  ].join(';');
}

export function editorFeedClasses(state){
  const s=normalizeEditorState(state);
  return [
    s.layout.actions==='left'?'editor-actions-left':'editor-actions-right',
    s.layout.showBook?'':'editor-hide-book',
    s.layout.showRating?'':'editor-hide-rating',
    s.media.vignette?'editor-vignette-on':''
  ].filter(Boolean).join(' ');
}

export function editorOverlayMarkup(state,escapeHtml=(v=>' '+v)){
  const s=normalizeEditorState(state);
  if(!s.overlays.length)return '';
  return '<div class="feed-editor-overlays">'+s.overlays.map(o=>{
    const safe=escapeHtml(o.text);
    const style=[
      `left:${o.x}%`,
      `top:${o.y}%`,
      `--overlay-scale:${o.scale}`,
      `--overlay-rotation:${o.rotation}deg`,
      `--overlay-color:${o.color}`,
      `--overlay-size:${o.size}px`,
      `text-align:${o.align}`
    ].join(';');
    return `<div class="feed-text-overlay" style="${style}"><span class="feed-text-bubble font-${o.font} bg-${o.background}">${safe}</span></div>`;
  }).join('')+'</div>';
}

export function editorLookMarkup(state){
  const s=normalizeEditorState(state);
  return s.media.vignette?'<div class="feed-editor-vignette" aria-hidden="true"></div>':'';
}
