import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';

const CATALOGUE_URL='https://book-of-zee.onrender.com/api/blurb/catalogue';
const CATALOGUE_ADMIN_EMAIL='amy@walfords.uk';
const supabase=createClient('https://ndinulaqwixbmgjhrhdo.supabase.co','sb_publishable__zMSwgf2znc_n8927aheRw_PiWY5BL1');
const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
const escapeHtml=(value='')=>String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let books=[];
let bySource=new Map();
let byKey=new Map();
let ready=false;
let trendingBooks=[];
let popularityScores=new Map();

function isCatalogueAdmin(session){
  return String(session?.user?.email||'').toLowerCase()===CATALOGUE_ADMIN_EMAIL;
}

function toast(message){
  const el=document.querySelector('#toast');
  if(!el)return;
  el.textContent=message;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t=setTimeout(()=>el.classList.remove('show'),1900);
}

function coverStyle(book){
  const url=book?.cover_url;
  return url?`background-image:url("${String(url).replace(/"/g,'%22')}");background-size:cover;background-position:center;background-repeat:no-repeat;background-color:#2f211b;`:'';
}

function findBook(sourceId,title,author){
  return bySource.get(String(sourceId||''))||byKey.get(`${norm(title)}|${norm(author)}`)||null;
}

function withCovers(list){
  return list.filter(book=>book?.cover_url);
}

function dailySpotlight(){
  const pool=withCovers(books);
  if(!pool.length)return books.slice(0,6);
  const day=Math.floor(Date.now()/86400000);
  const picks=[];
  const used=new Set();
  for(let i=0;i<6&&used.size<pool.length;i++){
    let index=Math.abs((day*97+i*331+17)%pool.length);
    while(used.has(index))index=(index+1)%pool.length;
    used.add(index);
    picks.push(pool[index]);
  }
  return picks;
}

async function ensureLocalBook(book){
  if(!book)return null;
  const sourceId=String(book.id||book.source_id||'');
  if(!sourceId)return null;

  const existing=await findExistingLocalBook(book);
  if(existing)return existing;

  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.user){toast('Sign in to add this book');return null;}

  const {data,error}=await supabase.from('blurb_books').insert({
    source:'book_of_zee_prod',
    source_id:sourceId,
    title:book.title,
    author:book.author,
    cover_url:book.cover_url||null,
    description:book.description||null,
    genres:[]
  }).select('id,source,source_id,title,author,cover_url').single();

  if(error){
    const retry=await supabase.from('blurb_books')
      .select('id,source,source_id,title,author,cover_url')
      .eq('source','book_of_zee_prod')
      .eq('source_id',sourceId)
      .maybeSingle();
    if(retry.data)return retry.data;
    console.warn('Could not create Blurb book link',error);
    toast('Couldn’t link that book yet');
    return null;
  }
  return data;
}

async function findExistingLocalBook(book){
  if(!book)return null;
  const sourceId=String(book.id||book.source_id||'');
  if(sourceId){
    const {data}=await supabase.from('blurb_books')
      .select('id,source,source_id,title,author,cover_url,description')
      .eq('source_id',sourceId)
      .limit(1)
      .maybeSingle();
    if(data)return data;
  }
  const title=String(book.title||'').trim();
  const author=String(book.author||'').trim();
  if(!title)return null;
  let query=supabase.from('blurb_books')
    .select('id,source,source_id,title,author,cover_url,description')
    .eq('title',title);
  if(author)query=query.eq('author',author);
  const {data:fallback}=await query.limit(1).maybeSingle();
  return fallback||null;
}

async function setLiveBookStatus(book,status){
  const labels={tbr:'TBR',reading:'Reading',read:'Read',dnf:'DNF'};
  const local=await ensureLocalBook(book);
  if(!local)return false;
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.user){toast('Sign in to save this book');return false;}
  const {data:existing}=await supabase.from('blurb_library')
    .select('is_favourite')
    .eq('user_id',session.user.id)
    .eq('book_id',local.id)
    .maybeSingle();
  const {error}=await supabase.from('blurb_library').upsert({
    user_id:session.user.id,
    book_id:local.id,
    reading_status:status,
    is_favourite:existing?.is_favourite||false,
    updated_at:new Date().toISOString()
  },{onConflict:'user_id,book_id'});
  if(error){toast('Couldn’t update your library');return false;}
  toast(`Moved to ${labels[status]||status}`);
  window.dispatchEvent(new CustomEvent('blurb-library-changed',{detail:{bookId:local.id,status}}));
  return true;
}

async function removeLiveBookStatus(book){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.user){toast('Sign in to update your library');return false;}
  const local=await findExistingLocalBook(book);
  if(!local)return true;
  const {error}=await supabase.from('blurb_library')
    .delete()
    .eq('user_id',session.user.id)
    .eq('book_id',local.id);
  if(error){toast('Couldn’t remove that book');return false;}
  toast('Removed from your library');
  window.dispatchEvent(new CustomEvent('blurb-library-changed',{detail:{bookId:local.id,status:null}}));
  return true;
}

function bookSynopsis(book){
  const text=String(book?.description||book?.synopsis||book?.summary||book?.blurb||'').trim();
  return text||'No synopsis has been added for this book yet.';
}

function altArtEndpoint(book){
  return `${CATALOGUE_URL}/${encodeURIComponent(String(book.id))}/editions`;
}

async function loadAltArtOptions(book){
  const response=await fetch(altArtEndpoint(book),{headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error(`Alternate covers unavailable (${response.status})`);
  const payload=await response.json();
  const seen=new Set();
  return (Array.isArray(payload?.editions)?payload.editions:[])
    .filter(item=>item?.cover_url)
    .filter(item=>{
      const key=String(item.cover_url);
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    });
}

async function applyAdminAltCover(book,url){
  const {data:{session}}=await supabase.auth.getSession();
  if(!isCatalogueAdmin(session)||!book||!url)return false;
  try{
    const sourceId=String(book.id);
    const selectedUrl=String(url);
    const {data:savedOverride,error}=await supabase.from('blurb_catalogue_overrides').upsert({
      source_id:sourceId,
      cover_url:selectedUrl,
      is_hidden:false,
      updated_at:new Date().toISOString()
    },{onConflict:'source_id'}).select('source_id,cover_url').single();
    if(error)throw error;
    if(String(savedOverride?.cover_url||'')!==selectedUrl)throw new Error('Cover override did not persist');

    book.cover_url=selectedUrl;

    await supabase.from('blurb_books')
      .update({cover_url:String(url)})
      .eq('source_id',String(book.id));

    await supabase.from('blurb_books')
      .update({cover_url:String(url)})
      .eq('title',String(book.title||''))
      .eq('author',String(book.author||''));

    bySource.set(sourceId,book);
    byKey.set(`${norm(book.title)}|${norm(book.author)}`,book);

    window.dispatchEvent(new CustomEvent('blurb-cover-changed',{
      detail:{
        sourceId,
        title:String(book.title||''),
        author:String(book.author||''),
        coverUrl:selectedUrl
      }
    }));

    renderDiscover();
    paintExistingCovers(document);
    window.dispatchEvent(new CustomEvent('blurb-library-changed'));
    queueMicrotask(()=>paintExistingCovers(document));
    setTimeout(()=>paintExistingCovers(document),80);
    toast('Alternate cover selected');
    return true;
  }catch(err){
    console.error('Could not update alternate cover',err);
    toast('Couldn’t update the cover');
    return false;
  }
}

function closeAltArtPicker(){
  document.querySelector('#bookAltArtPicker')?.remove();
}

async function openAltArtPicker(book){
  const {data:{session}}=await supabase.auth.getSession();
  if(!isCatalogueAdmin(session)||!book)return;

  closeAltArtPicker();

  const picker=document.createElement('div');
  picker.id='bookAltArtPicker';
  picker.className='book-alt-art-picker';
  picker.innerHTML=`
    <div class="book-alt-art-backdrop" data-alt-art-close></div>
    <section class="book-alt-art-panel" role="dialog" aria-modal="true" aria-label="Choose alternate cover">
      <div class="book-alt-art-head">
        <div>
          <span>Alternate artwork</span>
          <strong>${escapeHtml(book.title)}</strong>
        </div>
        <button type="button" data-alt-art-close aria-label="Close">×</button>
      </div>
      <div class="book-alt-art-grid" data-alt-art-grid>
        <div class="book-alt-art-loading">Loading available covers…</div>
      </div>
    </section>`;
  document.body.appendChild(picker);

  picker.addEventListener('click',async e=>{
    if(e.target.closest('[data-alt-art-close]')){
      closeAltArtPicker();
      return;
    }
    const choice=e.target.closest('[data-alt-art-url]');
    if(!choice)return;
    const url=choice.dataset.altArtUrl;
    if(!url)return;
    picker.querySelectorAll('[data-alt-art-url]').forEach(btn=>btn.disabled=true);
    const ok=await applyAdminAltCover(book,url);
    if(ok){
      const modal=document.querySelector('#bookFlipModal');
      const front=modal?.querySelector('#bookFlipFront');
      if(front)front.innerHTML=`<img src="${escapeHtml(book.cover_url)}" alt="${escapeHtml(book.title)} cover" />`;
      closeAltArtPicker();
    }else{
      picker.querySelectorAll('[data-alt-art-url]').forEach(btn=>btn.disabled=false);
    }
  });

  try{
    const options=await loadAltArtOptions(book);
    const grid=picker.querySelector('[data-alt-art-grid]');
    if(!grid)return;
    if(!options.length){
      grid.innerHTML='<div class="book-alt-art-empty">No alternate cover artwork is stored for this book yet.</div>';
      return;
    }
    grid.innerHTML=options.map((item,index)=>{
      const active=String(item.cover_url)===String(book.cover_url||'');
      const format=String(item.format||'Edition').replace(/(^|\s)\S/g,m=>m.toUpperCase());
      const meta=[format,item.publisher,item.publication_date?String(item.publication_date).slice(0,4):''].filter(Boolean).join(' · ');
      return `<button type="button" class="book-alt-art-choice ${active?'active':''}" data-alt-art-url="${escapeHtml(item.cover_url)}">
        <img src="${escapeHtml(item.cover_url)}" alt="${escapeHtml(book.title)} alternate cover ${index+1}" />
        <span>${escapeHtml(meta||'Alternate cover')}</span>
        ${active?'<em>Current</em>':''}
      </button>`;
    }).join('');
  }catch(err){
    console.error('Could not load alternate artwork',err);
    const grid=picker.querySelector('[data-alt-art-grid]');
    if(grid)grid.innerHTML='<div class="book-alt-art-empty">Couldn’t load alternate artwork right now.</div>';
  }
}

async function adminHideBook(book){
  const {data:{session}}=await supabase.auth.getSession();
  if(!isCatalogueAdmin(session))return false;
  if(!confirm(`Remove “${book.title}” from Blurb? Existing posts and library history will be kept.`))return false;
  try{
    const {error}=await supabase.from('blurb_catalogue_overrides').upsert({
      source_id:String(book.id),
      cover_url:book.cover_url||null,
      is_hidden:true,
      updated_at:new Date().toISOString()
    },{onConflict:'source_id'});
    if(error)throw error;

    books=books.filter(item=>String(item.id)!==String(book.id));
    bySource=new Map(books.map(item=>[item.id,item]));
    byKey=new Map(books.map(item=>[`${norm(item.title)}|${norm(item.author)}`,item]));
    trendingBooks=trendingBooks.filter(item=>String(item?.id)!==String(book.id));
    closeBookFlip();
    setTimeout(()=>renderDiscover(),380);
    toast('Book removed from Blurb');
    return true;
  }catch(err){
    console.error('Could not remove catalogue book',err);
    toast('Couldn’t remove that book');
    return false;
  }
}

function ensureBookFlipModal(){
  let modal=document.querySelector('#bookFlipModal');
  if(modal)return modal;
  modal=document.createElement('div');
  modal.id='bookFlipModal';
  modal.className='book-flip-modal';
  modal.hidden=true;
  modal.innerHTML=`
    <div class="book-flip-backdrop" data-book-flip-close></div>
    <div class="book-flip-stage" id="bookFlipStage">
      <div class="book-flip-card" id="bookFlipCard">
        <section class="book-flip-face book-flip-front" id="bookFlipFront"></section>
        <section class="book-flip-face book-flip-back" id="bookFlipBack"></section>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.addEventListener('click',async e=>{
    if(e.target.closest('[data-book-flip-close]')){
      closeBookFlip();
      return;
    }
    if(e.target.closest('[data-book-flip-cover]')){
      clearTimeout(modal._flipSwapTimer);
      clearTimeout(modal._flipEndTimer);
      if(modal.classList.contains('show-back')){
        modal.classList.add('flip-out-back');
        modal._flipSwapTimer=setTimeout(()=>{
          modal.classList.remove('show-back','flip-out-back');
          modal.classList.add('flip-in-front');
        },170);
        modal._flipEndTimer=setTimeout(()=>modal.classList.remove('flip-in-front'),340);
      }
      return;
    }
    const synopsisToggle=e.target.closest('[data-book-synopsis-toggle]');
    if(synopsisToggle){
      const section=synopsisToggle.closest('.book-flip-synopsis');
      const collapsed=section?.classList.toggle('collapsed')||false;
      synopsisToggle.setAttribute('aria-expanded',String(!collapsed));
      return;
    }
    const spoilerToggle=e.target.closest('[data-book-spoiler-warning-toggle]');
    if(spoilerToggle){
      const book=bySource.get(modal.dataset.bookId||'');
      if(!book)return;
      const key='blurb-spoiler-warning:'+String(book.id);
      const current=spoilerToggle.getAttribute('aria-checked')!=='false';
      const next=!current;
      spoilerToggle.setAttribute('aria-checked',String(next));
      spoilerToggle.classList.toggle('is-on',next);
      const stateLabel=modal.querySelector('[data-book-spoiler-state]');
      if(stateLabel){
        stateLabel.textContent=next?'Spoilers hidden':'Spoilers visible';
        stateLabel.classList.toggle('is-visible',!next);
      }
      try{localStorage.setItem(key,next?'1':'0');}catch{}
      window.dispatchEvent(new CustomEvent('blurb-spoiler-preference-changed',{detail:{sourceId:String(book.id),showWarning:next}}));
      toast(next?'Spoilers hidden in Home feed':'Spoilers visible in Home feed');
      return;
    }
    const statusButton=e.target.closest('[data-book-status]');
    if(statusButton){
      const book=bySource.get(modal.dataset.bookId||'');
      if(!book)return;
      statusButton.disabled=true;
      const ok=await setLiveBookStatus(book,statusButton.dataset.bookStatus);
      statusButton.disabled=false;
      if(ok)await refreshBookFlipStatus(book);
      return;
    }
    if(e.target.closest('[data-book-remove]')){
      const book=bySource.get(modal.dataset.bookId||'');
      if(!book)return;
      if(!confirm(`Remove “${book.title}” from your library?`))return;
      const ok=await removeLiveBookStatus(book);
      if(ok){
        closeBookFlip();
        setTimeout(()=>window.dispatchEvent(new CustomEvent('blurb-library-changed')),380);
      }
      return;
    }
    if(e.target.closest('[data-book-admin-alt]')){
      const book=bySource.get(modal.dataset.bookId||'');
      if(book)await openAltArtPicker(book);
      return;
    }
    if(e.target.closest('[data-book-admin-delete]')){
      const book=bySource.get(modal.dataset.bookId||'');
      if(book)await adminHideBook(book);
      return;
    }
  });

  return modal;
}

async function refreshBookFlipStatus(book){
  const modal=document.querySelector('#bookFlipModal');
  if(!modal||modal.hidden||modal.dataset.bookId!==String(book.id))return;
  const statusNote=modal.querySelector('#bookFlipStatusNote');
  const remove=modal.querySelector('[data-book-remove]');
  modal.querySelectorAll('[data-book-status]').forEach(btn=>btn.classList.remove('active'));

  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.user){
    if(statusNote)statusNote.textContent='Sign in to save a reading status.';
    if(remove)remove.hidden=true;
    return;
  }
  const local=await findExistingLocalBook(book);
  if(!local){
    if(statusNote)statusNote.textContent='Choose where this belongs in your library.';
    if(remove)remove.hidden=true;
    return;
  }
  const {data}=await supabase.from('blurb_library')
    .select('reading_status')
    .eq('user_id',session.user.id)
    .eq('book_id',local.id)
    .maybeSingle();
  const current=data?.reading_status||'';
  const active=modal.querySelector(`[data-book-status="${current}"]`);
  active?.classList.add('active');
  if(statusNote)statusNote.textContent=current?'Saved in your library.':'Choose where this belongs in your library.';
  if(remove)remove.hidden=!current;
}

function closeBookFlip(){
  const modal=document.querySelector('#bookFlipModal');
  if(!modal||modal.hidden)return;
  clearTimeout(modal._openFlipTimer);
  clearTimeout(modal._flipSwapTimer);
  clearTimeout(modal._flipEndTimer);
  clearTimeout(modal._closeShrinkTimer);
  clearTimeout(modal._closeHideTimer);

  if(modal.classList.contains('show-back')){
    modal.classList.add('flip-out-back');
    modal._flipSwapTimer=setTimeout(()=>{
      modal.classList.remove('show-back','flip-out-back');
      modal.classList.add('flip-in-front');
    },170);
    modal._flipEndTimer=setTimeout(()=>{
      modal.classList.remove('flip-in-front');
      modal.classList.remove('expanded');
    },340);
    modal._closeHideTimer=setTimeout(()=>{
      modal.hidden=true;
      modal.dataset.bookId='';
      document.body.classList.remove('book-flip-open');
    },690);
  }else{
    modal.classList.remove('expanded');
    modal._closeHideTimer=setTimeout(()=>{
      modal.hidden=true;
      modal.dataset.bookId='';
      document.body.classList.remove('book-flip-open');
    },360);
  }
}

async function openBookFlip(book,coverEl){
  if(!book||!coverEl)return;
  const modal=ensureBookFlipModal();
  const stage=modal.querySelector('#bookFlipStage');
  const front=modal.querySelector('#bookFlipFront');
  const back=modal.querySelector('#bookFlipBack');
  const rect=coverEl.getBoundingClientRect();

  const maxWidth=Math.min(400,window.innerWidth-24);
  const maxByHeight=Math.max(220,(window.innerHeight-56)*(2/3));
  const targetWidth=Math.min(maxWidth,maxByHeight);
  const targetHeight=targetWidth*1.5;
  const targetLeft=(window.innerWidth-targetWidth)/2;
  const targetTop=Math.max(18,(window.innerHeight-targetHeight)/2);

  const scaleX=rect.width/targetWidth;
  const scaleY=rect.height/targetHeight;
  stage.style.setProperty('--flip-dx',(rect.left-targetLeft)+'px');
  stage.style.setProperty('--flip-dy',(rect.top-targetTop)+'px');
  stage.style.setProperty('--flip-scale-x',String(scaleX));
  stage.style.setProperty('--flip-scale-y',String(scaleY));
  stage.style.setProperty('--flip-to-left',targetLeft+'px');
  stage.style.setProperty('--flip-to-top',targetTop+'px');
  stage.style.setProperty('--flip-to-width',targetWidth+'px');
  stage.style.setProperty('--flip-to-height',targetHeight+'px');

  front.innerHTML=book.cover_url
    ?`<img src="${escapeHtml(book.cover_url)}" alt="${escapeHtml(book.title)} cover" />`
    :`<div class="book-flip-cover-fallback">${escapeHtml(book.title)}</div>`;

  const {data:{session}}=await supabase.auth.getSession();
  const admin=isCatalogueAdmin(session);

  back.innerHTML=`
    <div class="book-flip-back-top">
      <button type="button" class="book-flip-cover-button" data-book-flip-cover aria-label="Flip back to cover" title="Flip back to cover">
        <svg class="book-flip-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v16" />
          <path d="M9 7 4 12l5 5V7Z" />
          <path d="m15 7 5 5-5 5V7Z" />
        </svg>
      </button>
      <div class="book-flip-top-actions">
        ${admin?`
          <button type="button" class="book-flip-admin-alt" data-book-admin-alt title="Choose alternate artwork">Alt art</button>
          <button type="button" class="book-flip-admin-delete" data-book-admin-delete>Delete</button>
        `:''}
        <button type="button" class="book-flip-close" data-book-flip-close aria-label="Close">×</button>
      </div>
    </div>

    <div class="book-flip-detail-scroll">
      <div class="book-flip-summary">
        <div class="book-flip-summary-cover">
          ${book.cover_url
            ? `<img src="${escapeHtml(book.cover_url)}" alt="${escapeHtml(book.title)} cover" />`
            : `<span>${escapeHtml(book.title.slice(0,1)||'B')}</span>`}
        </div>
        <div class="book-flip-book-copy">
          <span class="book-flip-kicker">About the book</span>
          <h3>${escapeHtml(book.title)}</h3>
          <p class="book-flip-author">${escapeHtml(book.author)}</p>
          <i class="book-flip-title-rule" aria-hidden="true"></i>
        </div>
      </div>

      <section class="book-flip-synopsis collapsed">
        <button type="button" class="book-flip-section-head" data-book-synopsis-toggle aria-expanded="false">
          <span class="book-flip-section-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4"/><path d="M9 11h6M9 15h6"/></svg>
          </span>
          <strong>Synopsis</strong>
          <span class="book-flip-section-chevron" aria-hidden="true">⌄</span>
        </button>
        <div class="book-flip-synopsis-body">
          <p>${escapeHtml(bookSynopsis(book))}</p>
        </div>
      </section>

      <section class="book-detail-row book-spoiler-warning-setting">
        <span class="book-detail-row-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M3 12s3.4-5 9-5 9 5 9 5-3.4 5-9 5-9-5-9-5Z"/><circle cx="12" cy="12" r="2.5"/><path d="M4 4l16 16"/></svg>
        </span>
        <div class="book-spoiler-warning-copy">
          <strong>Home feed spoilers</strong>
          <span>Cover spoiler-marked posts for this book until you choose to reveal them.</span>
        </div>
        <div class="book-spoiler-control">
          <button type="button" class="book-spoiler-switch is-on" data-book-spoiler-warning-toggle role="switch" aria-checked="true" aria-label="Hide spoilers for ${escapeHtml(book.title)} in Home feed">
            <i></i>
          </button>
          <em class="book-spoiler-state" data-book-spoiler-state>Spoilers hidden</em>
        </div>
      </section>

      <section class="book-detail-row book-flip-library">
        <span class="book-detail-row-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M4 5h5v15H4zM11 4h5v16h-5zM17 7l3-1 3 13-3 1z"/></svg>
        </span>
        <div class="book-flip-library-copy">
          <strong>Add to your library</strong>
          <span id="bookFlipStatusNote">Choose where this belongs in your library.</span>
        </div>
        <div class="book-flip-status-grid">
          <button type="button" data-book-status="tbr">TBR</button>
          <button type="button" data-book-status="reading">Reading</button>
          <button type="button" data-book-status="read">Read</button>
          <button type="button" data-book-status="dnf">DNF</button>
        </div>
        <button type="button" class="book-flip-remove" data-book-remove hidden>Remove from library</button>
      </section>
    </div>`;

  modal.dataset.bookId=String(book.id);
  let showSpoilerWarning=true;
  try{showSpoilerWarning=localStorage.getItem('blurb-spoiler-warning:'+String(book.id))!=='0';}catch{}
  const spoilerToggle=back.querySelector('[data-book-spoiler-warning-toggle]');
  if(spoilerToggle){
    spoilerToggle.setAttribute('aria-checked',String(showSpoilerWarning));
    spoilerToggle.classList.toggle('is-on',showSpoilerWarning);
  }
  const spoilerState=back.querySelector('[data-book-spoiler-state]');
  if(spoilerState){
    spoilerState.textContent=showSpoilerWarning?'Spoilers hidden':'Spoilers visible';
    spoilerState.classList.toggle('is-visible',!showSpoilerWarning);
  }
  modal.hidden=false;
  modal.classList.remove('expanded','flipped','show-back','flip-out-front','flip-in-back','flip-out-back','flip-in-front');
  clearTimeout(modal._openFlipTimer);
  clearTimeout(modal._flipSwapTimer);
  clearTimeout(modal._flipEndTimer);
  clearTimeout(modal._closeShrinkTimer);
  clearTimeout(modal._closeHideTimer);
  document.body.classList.add('book-flip-open');

  // Pop the cover forward first, then turn the whole card as one rigid piece.
  stage.getBoundingClientRect();
  requestAnimationFrame(()=>{
    modal.classList.add('expanded');
    modal._openFlipTimer=setTimeout(()=>{
      modal.classList.add('flip-out-front');
      modal._flipSwapTimer=setTimeout(()=>{
        modal.classList.remove('flip-out-front');
        modal.classList.add('show-back','flip-in-back');
      },170);
      modal._flipEndTimer=setTimeout(()=>modal.classList.remove('flip-in-back'),340);
    },380);
  });
  refreshBookFlipStatus(book);
}

function bindBookFlipActions(root){
  root?.querySelectorAll('[data-book-flip]').forEach(el=>{
    if(el.dataset.flipBound==='1')return;
    el.dataset.flipBound='1';
    el.addEventListener('click',e=>{
      e.preventDefault();
      e.stopPropagation();
      const book=bySource.get(el.dataset.bookFlip);
      if(book)openBookFlip(book,el);
    });
  });
}

function openFeedBookChip(chip){
  if(!ready||!(chip instanceof HTMLElement))return false;
  const title=chip.querySelector('strong')?.textContent?.trim()||'';
  const author=chip.querySelector('small')?.textContent?.trim()||'';
  const book=findBook('',title,author);
  if(!book)return false;
  openBookFlip(book,chip);
  return true;
}

window.openBlurbFeedBook=openFeedBookChip;

function bindLibraryBookFlips(root=document){
  if(!ready)return;
  root?.querySelectorAll?.('[data-library-card]').forEach(card=>{
    const cover=card.querySelector('.library-book-cover');
    if(!cover||cover.dataset.flipBound==='1')return;
    const book=findBook(card.dataset.librarySource,card.dataset.libraryTitle,card.dataset.libraryAuthor);
    if(!book)return;
    card.dataset.catalogueBookId=String(book.id);
    cover.dataset.flipBound='1';
    cover.addEventListener('click',e=>{
      e.preventDefault();
      e.stopPropagation();
      openBookFlip(book,cover);
    });
  });
}


function compactBookCard(book,variant='standard'){
  return `<article class="discover-book ${variant}">
    <button type="button" class="discover-cover book-flip-trigger" data-book-flip="${escapeHtml(book.id)}" style="${coverStyle(book)}" aria-label="View ${escapeHtml(book.title)} details">${book.cover_url?'':`<span>${escapeHtml(book.title)}</span>`}</button>
    <div class="discover-book-copy">
      <strong>${escapeHtml(book.title)}</strong>
      <small>${escapeHtml(book.author)}</small>
    </div>
  </article>`;
}

function renderSearchResults(query){
  const grid=document.querySelector('#bookGrid');
  if(!grid)return;
  const matches=books.filter(b=>norm(b.title).includes(query)||norm(b.author).includes(query)).slice(0,20);
  const heading=document.querySelector('#bookGrid')?.previousElementSibling?.querySelector('h2');
  const count=document.querySelector('#bookCount');
  if(heading)heading.textContent='Search results';
  if(count)count.textContent=`${matches.length}${matches.length===20?'+' : ''} found`;
  grid.className='book-grid';
  grid.innerHTML=matches.map(book=>`
    <article class="book-card">
      <button type="button" class="book-cover book-flip-trigger" data-book-flip="${escapeHtml(book.id)}" style="${coverStyle(book)}" aria-label="View ${escapeHtml(book.title)} details">${book.cover_url?'':`<span>${escapeHtml(book.title)}</span>`}</button>
      <div class="book-meta">
        <strong>${escapeHtml(book.title)}</strong>
        <small>${escapeHtml(book.author)}</small>
      </div>
    </article>`).join('')||'<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">⌕</div><h3>No books found</h3><p>Try another title or author.</p></div>';
  bindBookFlipActions(grid);
}

function renderDiscoverHome(){
  const grid=document.querySelector('#bookGrid');
  if(!grid)return;
  const heading=grid.previousElementSibling?.querySelector('h2');
  const count=document.querySelector('#bookCount');
  if(heading)heading.textContent='Books in the Spotlight';
  if(count)count.textContent='';

  const spotlight=dailySpotlight();
  let trending=trendingBooks.filter(book=>book&&book.cover_url).slice(0,8);
  if(trending.length<6){
    const used=new Set([...spotlight,...trending].map(b=>b.id));
    for(const book of withCovers(books)){
      if(trending.length>=8)break;
      if(!used.has(book.id)){trending.push(book);used.add(book.id);}
    }
  }

  grid.className='discover-home';
  grid.innerHTML=`
    <div class="spotlight-rail" aria-label="Books in the Spotlight">
      ${spotlight.map(book=>compactBookCard(book,'spotlight')).join('')}
    </div>
    <div class="discover-subsection">
      <div class="discover-subtitle"><h2>Trending on Blurb</h2><span>Popular now</span></div>
      <div class="trending-rail" aria-label="Trending on Blurb">
        ${trending.map(book=>compactBookCard(book,'trending')).join('')}
      </div>
    </div>`;
  bindBookFlipActions(grid);
}

function renderDiscover(){
  if(!ready)return;
  const q=norm(document.querySelector('#discoverSearch')?.value||'');
  if(q)renderSearchResults(q);
  else renderDiscoverHome();
}

async function loadTrendingBooks(){
  try{
    const {data,error}=await supabase.from('blurb_posts')
      .select('book_id,blurb_books(title,author)')
      .eq('status','published')
      .limit(200);
    if(error||!data?.length)return;
    const scores=new Map();
    for(const post of data){
      const title=post.blurb_books?.title||'';
      const author=post.blurb_books?.author||'';
      const match=findBook('',title,author);
      if(match)scores.set(match.id,(scores.get(match.id)||0)+1);
    }
    popularityScores=scores;
    trendingBooks=[...scores.entries()]
      .sort((a,b)=>b[1]-a[1])
      .map(([id])=>bySource.get(String(id)))
      .filter(Boolean);
    if(!norm(document.querySelector('#discoverSearch')?.value||''))renderDiscoverHome();
    if(!document.querySelector('#bookSheet')?.hidden)renderPicker();
  }catch(err){
    console.warn('Could not load Blurb trending books',err);
  }
}

function closeBookSheet(){
  const sheet=document.querySelector('#bookSheet');
  const backdrop=document.querySelector('#sheetBackdrop');
  if(sheet)sheet.hidden=true;
  if(backdrop)backdrop.hidden=true;
}

async function uploadNewBookCover(file,userId){
  if(!file)return null;
  if(file.size>10*1024*1024)throw new Error('Cover image must be under 10 MB');
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
  const path=`${userId}/book-covers/${crypto.randomUUID()}.${ext}`;
  const {error}=await supabase.storage.from('blurb-media').upload(path,file,{contentType:file.type||'image/jpeg',upsert:false});
  if(error)throw error;
  return supabase.storage.from('blurb-media').getPublicUrl(path).data.publicUrl;
}

function resetAddBookForm(){
  const form=document.querySelector('#addBookForm');
  const preview=document.querySelector('#newBookCoverPreview');
  const status=document.querySelector('#addBookStatus');
  form?.reset();
  if(preview)preview.textContent='＋';
  if(status){status.textContent='';status.className='form-status';}
}

function classifyBookIdentifier(raw=''){
  const clean=String(raw||'').trim().replace(/[\s-]+/g,'').toUpperCase();
  if(!clean)return {isbn10:null,isbn13:null,asin:null};
  if(/^\d{13}$/.test(clean))return {isbn10:null,isbn13:clean,asin:null};
  if(/^\d{9}[\dX]$/.test(clean))return {isbn10:clean,isbn13:null,asin:null};
  if(/^[A-Z0-9]{10}$/.test(clean))return {isbn10:null,isbn13:null,asin:clean};
  return null;
}

function bindAddBookUI(){
  const toggle=document.querySelector('#addBookToggle');
  const form=document.querySelector('#addBookForm');
  const cancel=document.querySelector('#cancelAddBook');
  const cover=document.querySelector('#newBookCover');
  const preview=document.querySelector('#newBookCoverPreview');
  if(!toggle||!form||form.dataset.bound==='1')return;
  form.dataset.bound='1';

  const search=document.querySelector('#bookSheetSearch');
  const list=document.querySelector('#bookSheetList');
  const modal=document.querySelector('#bookSheet');

  const showAddBook=()=>{
    form.hidden=false;
    modal?.classList.add('adding-book');
    toggle.textContent='← Back to book list';
    setTimeout(()=>document.querySelector('#newBookTitle')?.focus(),60);
  };

  const showBookList=()=>{
    form.hidden=true;
    modal?.classList.remove('adding-book');
    toggle.textContent='＋ Book not listed? Add it';
    resetAddBookForm();
  };

  toggle.addEventListener('click',()=>form.hidden?showAddBook():showBookList());
  cancel?.addEventListener('click',showBookList);

  cover?.addEventListener('change',()=>{
    const file=cover.files?.[0];
    if(!preview)return;
    if(!file){preview.textContent='＋';return;}
    const url=URL.createObjectURL(file);
    preview.innerHTML='<img src="'+url+'" alt="" />';
  });

  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const status=document.querySelector('#addBookStatus');
    const button=document.querySelector('#saveNewBook');
    const title=document.querySelector('#newBookTitle')?.value?.trim()||'';
    const author=document.querySelector('#newBookAuthor')?.value?.trim()||'';
    const identifierRaw=document.querySelector('#newBookIdentifier')?.value?.trim()||'';
    const identifier=classifyBookIdentifier(identifierRaw);
    const file=cover?.files?.[0]||null;
    if(!title||!author)return;
    if(identifierRaw&&!identifier){
      if(status){status.textContent='Enter a valid ISBN-10, ISBN-13 or 10-character ASIN.';status.className='form-status error';}
      return;
    }
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.user){
      if(status){status.textContent='Sign in before adding a new book.';status.className='form-status error';}
      return;
    }
    button.disabled=true;
    if(status){status.textContent='Adding book…';status.className='form-status';}
    try{
      const coverUrl=await uploadNewBookCover(file,session.user.id);
      const sourceId='user-'+crypto.randomUUID();
      const {data,error}=await supabase.from('blurb_books').insert({
        source:'user_added',
        source_id:sourceId,
        title,
        author,
        isbn10:identifier?.isbn10||null,
        isbn13:identifier?.isbn13||null,
        asin:identifier?.asin||null,
        cover_url:coverUrl,
        genres:[]
      }).select('id,title,author,cover_url,isbn10,isbn13,asin').single();
      if(error)throw error;

      const hidden=document.querySelector('#selectedBookId');
      const label=document.querySelector('#selectedBookLabel');
      if(hidden)hidden.value=data.id;
      if(label)label.textContent=data.title;

      resetAddBookForm();
      form.hidden=true;
      modal?.classList.remove('adding-book');
      toggle.textContent='＋ Book not listed? Add it';
      closeBookSheet();
      toast('Book added');
    }catch(err){
      console.warn('Could not add custom book',err);
      if(status){status.textContent=err?.message||'Couldn’t add that book.';status.className='form-status error';}
    }finally{
      button.disabled=false;
    }
  });
}

function renderPicker(){
  bindAddBookUI();
  if(!ready)return;
  const list=document.querySelector('#bookSheetList');
  const search=document.querySelector('#bookSheetSearch');
  if(!list||!search)return;
  const q=norm(search.value);
  const matches=books
    .map((book,index)=>({book,index,score:popularityScores.get(book.id)||0}))
    .filter(x=>!q||norm(x.book.title).includes(q)||norm(x.book.author).includes(q))
    .sort((a,b)=>(b.score-a.score)||(a.index-b.index))
    .slice(0,20)
    .map(x=>x.book);
  list.innerHTML=matches.map(book=>`
    <button class="sheet-book" data-live-pick="${escapeHtml(book.id)}">
      <i class="mini-cover" style="${coverStyle(book)}"></i>
      <span><strong>${escapeHtml(book.title)}</strong><small>${escapeHtml(book.author)}</small></span>
    </button>`).join('');

  list.querySelectorAll('[data-live-pick]').forEach(el=>el.addEventListener('click',async e=>{
    e.preventDefault();
    const book=bySource.get(el.dataset.livePick);
    const local=await ensureLocalBook(book);
    if(!local)return;
    const hidden=document.querySelector('#selectedBookId');
    const label=document.querySelector('#selectedBookLabel');
    if(hidden)hidden.value=local.id;
    if(label)label.textContent=`${book.title} — ${book.author}`;
    closeBookSheet();
  }));
}

function paintExistingCovers(root=document){
  if(!ready)return;
  root.querySelectorAll?.('.feed-card').forEach(card=>{
    const chip=card.querySelector('.book-chip');
    const title=chip?.querySelector('strong')?.textContent?.trim()||card.querySelector('.spoiler-title')?.textContent?.trim()||'';
    const author=chip?.querySelector('small')?.textContent?.trim()||card.querySelector('.spoiler-author')?.textContent?.trim()||'';
    const book=findBook('',title,author);
    if(!book?.cover_url)return;
    for(const el of [card.querySelector('.cover-art'),card.querySelector('.spoiler-book-cover'),chip?.querySelector('.mini-cover')]){
      if(!(el instanceof HTMLElement))continue;
      el.style.backgroundImage=`url("${book.cover_url.replace(/"/g,'%22')}")`;
      el.style.backgroundSize='cover';
      el.style.backgroundPosition='center';
      el.style.backgroundRepeat='no-repeat';
      [...el.children].forEach(child=>{child.style.opacity='0';child.style.pointerEvents='none';});
    }
  });
  root.querySelectorAll?.('.library-book-card').forEach(card=>{
    const title=card.dataset.libraryTitle||card.querySelector('.library-book-meta strong')?.textContent?.trim()||'';
    const author=card.dataset.libraryAuthor||card.querySelector('.library-book-meta small')?.textContent?.trim()||'';
    const sourceId=card.dataset.librarySource||'';
    const book=findBook(sourceId,title,author);
    const el=card.querySelector('.library-book-cover');
    if(book&&el instanceof HTMLElement){
      card.dataset.catalogueBookId=String(book.id);
      if(book.cover_url){
        el.style.backgroundImage=`url("${book.cover_url.replace(/"/g,'%22')}")`;
        el.style.backgroundSize='cover';
        el.style.backgroundPosition='center';
        el.style.backgroundRepeat='no-repeat';
        el.classList.add('has-live-cover');
      }
    }
  });

  root.querySelectorAll?.('.discover-book').forEach(card=>{
    const title=card.querySelector('.discover-book-copy strong')?.textContent?.trim()||'';
    const author=card.querySelector('.discover-book-copy small')?.textContent?.trim()||'';
    const book=findBook('',title,author);
    const el=card.querySelector('.discover-cover');
    if(book?.cover_url&&el instanceof HTMLElement){
      el.style.backgroundImage=`url("${book.cover_url.replace(/"/g,'%22')}")`;
      el.style.backgroundSize='cover';
      el.style.backgroundPosition='center';
      el.style.backgroundRepeat='no-repeat';
      el.dataset.bookFlip=String(book.id);
    }
  });

  root.querySelectorAll?.('#bookGrid .book-card').forEach(card=>{
    const title=card.querySelector('.book-meta strong')?.textContent?.trim()||'';
    const author=card.querySelector('.book-meta small')?.textContent?.trim()||'';
    const book=findBook('',title,author);
    const el=card.querySelector('.book-cover');
    if(book?.cover_url&&el instanceof HTMLElement){
      el.style.backgroundImage=`url("${book.cover_url.replace(/"/g,'%22')}")`;
      el.style.backgroundSize='cover';
      el.style.backgroundPosition='center';
      el.style.backgroundRepeat='no-repeat';
      el.dataset.bookFlip=String(book.id);
      el.classList.add('book-flip-trigger');
    }
  });

  bindLibraryBookFlips(root);
  bindBookFlipActions(root);
}

function installDiscoverStyles(){
  if(document.querySelector('#discover-redesign-styles'))return;
  const style=document.createElement('style');
  style.id='discover-redesign-styles';
  style.textContent=`
    .discover-home{display:block!important;width:100%!important;min-width:0!important}
    .spotlight-rail,.trending-rail{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(138px,42%);gap:13px;overflow-x:auto;overscroll-behavior-inline:contain;scroll-snap-type:x proximity;padding:2px 1px 10px;scrollbar-width:none}
    .spotlight-rail::-webkit-scrollbar,.trending-rail::-webkit-scrollbar{display:none}
    .discover-book{scroll-snap-align:start;min-width:0}
    .discover-cover{width:100%;aspect-ratio:2/3;border-radius:10px;background:linear-gradient(145deg,#70432d,#2f211b);background-size:cover;background-position:center;box-shadow:0 12px 24px rgba(80,46,27,.18);overflow:hidden;display:grid;place-items:center;padding:12px;color:#fff8ed;text-align:center;font-family:Georgia,serif}
    .discover-book-copy{padding:8px 2px 0;min-width:0}
    .discover-book-copy strong,.discover-book-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .discover-book-copy strong{font-size:12px}
    .discover-book-copy small{font-size:10px;color:var(--muted);margin-top:3px}
    .discover-tbr{margin-top:7px;border:1px solid var(--line);background:var(--panel);border-radius:999px;padding:5px 9px;font-size:9px;color:#6f4d3d}
    .discover-subsection{margin-top:25px}
    .discover-subtitle{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px}
    .discover-subtitle h2{margin:0;font-family:Georgia,serif;font-size:20px;font-weight:500}
    .discover-subtitle span{font-size:11px;color:var(--muted)}
    .trending-rail{grid-auto-columns:minmax(116px,34%)}
    .trending-rail .discover-cover{border-radius:8px}
    @media(max-width:380px){.spotlight-rail{grid-auto-columns:minmax(128px,46%)}.trending-rail{grid-auto-columns:minmax(108px,38%)}}
  `;
  document.head.appendChild(style);
}

async function loadCatalogue(){
  try{
    const response=await fetch(CATALOGUE_URL,{headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`Catalogue ${response.status}`);
    const payload=await response.json();
    books=(payload.books||[]).map(b=>({
      id:String(b.id),
      title:String(b.title||'Untitled'),
      author:String(b.author||''),
      cover_url:b.cover_url||null,
      description:String(b.description||b.synopsis||b.summary||b.blurb||'').trim()
    }));

    try{
      const {data:overrides}=await supabase.from('blurb_catalogue_overrides')
        .select('source_id,cover_url,is_hidden');
      const overrideMap=new Map((overrides||[]).map(item=>[String(item.source_id),item]));
      books=books
        .filter(book=>!overrideMap.get(String(book.id))?.is_hidden)
        .map(book=>{
          const override=overrideMap.get(String(book.id));
          return override?.cover_url?{...book,cover_url:override.cover_url}:book;
        });
    }catch(err){
      console.warn('Could not load catalogue overrides',err);
    }

    try{
      const {data:synopsisRows,error:synopsisError}=await supabase
        .from('blurb_catalogue_synopsis')
        .select('source_id,synopsis');
      if(!synopsisError&&synopsisRows?.length){
        const synopsisMap=new Map(synopsisRows.map(row=>[String(row.source_id),String(row.synopsis||'').trim()]));
        books=books.map(book=>{
          const synopsis=synopsisMap.get(String(book.id));
          return synopsis&&!book.description?{...book,description:synopsis}:book;
        });
      }
    }catch(err){
      console.warn('Could not load Blurb synopsis cache',err);
    }

    bySource=new Map(books.map(b=>[b.id,b]));
    byKey=new Map(books.map(b=>[`${norm(b.title)}|${norm(b.author)}`,b]));
    try{
      const {data:localDescriptions}=await supabase.from('blurb_books')
        .select('source_id,title,author,description')
        .not('description','is',null);
      for(const local of localDescriptions||[]){
        const match=findBook(local.source_id,local.title,local.author);
        if(match&&!match.description)match.description=String(local.description||'').trim();
      }
    }catch{}
    ready=true;
    renderDiscover();
    paintExistingCovers();
    loadTrendingBooks();
  }catch(err){console.warn('Live Book of Zee catalogue unavailable',err);}
}

function start(){
  installDiscoverStyles();
  bindAddBookUI();
  document.querySelector('#discoverSearch')?.addEventListener('input',()=>queueMicrotask(renderDiscover));
  document.querySelector('#bookSheetSearch')?.addEventListener('input',()=>queueMicrotask(renderPicker));
  document.querySelector('#bookPickerButton')?.addEventListener('click',()=>setTimeout(renderPicker,0));
  document.querySelector('[data-view="discover"]')?.addEventListener('click',()=>setTimeout(renderDiscover,0));

  new MutationObserver(mutations=>{
    if(!ready)return;
    for(const mutation of mutations){
      for(const node of mutation.addedNodes){
        if(node instanceof HTMLElement)paintExistingCovers(node.parentElement||node);
      }
    }
  }).observe(document.body,{childList:true,subtree:true});

  loadCatalogue();
}

document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
