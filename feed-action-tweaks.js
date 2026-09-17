import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';

const supabase=createClient('https://ndinulaqwixbmgjhrhdo.supabase.co','sb_publishable__zMSwgf2znc_n8927aheRw_PiWY5BL1');

const bookIcon=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5.5c2.9-.8 5.5-.4 8 1.3v11.5c-2.5-1.7-5.1-2.1-8-1.3z"/><path d="M20.5 5.5c-2.9-.8-5.5-.4-8 1.3v11.5c2.5-1.7 5.1-2.1 8-1.3z"/><path d="M12 6.8v11.5"/></svg>`;
const shareIcon=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18c1.4-5.2 5.1-8.1 11-8.1h2"/><path d="m14.5 6.5 3.7 3.4-3.7 3.4"/></svg>`;
const starIcon=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.8 5.67 6.26.91-4.53 4.42 1.07 6.24L12 17.1l-5.6 2.94 1.07-6.24-4.53-4.42 6.26-.91L12 2.8Z"/></svg>`;

function toast(message){
  const el=document.querySelector('#toast');
  if(!el)return;
  el.textContent=message;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t=setTimeout(()=>el.classList.remove('show'),1900);
}

function closeAddMenu(wrap){
  if(!wrap)return;
  wrap.classList.remove('open');
  wrap.closest('.feed-card')?.classList.remove('add-menu-active');
  wrap.querySelector('.add-main')?.setAttribute('aria-expanded','false');
  wrap.querySelector('.add-status-menu')?.setAttribute('aria-hidden','true');
}

function closeAllAddMenus(except=null){
  document.querySelectorAll('.add-action-wrap.open').forEach(wrap=>{
    if(wrap!==except) closeAddMenu(wrap);
  });
}

function closeShareMenusForAdd(){
  document.querySelectorAll('.share-pop-wrap.open').forEach(wrap=>{
    wrap.classList.remove('open');
    wrap.querySelector('.share-pop-main')?.setAttribute('aria-expanded','false');
    wrap.closest('.feed-card')?.classList.remove('share-menu-active');
  });
}

async function saveReadingStatus(bookId,status){
  if(!bookId){toast('Book link unavailable');return;}
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.user){
    document.querySelector('#openNotifications')?.click();
    return;
  }
  const {data:existing}=await supabase.from('blurb_library')
    .select('is_favourite')
    .eq('user_id',session.user.id)
    .eq('book_id',bookId)
    .maybeSingle();
  const {error}=await supabase.from('blurb_library').upsert({
    user_id:session.user.id,
    book_id:bookId,
    reading_status:status,
    is_favourite:existing?.is_favourite||false,
    updated_at:new Date().toISOString()
  },{onConflict:'user_id,book_id'});
  if(error){toast('Couldn’t update your library');return;}
  const label=status==='read'?'Finished':status==='reading'?'Reading':status==='dnf'?'DNF':'TBR';
  toast(`Added to ${label}`);
}

function enhanceComments(card){
  const button=card.querySelector('[data-comments]');
  const icon=button?.querySelector('.action-icon');
  if(icon&&!icon.dataset.bookIcon){icon.innerHTML=bookIcon;icon.dataset.bookIcon='1';}
}

function enhanceShare(card){
  const button=card.querySelector('[data-share]');
  const icon=button?.querySelector('.action-icon');
  if(icon&&!icon.dataset.shareIcon){icon.innerHTML=shareIcon;icon.dataset.shareIcon='1';}
}

function enhanceRating(card){
  const line=card.querySelector('.rating-line');
  if(!line||line.dataset.simpleRating)return;
  const match=line.textContent.match(/(\d+(?:\.\d+)?)/g);
  const value=match?.at(-1);
  if(!value)return;
  line.innerHTML=`<span class="single-rating-star">${starIcon}</span><span class="single-rating-value">${Number(value).toFixed(1)}</span>`;
  line.dataset.simpleRating='1';
}

function enhanceAdd(card){
  const existing=card.querySelector('[data-tbr]');
  if(!existing||card.querySelector('.add-action-wrap'))return;
  const bookId=existing.dataset.tbr||'';
  const wrap=document.createElement('div');
  wrap.className='add-action-wrap';
  wrap.innerHTML=`
    <button type="button" class="add-main" aria-expanded="false" aria-label="Add book to library">
      <span class="action-icon">＋</span><span>Add</span>
    </button>
    <div class="add-status-menu" aria-hidden="true">
      <button type="button" class="add-status-option" data-status="read"><span class="status-symbol">✓</span><span class="status-label">Finished</span></button>
      <button type="button" class="add-status-option" data-status="tbr"><span class="status-symbol">＋</span><span class="status-label">TBR</span></button>
      <button type="button" class="add-status-option" data-status="reading"><span class="status-symbol">◫</span><span class="status-label">Reading</span></button>
      <button type="button" class="add-status-option" data-status="dnf"><span class="status-symbol">×</span><span class="status-label">DNF</span></button>
    </div>`;
  existing.replaceWith(wrap);
  const main=wrap.querySelector('.add-main');
  const menu=wrap.querySelector('.add-status-menu');
  main.addEventListener('click',e=>{
    e.preventDefault();
    e.stopPropagation();
    const opening=!wrap.classList.contains('open');
    closeShareMenusForAdd();
    closeAllAddMenus(wrap);
    wrap.classList.toggle('open',opening);
    card.classList.toggle('add-menu-active',opening);
    main.setAttribute('aria-expanded',String(opening));
    menu.setAttribute('aria-hidden',String(!opening));
  });
  wrap.querySelectorAll('.add-status-option').forEach(button=>button.addEventListener('click',async e=>{
    e.preventDefault();
    e.stopPropagation();
    await saveReadingStatus(bookId,button.dataset.status);
    closeAddMenu(wrap);
  }));
}

function enhance(root=document){
  const cards=root.matches?.('.feed-card')?[root]:[...root.querySelectorAll?.('.feed-card')||[]];
  for(const card of cards){enhanceComments(card);enhanceShare(card);enhanceRating(card);enhanceAdd(card);}
}

function start(){
  enhance();
  const feed=document.querySelector('#feed');
  if(feed){
    new MutationObserver(mutations=>{
      for(const mutation of mutations){for(const node of mutation.addedNodes){if(node instanceof HTMLElement)enhance(node);}}
    }).observe(feed,{childList:true,subtree:true});
  }
  document.addEventListener('click',e=>{
    if(!e.target.closest('.add-action-wrap')) closeAllAddMenus();
  });
  import('/profile-grid-enhance.js?v=1').catch(console.error);
  if(!document.querySelector('link[data-profile-grid-enhance]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/profile-grid-enhance.css?v=1';
    link.dataset.profileGridEnhance='1';
    document.head.appendChild(link);
  }
}

document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();