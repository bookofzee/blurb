import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';

const supabase=createClient('https://ndinulaqwixbmgjhrhdo.supabase.co','sb_publishable__zMSwgf2znc_n8927aheRw_PiWY5BL1');

const bgThemes={
  parchment:{bg:['#f7ead4','#d8b88c'],text:'#3b2a22',ornament:'✦  ❦  ✦'},
  midnight:{bg:['#52404d','#151219'],text:'#fff6ea',ornament:'☾  ✦  ☽'},
  forest:{bg:['#23483b','#10281f'],text:'#f6eedf',ornament:'❦  ✧  ❦'},
  rose:{bg:['#e6c6bb','#a66f69'],text:'#3b2424',ornament:'✦  ♡  ✦'},
  ink:{bg:['#d8d2c6','#655e58'],text:'#231f1d',ornament:'◇  ✦  ◇'},
  wine:{bg:['#6e3947','#2d161d'],text:'#fff1e7',ornament:'✦  ❧  ✦'},
  navy:{bg:['#3f5872','#172331'],text:'#f4eadc',ornament:'☾  ✧  ☽'},
  cocoa:{bg:['#9a725c','#493126'],text:'#fff4e6',ornament:'✦  ❦  ✦'}
};
const textColours=['#3b2a22','#fff6ea','#f4d9ae','#2e1917','#d9efe3','#8d4a27','#6f324c','#263d5b'];
let selectedStyle='review-card';
let selectedBg='parchment';
let selectedText=bgThemes.parchment.text;
let draggingRating=false;
let selectedHashtags=[];
let selectedTropes=[];
const quickTropes=[
  'Slow burn','Enemies to lovers','Found family','Forced proximity',
  'Friends to lovers','Grumpy / sunshine','Second chance','Forbidden romance',
  'Dark romance','Fake dating','Small town','Morally grey'
];

const $=s=>document.querySelector(s);

function toast(message){const el=$('#toast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),1900);}
function setStatus(message,error=false){const el=$('#createStatus');if(!el)return;el.textContent=message;el.className=`form-status${error?' error':''}`;}

let selectedBookSyncTimer=null;
async function syncSelectedBookPreview(){
  clearTimeout(selectedBookSyncTimer);
  selectedBookSyncTimer=setTimeout(async()=>{
    const id=$('#selectedBookId')?.value;
    const label=$('#selectedBookLabel');
    const author=$('#selectedBookAuthor');
    const cover=$('#selectedBookCover');
    if(!label||!author||!cover)return;

    if(!id){
      if(label.textContent!=='Choose a book')label.textContent='Choose a book';
      author.textContent='Search for the book you’re posting about';
      cover.innerHTML='<span class="selected-book-placeholder">B</span>';
      cover.classList.remove('has-cover');
      return;
    }

    const {data}=await supabase.from('blurb_books')
      .select('title,author,cover_url')
      .eq('id',id)
      .maybeSingle();

    if(!data)return;
    if(label.textContent!==data.title)label.textContent=data.title||'Untitled';
    author.textContent=data.author||'';
    if(data.cover_url){
      const safe=String(data.cover_url).replace(/"/g,'&quot;');
      cover.innerHTML='<img src="'+safe+'" alt="" />';
      cover.classList.add('has-cover');
    }else{
      const initial=(data.title||'B').trim().charAt(0).toUpperCase()||'B';
      cover.innerHTML='<span class="selected-book-placeholder">'+initial+'</span>';
      cover.classList.remove('has-cover');
    }
    updateReviewCardPreview();
  },60);
}

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

  const bookButton=$('#bookPickerButton');
  if(bookButton&&!bookButton.dataset.previewUpgraded){
    bookButton.dataset.previewUpgraded='1';
    bookButton.classList.add('book-picker-card');
    bookButton.innerHTML=`
      <span class="selected-book-cover" id="selectedBookCover"><span class="selected-book-placeholder">B</span></span>
      <span class="selected-book-copy">
        <strong id="selectedBookLabel">Choose a book</strong>
        <small id="selectedBookAuthor">Search for the book you’re posting about</small>
      </span>
      <span class="book-picker-arrow" aria-hidden="true">›</span>`;
  }

  const ratingLabel=$('#ratingPicker')?.previousElementSibling;
  if(ratingLabel)ratingLabel.innerHTML='Your rating <span class="optional">optional</span>';
  const picker=$('#ratingPicker');
  if(picker){
    picker.className='rating-drag-wrap';
    picker.innerHTML=`<div class="rating-drag" id="ratingDrag" role="slider" tabindex="0" aria-label="Rating" aria-valuemin="0" aria-valuemax="5" aria-valuenow="0"><span class="rating-star"><i></i></span><span class="rating-star"><i></i></span><span class="rating-star"><i></i></span><span class="rating-star"><i></i></span><span class="rating-star"><i></i></span></div><span class="rating-value" id="ratingDisplay">0</span><span class="rating-hint">Drag across the stars · 0 = no rating</span>`;
  }

  const caption=$('#caption');
  const captionLabel=caption?.previousElementSibling;
  if(captionLabel)captionLabel.innerHTML='Add caption <span class="optional">optional</span>';
  if(caption){caption.maxLength=180;caption.classList.add('hook-field');caption.placeholder='Add a short caption to your Blurb…';}
  const captionCount=caption?.nextElementSibling;
  if(captionCount)captionCount.innerHTML='<span id="captionCount">0</span>/180';

  const mediaLabel=$('#mediaFile')?.closest('.upload-zone')?.previousElementSibling;
  if(mediaLabel)mediaLabel.remove();
  const uploadZone=$('#mediaFile')?.closest('.upload-zone');

  const reviewWrap=document.createElement('div');
  reviewWrap.innerHTML=`
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
    </div>
    <div id="reviewOnlyFields">
      <label class="field-label required" for="reviewText">Review</label>
      <textarea id="reviewText" class="review-field" maxlength="1800" placeholder="Write your full review here…"></textarea>
      <div class="char-count"><span id="reviewCount">0</span>/1800</div>
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
    label?.remove();
    const oldHelp=tags.nextElementSibling?.classList?.contains('tag-help')?tags.nextElementSibling:null;
    oldHelp?.remove();
    tags.type='hidden';
    tags.value='';
  }

  const detailsExtras=document.createElement('div');
  detailsExtras.className='create-details-extras';
  detailsExtras.innerHTML=`
    <div class="hashtag-block">
      <label class="field-label" for="hashtagInput">Hashtags <span class="optional">optional · up to 5</span></label>
      <div class="hashtag-entry">
        <span>#</span>
        <input id="hashtagInput" type="text" maxlength="40" placeholder="Add hashtag" autocomplete="off" />
        <b id="hashtagCount">0/5</b>
      </div>
      <div class="hashtag-chips" id="hashtagChips"></div>
      <small class="spotlight-help">Hashtags help people find your Blurb in Spotlight search.</small>
    </div>
    <div class="trope-block">
      <label class="field-label">Tropes <span class="optional">optional · tap to add</span></label>
      <div class="trope-picker" id="tropePicker">
        ${quickTropes.map(t=>`<button type="button" class="trope-choice" data-trope="${t.replace(/"/g,'&quot;')}">${t}</button>`).join('')}
      </div>
    </div>`;

  const spoiler=$('#spoilerToggle')?.closest('.toggle-row');
  if(spoiler){
    spoiler.classList.add('spoiler-question');
    const strong=spoiler.querySelector('strong');
    const small=spoiler.querySelector('small');
    if(strong)strong.textContent='Does this contain spoilers?';
    if(small)small.textContent='We’ll hide the post until someone chooses to reveal it.';
  }

  buildCreateSteps(form,reviewWrap,uploadZone,coverWrap,detailsExtras);
  bindCreateUI();
  setStyle(selectedStyle);
  clearRating();
  updateReviewCardPreview();
  showCreateStep(1);
}

function buildCreateSteps(form,reviewWrap,uploadZone,coverWrap,detailsExtras){
  if(form.querySelector('.create-step'))return;

  const bookButton=$('#bookPickerButton');
  const bookLabel=bookButton?.previousElementSibling;
  const bookId=$('#selectedBookId');
  const ratingPicker=$('#ratingPicker');
  const ratingLabel=ratingPicker?.previousElementSibling;
  const ratingValue=$('#ratingValue');

  const caption=$('#caption');
  const captionLabel=caption?.previousElementSibling;
  const captionCount=caption?.nextElementSibling;
  const tags=$('#tags');
  const spoiler=$('#spoilerToggle')?.closest('.toggle-row');
  const publish=$('#publishButton');
  const status=$('#createStatus');

  const stepper=document.createElement('div');
  stepper.className='create-stepper';
  stepper.innerHTML='<span class="active" data-step-dot="1">1 · Post</span><i></i><span data-step-dot="2">2 · Details</span><i></i><span data-step-dot="3">3 · Review</span>';
  form.prepend(stepper);

  const step1=document.createElement('section');
  step1.className='create-step active';
  step1.dataset.createStep='1';
  [bookLabel,bookButton,bookId,ratingLabel,ratingPicker,ratingValue].forEach(node=>node&&step1.appendChild(node));
  while(reviewWrap.firstChild)step1.appendChild(reviewWrap.firstChild);
  reviewWrap.remove();
  if(uploadZone)step1.appendChild(uploadZone);

  const next1=document.createElement('button');
  next1.type='button';
  next1.id='createNextButton';
  next1.className='primary-button create-next-button';
  next1.textContent='Next';
  step1.appendChild(next1);

  const stepError=document.createElement('p');
  stepError.id='createStepStatus';
  stepError.className='form-status';
  step1.appendChild(stepError);

  const step2=document.createElement('section');
  step2.className='create-step';
  step2.dataset.createStep='2';
  [captionLabel,caption,captionCount,coverWrap,detailsExtras,spoiler,tags].forEach(node=>node&&step2.appendChild(node));

  const detailsActions=document.createElement('div');
  detailsActions.className='create-final-actions';
  detailsActions.innerHTML='<button type="button" class="secondary-button" id="createBackButton">Back</button><button type="button" class="primary-button" id="createReviewButton">Next</button>';
  step2.appendChild(detailsActions);

  const step3=document.createElement('section');
  step3.className='create-step';
  step3.dataset.createStep='3';
  step3.innerHTML=`
    <div class="review-step-heading">
      <span>Final check</span>
      <h2>Review your Blurb</h2>
      <p>This is how your post will look before it goes live.</p>
    </div>
    <article class="final-post-preview" id="finalPostPreview">
      <div class="final-preview-media" id="finalPreviewMedia"></div>
      <div class="final-preview-body">
        <div class="final-preview-book">
          <span class="final-preview-cover" id="finalPreviewCover"><b>B</b></span>
          <span><strong id="finalPreviewBook">Choose a book</strong><small id="finalPreviewAuthor"></small></span>
          <em id="finalPreviewRating"></em>
        </div>
        <p class="final-preview-caption" id="finalPreviewCaption" hidden></p>
        <div class="final-preview-tags" id="finalPreviewTags"></div>
        <div class="final-preview-spoiler" id="finalPreviewSpoiler" hidden>⚠ Contains spoilers · viewers will need to reveal this post</div>
      </div>
    </article>
    <div class="review-profile-cover" id="reviewProfileCover" hidden></div>`;

  const finalActions=document.createElement('div');
  finalActions.className='create-final-actions';
  finalActions.innerHTML='<button type="button" class="secondary-button" id="reviewBackButton">Back</button>';
  if(publish){
    publish.textContent='Post to Blurb';
    finalActions.appendChild(publish);
  }
  step3.appendChild(finalActions);
  if(status)step3.appendChild(status);

  form.append(step1,step2,step3);
}

function setStepStatus(message='',error=false){
  const el=$('#createStepStatus');
  if(!el)return;
  el.textContent=message;
  el.className=`form-status${error?' error':''}`;
}

function showCreateStep(step){
  document.querySelectorAll('[data-create-step]').forEach(el=>el.classList.toggle('active',Number(el.dataset.createStep)===step));
  document.querySelectorAll('[data-step-dot]').forEach(el=>el.classList.toggle('active',Number(el.dataset.stepDot)===step));
  const scroller=document.querySelector('#createView .page-scroll');
  scroller?.scrollTo({top:0,behavior:'smooth'});
  setStepStatus('');
}

function validateCreateStepOne(){
  if(!$('#selectedBookId')?.value)return 'Choose a book first.';
  const file=$('#mediaFile')?.files?.[0];
  const review=$('#reviewText')?.value?.trim()||'';
  if(selectedStyle==='review-card'&&!review)return 'Write your review first.';
  if(selectedStyle!=='review-card'&&!file)return `Add a ${selectedStyle} first.`;
  return '';
}

function cleanHashtag(value=''){
  return String(value).trim().replace(/^#+/,'').replace(/[^A-Za-z0-9_]/g,'').slice(0,30);
}

function renderHashtags(){
  const host=$('#hashtagChips');
  const count=$('#hashtagCount');
  if(count)count.textContent=`${selectedHashtags.length}/5`;
  if(!host)return;
  host.innerHTML=selectedHashtags.map(tag=>`<button type="button" class="hashtag-chip" data-remove-hashtag="${tag}">#${tag}<span>×</span></button>`).join('');
}

function addHashtags(raw=''){
  const values=String(raw).split(/[\s,]+/).map(cleanHashtag).filter(Boolean);
  for(const tag of values){
    if(selectedHashtags.length>=5)break;
    if(!selectedHashtags.some(x=>x.toLowerCase()===tag.toLowerCase()))selectedHashtags.push(tag);
  }
  renderHashtags();
  const input=$('#hashtagInput');
  if(input)input.value='';
}

function toggleTrope(trope){
  const index=selectedTropes.indexOf(trope);
  if(index>=0)selectedTropes.splice(index,1);
  else selectedTropes.push(trope);
  document.querySelectorAll('[data-trope]').forEach(btn=>btn.classList.toggle('active',selectedTropes.includes(btn.dataset.trope)));
}

function buildFinalReviewPreview(){
  const {title,author}=selectedBookParts();
  const titleEl=$('#finalPreviewBook');
  const authorEl=$('#finalPreviewAuthor');
  const coverEl=$('#finalPreviewCover');
  if(titleEl)titleEl.textContent=title;
  if(authorEl)authorEl.textContent=author||'';
  const selectedCover=$('#selectedBookCover img');
  if(coverEl){
    coverEl.innerHTML=selectedCover?'<img src="'+selectedCover.src+'" alt="" />':'<b>'+((title||'B').charAt(0).toUpperCase())+'</b>';
  }

  const rating=Number($('#ratingValue')?.value||0);
  const ratingEl=$('#finalPreviewRating');
  if(ratingEl){
    ratingEl.textContent=rating?`★ ${rating.toFixed(1)}`:'';
    ratingEl.hidden=!rating;
  }

  const caption=$('#caption')?.value?.trim()||'';
  const captionEl=$('#finalPreviewCaption');
  if(captionEl){
    captionEl.textContent=caption;
    captionEl.hidden=!caption;
  }

  const tagHost=$('#finalPreviewTags');
  if(tagHost){
    const hashtagHtml=selectedHashtags.map(t=>`<span class="final-tag hashtag">#${t}</span>`).join('');
    const tropeHtml=selectedTropes.map(t=>`<span class="final-tag">${t}</span>`).join('');
    tagHost.innerHTML=hashtagHtml+tropeHtml;
    tagHost.hidden=!(selectedHashtags.length||selectedTropes.length);
  }

  const spoiler=$('#spoilerToggle')?.checked||false;
  const spoilerEl=$('#finalPreviewSpoiler');
  if(spoilerEl)spoilerEl.hidden=!spoiler;

  const mediaHost=$('#finalPreviewMedia');
  if(mediaHost){
    mediaHost.innerHTML='';
    if(selectedStyle==='review-card'){
      const source=$('#reviewCardPreview');
      if(source){
        const clone=source.cloneNode(true);
        clone.removeAttribute('id');
        clone.classList.add('final-review-card');
        mediaHost.appendChild(clone);
      }
    }else{
      const file=$('#mediaFile')?.files?.[0];
      if(file){
        const url=URL.createObjectURL(file);
        if(selectedStyle==='video'){
          const video=document.createElement('video');
          video.src=url;video.muted=true;video.loop=true;video.playsInline=true;video.controls=true;
          mediaHost.appendChild(video);
        }else{
          const img=document.createElement('img');
          img.src=url;img.alt='Post preview';
          mediaHost.appendChild(img);
        }
      }
    }
  }

  const coverFile=$('#profileCoverFile')?.files?.[0];
  const coverNote=$('#reviewProfileCover');
  if(coverNote){
    if(coverFile){
      coverNote.hidden=false;
      coverNote.innerHTML='<span>Profile grid cover</span><img src="'+URL.createObjectURL(coverFile)+'" alt="" /><strong>Custom cover selected</strong>';
    }else{
      coverNote.hidden=true;
      coverNote.innerHTML='';
    }
  }
}

function bindCreateUI(){
  const drag=$('#ratingDrag');
  const applyPoint=e=>{
    const r=drag.getBoundingClientRect();
    const x=Math.max(0,Math.min(r.width,e.clientX-r.left));
    let value=Math.round((x/r.width)*10)/2;
    value=Math.max(0,Math.min(5,value));
    setRating(value);
  };
  drag?.addEventListener('pointerdown',e=>{draggingRating=true;drag.setPointerCapture?.(e.pointerId);applyPoint(e);});
  drag?.addEventListener('pointermove',e=>{if(draggingRating)applyPoint(e);});
  drag?.addEventListener('pointerup',()=>draggingRating=false);
  drag?.addEventListener('pointercancel',()=>draggingRating=false);
  drag?.addEventListener('click',applyPoint);
  drag?.addEventListener('keydown',e=>{let v=Number($('#ratingValue')?.value||0);if(e.key==='ArrowRight'||e.key==='ArrowUp'){e.preventDefault();setRating(Math.min(5,v+.5));}if(e.key==='ArrowLeft'||e.key==='ArrowDown'){e.preventDefault();setRating(Math.max(0,v-.5));}});
  $('#caption')?.addEventListener('input',e=>{const c=$('#captionCount');if(c)c.textContent=e.target.value.length;});
  $('#reviewText')?.addEventListener('input',e=>{const c=$('#reviewCount');if(c)c.textContent=e.target.value.length;updateReviewCardPreview();});
  const selectedLabel=$('#selectedBookLabel');
  if(selectedLabel){
    new MutationObserver(()=>syncSelectedBookPreview()).observe(selectedLabel,{childList:true,characterData:true,subtree:true});
  }
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-pick-book],[data-live-pick]'))setTimeout(syncSelectedBookPreview,180);
  });
  syncSelectedBookPreview();

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

  $('#hashtagInput')?.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===','){
      e.preventDefault();
      addHashtags(e.target.value);
    }
  });
  $('#hashtagInput')?.addEventListener('blur',e=>{if(e.target.value.trim())addHashtags(e.target.value);});
  $('#hashtagChips')?.addEventListener('click',e=>{
    const chip=e.target.closest('[data-remove-hashtag]');
    if(!chip)return;
    selectedHashtags=selectedHashtags.filter(t=>t!==chip.dataset.removeHashtag);
    renderHashtags();
  });
  document.querySelectorAll('[data-trope]').forEach(btn=>btn.addEventListener('click',()=>toggleTrope(btn.dataset.trope)));
  renderHashtags();

  $('#createNextButton')?.addEventListener('click',()=>{
    const problem=validateCreateStepOne();
    if(problem){setStepStatus(problem,true);return;}
    showCreateStep(2);
  });
  $('#createBackButton')?.addEventListener('click',()=>showCreateStep(1));
  $('#createReviewButton')?.addEventListener('click',()=>{
    const pending=$('#hashtagInput')?.value?.trim();
    if(pending)addHashtags(pending);
    buildFinalReviewPreview();
    showCreateStep(3);
  });
  $('#reviewBackButton')?.addEventListener('click',()=>showCreateStep(2));

  $('#createForm')?.addEventListener('submit',publishNewFlow,true);
}

function setRating(value){
  value=Math.max(0,Math.min(5,Number(value)||0));
  const hidden=$('#ratingValue');if(hidden)hidden.value=value>0?String(value):'';
  const display=$('#ratingDisplay');if(display)display.textContent=value===0?'0':value.toFixed(1);
  $('#ratingDrag')?.setAttribute('aria-valuenow',String(value));
  document.querySelectorAll('.rating-star').forEach((star,i)=>{const fill=star.querySelector('i');const portion=Math.max(0,Math.min(1,value-i));fill.style.width=`${portion*100}%`;});
}

function clearRating(){
  setRating(0);
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
  const title=$('#selectedBookLabel')?.textContent?.trim()||'Choose a book';
  const author=$('#selectedBookAuthor')?.textContent?.trim()||'';
  return {title,author:author==='Search for the book you’re posting about'?'':author};
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
  if(!bookId){showCreateStep(1);setStepStatus('Choose a book first.',true);return;}
  if(selectedStyle==='review-card'&&!review){showCreateStep(1);setStepStatus('Write your review first.',true);return;}
  if(selectedStyle!=='review-card'&&!file){showCreateStep(1);setStepStatus(`Add a ${selectedStyle} first.`,true);return;}
  const button=$('#publishButton');button.disabled=true;setStatus('Creating your Blurb…');
  try{
    let mediaUrl=null;let thumbnailUrl=null;let postType='image';
    if(selectedStyle==='review-card'){const blob=await reviewCardBlob();mediaUrl=await uploadBlob(blob,session.user.id);postType='image';}
    else if(file){const ext=(file.name.split('.').pop()||'bin').toLowerCase();mediaUrl=await uploadBlob(file,session.user.id,ext,file.type);postType=selectedStyle;}
    if(coverFile){const coverExt=(coverFile.name.split('.').pop()||'jpg').toLowerCase();thumbnailUrl=await uploadBlob(coverFile,session.user.id,coverExt,coverFile.type||'image/jpeg');}
    const caption=selectedStyle==='review-card'?[hook,review].filter(Boolean).join('\n\n'):hook;
    const {data:post,error}=await supabase.from('blurb_posts').insert({user_id:session.user.id,book_id:bookId,post_type:postType,media_url:mediaUrl,thumbnail_url:thumbnailUrl,caption,rating,contains_spoilers:$('#spoilerToggle')?.checked||false,status:'published'}).select().single();if(error)throw error;
    const tags=[
      ...selectedHashtags.slice(0,5).map(tag=>'#'+tag),
      ...selectedTropes
    ].filter(Boolean);
    if(tags.length)await supabase.from('blurb_post_tags').insert(tags.map(tag=>({post_id:post.id,tag})));
    toast('Your Blurb is live');setStatus('Posted!');setTimeout(()=>location.reload(),650);
  }catch(err){console.error(err);setStatus(err?.message||'Couldn’t publish that Blurb.',true);}finally{button.disabled=false;}
}

function start(){buildCreateUI();}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();