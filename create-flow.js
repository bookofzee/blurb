import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';

const supabase=createClient('https://ndinulaqwixbmgjhrhdo.supabase.co','sb_publishable__zMSwgf2znc_n8927aheRw_PiWY5BL1');

const bgThemes={
  parchment:{bg:['#f7ead4','#d8b88c'],text:'#3b2a22',ornament:'✦  ❦  ✦'},
  midnight:{bg:['#52404d','#151219'],text:'#fff6ea',ornament:'☾  ✦  ☽'},
  forest:{bg:['#23483b','#10281f'],text:'#f6eedf',ornament:'❦  ✧  ❦'},
  rose:{bg:['#e6c6bb','#a66f69'],text:'#3b2424',ornament:'✦  ♡  ✦'},
  ink:{bg:['#d8d2c6','#655e58'],text:'#231f1d',ornament:'◇  ✦  ◇'}
};
const textColours=['#3b2a22','#fff6ea','#f4d9ae','#2e1917','#d9efe3'];
let selectedStyle='review-card';
let selectedBg='parchment';
let selectedText=bgThemes.parchment.text;
let draggingRating=false;

const $=s=>document.querySelector(s);

function toast(message){const el=$('#toast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),1900);}
function setStatus(message,error=false){const el=$('#createStatus');if(!el)return;el.textContent=message;el.className=`form-status${error?' error':''}`;}

function feedCardSize(){
  const shell=$('#app');
  const nav=document.querySelector('.bottom-nav');
  const shellWidth=shell?.clientWidth||Math.min(window.innerWidth||540,540);
  const shellHeight=shell?.clientHeight||window.innerHeight||960;
  const navHeight=nav?.getBoundingClientRect().height||72;
  const feedWidth=Math.max(1,Math.round(shellWidth));
  const feedHeight=Math.max(1,Math.round(shellHeight-navHeight));
  const width=1080;
  const height=Math.round(width*(feedHeight/feedWidth));
  return {width,height,ratio:feedWidth/feedHeight};
}

function buildCreateUI(){
  const form=$('#createForm');
  if(!form||form.dataset.flowUpgraded)return;
  form.dataset.flowUpgraded='1';
  form.classList.add('create-flow');

  const ratingLabel=$('#ratingPicker')?.previousElementSibling;
  if(ratingLabel)ratingLabel.innerHTML='Your rating <span class="optional">optional</span>';
  const picker=$('#ratingPicker');
  if(picker){
    picker.className='rating-drag-wrap';
    picker.innerHTML=`<div class="rating-drag" id="ratingDrag" role="slider" tabindex="0" aria-label="Rating" aria-valuemin="0.5" aria-valuemax="5" aria-valuenow="0"><span class="rating-star"><i></i></span><span class="rating-star"><i></i></span><span class="rating-star"><i></i></span><span class="rating-star"><i></i></span><span class="rating-star"><i></i></span></div><span class="rating-value" id="ratingDisplay">—</span><button type="button" class="rating-none active" id="ratingNone" aria-pressed="true">No rating</button>`;
  }

  const caption=$('#caption');
  const captionLabel=caption?.previousElementSibling;
  if(captionLabel)captionLabel.innerHTML='What did you think? <span class="optional">optional short hook</span>';
  if(caption){caption.maxLength=180;caption.classList.add('hook-field');caption.placeholder='Give people the one-line reason they should stop scrolling…';}
  const captionCount=caption?.nextElementSibling;
  if(captionCount)captionCount.innerHTML='<span id="captionCount">0</span>/180';

  const mediaLabel=$('#mediaFile')?.closest('.upload-zone')?.previousElementSibling;
  if(mediaLabel)mediaLabel.remove();
  const uploadZone=$('#mediaFile')?.closest('.upload-zone');

  const reviewWrap=document.createElement('div');
  reviewWrap.innerHTML=`
    <div id="reviewOnlyFields">
      <label class="field-label required" for="reviewText">Review</label>
      <textarea id="reviewText" class="review-field" maxlength="1800" placeholder="Write your full review here…"></textarea>
      <div class="char-count"><span id="reviewCount">0</span>/1800</div>
    </div>
    <label class="field-label">Choose your post style</label>
    <div class="post-style-picker" role="group" aria-label="Post style">
      <button type="button" class="post-style-option" data-post-style="photo"><span>▧</span><span>Photo</span></button>
      <button type="button" class="post-style-option" data-post-style="video"><span>▷</span><span>Video</span></button>
      <button type="button" class="post-style-option active" data-post-style="review-card"><span>✦</span><span>Review card</span></button>
    </div>
    <div class="review-card-builder active" id="reviewCardBuilder">
      <div class="review-card-preview" id="reviewCardPreview"><div class="card-book">Choose a book</div><div class="card-review">Your review will appear here.</div><div class="card-author">BLURB</div><div class="ornament">✦  ❦  ✦</div></div>
      <div class="card-controls">
        <div><div class="choice-label">Background</div><div class="background-choices">${Object.keys(bgThemes).map((k,i)=>`<button type="button" class="bg-choice${i===0?' active':''}" data-bg="${k}" aria-label="${k}"></button>`).join('')}</div></div>
        <div><div class="choice-label">Text colour</div><div class="text-colour-choices">${textColours.map((c,i)=>`<button type="button" class="colour-choice${i===0?' active':''}" data-colour="${c}" style="background:${c}" aria-label="Text colour"></button>`).join('')}</div></div>
      </div>
    </div>`;

  if(uploadZone)uploadZone.before(reviewWrap);
  if(uploadZone){uploadZone.classList.add('create-media-panel');uploadZone.style.display='none';}

  const coverWrap=document.createElement('div');
  coverWrap.className='profile-cover-field';
  coverWrap.innerHTML=`
    <label class="field-label" for="profileCoverFile">Profile cover <span class="optional">optional</span></label>
    <div class="profile-cover-row">
      <label class="profile-cover-upload" for="profileCoverFile">
        <input id="profileCoverFile" type="file" accept="image/jpeg,image/png,image/webp" />
        <span class="profile-cover-thumb" id="profileCoverPreview"><b>＋</b></span>
        <span class="profile-cover-copy"><strong>Choose a cover image</strong><small>Used on your profile grid instead of the post itself.</small></span>
      </label>
      <button type="button" class="profile-cover-clear" id="profileCoverClear" hidden>Remove</button>
    </div>`;
  if(uploadZone)uploadZone.after(coverWrap);

  const tags=$('#tags');
  if(tags){
    const label=tags.previousElementSibling;
    if(label)label.innerHTML='Tropes & tags <span class="optional">optional</span>';
    tags.insertAdjacentHTML('afterend','<div class="tag-help">Add a few searchable tropes, separated by commas.</div>');
  }

  bindCreateUI();
  setStyle(selectedStyle);
  clearRating();
  updateReviewCardPreview();
}

function bindCreateUI(){
  const drag=$('#ratingDrag');
  const applyPoint=e=>{
    const r=drag.getBoundingClientRect();
    const x=Math.max(0,Math.min(r.width,e.clientX-r.left));
    let value=Math.round((x/r.width)*10)/2;
    value=Math.max(.5,Math.min(5,value));
    setRating(value);
  };
  drag?.addEventListener('pointerdown',e=>{draggingRating=true;drag.setPointerCapture?.(e.pointerId);applyPoint(e);});
  drag?.addEventListener('pointermove',e=>{if(draggingRating)applyPoint(e);});
  drag?.addEventListener('pointerup',()=>draggingRating=false);
  drag?.addEventListener('pointercancel',()=>draggingRating=false);
  drag?.addEventListener('click',applyPoint);
  drag?.addEventListener('keydown',e=>{let v=Number($('#ratingValue')?.value||0);if(e.key==='ArrowRight'||e.key==='ArrowUp'){e.preventDefault();setRating(Math.min(5,(v||0)+.5));}if(e.key==='ArrowLeft'||e.key==='ArrowDown'){e.preventDefault();setRating(Math.max(.5,(v||1)-.5));}});
  $('#ratingNone')?.addEventListener('click',clearRating);

  $('#caption')?.addEventListener('input',e=>{const c=$('#captionCount');if(c)c.textContent=e.target.value.length;});
  $('#reviewText')?.addEventListener('input',e=>{const c=$('#reviewCount');if(c)c.textContent=e.target.value.length;updateReviewCardPreview();});
  $('#selectedBookLabel')?.addEventListener('DOMSubtreeModified',updateReviewCardPreview);

  $('#profileCoverFile')?.addEventListener('change',e=>{
    const file=e.target.files?.[0];
    const preview=$('#profileCoverPreview');
    const clear=$('#profileCoverClear');
    if(!file){if(preview)preview.innerHTML='<b>＋</b>';if(clear)clear.hidden=true;return;}
    if(file.size>15*1024*1024){toast('Cover image must be under 15 MB');e.target.value='';return;}
    const url=URL.createObjectURL(file);
    if(preview)preview.innerHTML='<img src="'+url+'" alt="Selected cover preview" />';
    if(clear)clear.hidden=false;
  });
  $('#profileCoverClear')?.addEventListener('click',()=>{
    const input=$('#profileCoverFile');
    const preview=$('#profileCoverPreview');
    if(input)input.value='';
    if(preview)preview.innerHTML='<b>＋</b>';
    $('#profileCoverClear').hidden=true;
  });

  document.querySelectorAll('[data-post-style]').forEach(btn=>btn.addEventListener('click',()=>setStyle(btn.dataset.postStyle)));
  document.querySelectorAll('[data-bg]').forEach(btn=>btn.addEventListener('click',()=>{selectedBg=btn.dataset.bg;document.querySelectorAll('[data-bg]').forEach(x=>x.classList.toggle('active',x===btn));selectedText=bgThemes[selectedBg].text;document.querySelectorAll('[data-colour]').forEach(x=>x.classList.toggle('active',x.dataset.colour===selectedText));updateReviewCardPreview();}));
  document.querySelectorAll('[data-colour]').forEach(btn=>btn.addEventListener('click',()=>{selectedText=btn.dataset.colour;document.querySelectorAll('[data-colour]').forEach(x=>x.classList.toggle('active',x===btn));updateReviewCardPreview();}));

  $('#createForm')?.addEventListener('submit',publishNewFlow,true);
}

function setRating(value){
  const hidden=$('#ratingValue');if(hidden)hidden.value=String(value);
  const display=$('#ratingDisplay');if(display)display.textContent=`${value.toFixed(1)}★`;
  $('#ratingDrag')?.setAttribute('aria-valuenow',String(value));
  const noRating=$('#ratingNone');if(noRating){noRating.classList.remove('active');noRating.setAttribute('aria-pressed','false');}
  document.querySelectorAll('.rating-star').forEach((star,i)=>{const fill=star.querySelector('i');const portion=Math.max(0,Math.min(1,value-i));fill.style.width=`${portion*100}%`;});
}

function clearRating(){
  const hidden=$('#ratingValue');if(hidden)hidden.value='';
  const display=$('#ratingDisplay');if(display)display.textContent='—';
  $('#ratingDrag')?.setAttribute('aria-valuenow','0');
  const noRating=$('#ratingNone');if(noRating){noRating.classList.add('active');noRating.setAttribute('aria-pressed','true');}
  document.querySelectorAll('.rating-star i').forEach(fill=>fill.style.width='0%');
}

function setStyle(style){
  selectedStyle=style;
  document.querySelectorAll('[data-post-style]').forEach(b=>b.classList.toggle('active',b.dataset.postStyle===style));
  const upload=$('#mediaFile')?.closest('.upload-zone');
  const builder=$('#reviewCardBuilder');
  const reviewFields=$('#reviewOnlyFields');
  if(upload)upload.style.display=style==='review-card'?'none':'block';
  if(reviewFields)reviewFields.style.display=style==='review-card'?'block':'none';
  builder?.classList.toggle('active',style==='review-card');
  const file=$('#mediaFile');
  if(file)file.accept=style==='photo'?'image/jpeg,image/png,image/webp':'video/mp4,video/webm,video/quicktime';
  const prompt=$('#uploadPrompt');
  if(prompt){prompt.innerHTML=style==='photo'?'<strong>＋ Add photo</strong><span>JPEG, PNG or WebP up to 50 MB</span>':'<strong>＋ Add video</strong><span>MP4, WebM or MOV up to 50 MB</span>';}
}

function selectedBookParts(){
  const label=$('#selectedBookLabel')?.textContent?.trim()||'Choose a book';
  const parts=label.split(' — ');
  return {title:parts[0]||'Choose a book',author:parts.slice(1).join(' — ')||''};
}

function updateReviewCardPreview(){
  const preview=$('#reviewCardPreview');if(!preview)return;
  const theme=bgThemes[selectedBg];
  const {title,author}=selectedBookParts();
  const {ratio}=feedCardSize();
  preview.style.aspectRatio=String(ratio);
  preview.style.background=`linear-gradient(145deg,${theme.bg[0]},${theme.bg[1]})`;
  preview.style.color=selectedText;
  const review=$('#reviewText')?.value?.trim()||'Your review will appear here.';
  preview.querySelector('.card-book').textContent=title;
  preview.querySelector('.card-review').textContent=review;
  preview.querySelector('.card-author').textContent=author||'BLURB';
  preview.querySelector('.ornament').textContent=theme.ornament;
}

function wrapText(ctx,text,maxWidth){
  const words=text.split(/\s+/);const lines=[];let line='';
  for(const word of words){const test=line?`${line} ${word}`:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word;}else line=test;}
  if(line)lines.push(line);return lines;
}

async function reviewCardBlob(){
  const {width,height}=feedCardSize();
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');const theme=bgThemes[selectedBg];
  const grad=ctx.createLinearGradient(0,0,width,height);grad.addColorStop(0,theme.bg[0]);grad.addColorStop(1,theme.bg[1]);ctx.fillStyle=grad;ctx.fillRect(0,0,width,height);
  const outer=Math.round(width*.046),inner=Math.round(width*.07);
  ctx.strokeStyle='rgba(255,255,255,.38)';ctx.lineWidth=3;ctx.strokeRect(outer,outer,width-outer*2,height-outer*2);ctx.strokeRect(inner,inner,width-inner*2,height-inner*2);
  ctx.fillStyle=selectedText;ctx.textAlign='center';
  const {title,author}=selectedBookParts();
  ctx.font='700 30px Arial';ctx.globalAlpha=.76;wrapText(ctx,title.toUpperCase(),width*.76).slice(0,2).forEach((line,i)=>ctx.fillText(line,width/2,height*.105+i*42));
  ctx.globalAlpha=1;ctx.font='46px Georgia';
  const review=$('#reviewText')?.value?.trim()||'';const lines=wrapText(ctx,review,width*.76).slice(0,20);const lineHeight=64;const start=(height*.5)-((lines.length-1)*lineHeight)/2;
  lines.forEach((line,i)=>ctx.fillText(line,width/2,start+i*lineHeight));
  ctx.globalAlpha=.72;ctx.font='700 25px Arial';if(author)ctx.fillText(author.toUpperCase(),width/2,height*.865);
  ctx.globalAlpha=.5;ctx.font='34px Georgia';ctx.fillText(theme.ornament,width/2,height*.925);
  return await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));
}

async function uploadBlob(blob,userId,ext='jpg',contentType='image/jpeg'){
  const path=`${userId}/${crypto.randomUUID()}.${ext}`;
  const {error}=await supabase.storage.from('blurb-media').upload(path,blob,{contentType,upsert:false});if(error)throw error;
  return supabase.storage.from('blurb-media').getPublicUrl(path).data.publicUrl;
}

async function publishNewFlow(e){
  e.preventDefault();e.stopImmediatePropagation();
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.user){$('#sheetBackdrop').hidden=false;$('#authSheet').hidden=false;return;}
  const bookId=$('#selectedBookId')?.value;const rawRating=$('#ratingValue')?.value;const rating=rawRating?Number(rawRating):null;const hook=$('#caption')?.value?.trim()||'';const review=$('#reviewText')?.value?.trim()||'';const file=$('#mediaFile')?.files?.[0];const coverFile=$('#profileCoverFile')?.files?.[0];
  if(!bookId){setStatus('Choose a book first.',true);return;}
  if(selectedStyle==='review-card'&&!review){setStatus('Write your review first.',true);return;}
  if(selectedStyle!=='review-card'&&!file){setStatus(`Add a ${selectedStyle} first.`,true);return;}
  const button=$('#publishButton');button.disabled=true;setStatus('Creating your Blurb…');
  try{
    let mediaUrl=null;let thumbnailUrl=null;let postType='image';
    if(selectedStyle==='review-card'){const blob=await reviewCardBlob();mediaUrl=await uploadBlob(blob,session.user.id);postType='image';}
    else if(file){const ext=(file.name.split('.').pop()||'bin').toLowerCase();mediaUrl=await uploadBlob(file,session.user.id,ext,file.type);postType=selectedStyle;}
    if(coverFile){const coverExt=(coverFile.name.split('.').pop()||'jpg').toLowerCase();thumbnailUrl=await uploadBlob(coverFile,session.user.id,coverExt,coverFile.type||'image/jpeg');}
    const caption=selectedStyle==='review-card'?[hook,review].filter(Boolean).join('\n\n'):hook;
    const {data:post,error}=await supabase.from('blurb_posts').insert({user_id:session.user.id,book_id:bookId,post_type:postType,media_url:mediaUrl,thumbnail_url:thumbnailUrl,caption,rating,contains_spoilers:$('#spoilerToggle')?.checked||false,status:'published'}).select().single();if(error)throw error;
    const tags=($('#tags')?.value||'').split(',').map(x=>x.trim().replace(/^#/,'' )).filter(Boolean).slice(0,10);if(tags.length)await supabase.from('blurb_post_tags').insert(tags.map(tag=>({post_id:post.id,tag})));
    toast('Your Blurb is live');setStatus('Posted!');setTimeout(()=>location.reload(),650);
  }catch(err){console.error(err);setStatus(err?.message||'Couldn’t publish that Blurb.',true);}finally{button.disabled=false;}
}

function start(){buildCreateUI();}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();