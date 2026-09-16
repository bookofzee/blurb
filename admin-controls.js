import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';

const supabase=createClient('https://ndinulaqwixbmgjhrhdo.supabase.co','sb_publishable__zMSwgf2znc_n8927aheRw_PiWY5BL1');
const CATALOGUE_URL='https://book-of-zee.onrender.com/api/blurb/catalogue';
const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
const keyFor=(title,author)=>`${norm(title)}|${norm(author)}`;
let hiddenIds=new Set();
let overrides=new Map();
let catalogueById=new Map();
let catalogueByKey=new Map();
let isAdmin=false;
let currentUser=null;

function toast(message){
  const el=document.querySelector('#toast');
  if(!el)return;
  el.textContent=message;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t=setTimeout(()=>el.classList.remove('show'),1900);
}

function sourceIdForCard(card){
  return card?.dataset?.liveBook
    ||card?.dataset?.livePick
    ||card?.querySelector?.('[data-live-tbr]')?.dataset?.liveTbr
    ||'';
}

function paint(el,url){
  if(!(el instanceof HTMLElement)||!url)return;
  el.style.backgroundImage=`url('${String(url).replace(/'/g,'%27')}')`;
  el.style.backgroundSize='cover';
  el.style.backgroundPosition='center';
  el.style.backgroundRepeat='no-repeat';
  el.style.backgroundColor='#2f211b';
}

function hideExcluded(root=document){
  const selectors=['.discover-book','.book-card','.sheet-book'];
  for(const selector of selectors){
    root.querySelectorAll?.(selector).forEach(card=>{
      const sourceId=sourceIdForCard(card);
      if(sourceId&&hiddenIds.has(String(sourceId))) card.remove();
    });
  }
  const heading=document.querySelector('#bookGrid')?.previousElementSibling?.querySelector('h2')?.textContent?.trim();
  if(heading==='Search results'){
    const visible=document.querySelectorAll('#bookGrid .book-card').length;
    const count=document.querySelector('#bookCount');
    if(count)count.textContent=`${visible} found`;
  }
}

function applyCoverOverrides(root=document){
  root.querySelectorAll?.('.discover-book,.book-card,.sheet-book').forEach(card=>{
    const sourceId=String(sourceIdForCard(card)||'');
    const override=overrides.get(sourceId);
    if(!override?.cover_url)return;
    paint(card.querySelector('.discover-cover,.book-cover,.mini-cover'),override.cover_url);
  });

  root.querySelectorAll?.('.feed-card').forEach(card=>{
    const chip=card.querySelector('.book-chip');
    const title=chip?.querySelector('strong')?.textContent?.trim()||card.querySelector('.spoiler-title')?.textContent?.trim()||'';
    const author=chip?.querySelector('small')?.textContent?.trim()||card.querySelector('.spoiler-author')?.textContent?.trim()||'';
    const book=catalogueByKey.get(keyFor(title,author));
    const override=book?overrides.get(String(book.id)):null;
    if(!override?.cover_url)return;
    paint(card.querySelector('.cover-art'),override.cover_url);
    paint(card.querySelector('.spoiler-book-cover'),override.cover_url);
    paint(chip?.querySelector('.mini-cover'),override.cover_url);
  });
}

async function removeFromBlurb(sourceId,card){
  if(!isAdmin||!currentUser||!sourceId)return;
  if(!window.confirm('Remove this book from Blurb? The Book of Zee record will stay untouched.'))return;
  const {error}=await supabase.from('blurb_hidden_books').insert({source_id:String(sourceId),hidden_by:currentUser.id});
  if(error&&error.code!=='23505'){
    console.warn('Could not hide Blurb book',error);
    toast('Couldn’t remove that book');
    return;
  }
  hiddenIds.add(String(sourceId));
  card?.remove();
  hideExcluded();
  toast('Removed from Blurb');
}

function closeCoverPicker(){
  document.querySelector('#blurbCoverPicker')?.remove();
}

function prettyFormat(value){
  const v=String(value||'Edition').toLowerCase();
  if(v==='ebook')return 'Ebook';
  return v.charAt(0).toUpperCase()+v.slice(1);
}

async function chooseEditionCover(sourceId,edition){
  if(!isAdmin||!currentUser)return;
  const row={
    source_id:String(sourceId),
    edition_id:String(edition.id||''),
    cover_url:String(edition.cover_url||''),
    format:String(edition.format||''),
    updated_by:currentUser.id,
    updated_at:new Date().toISOString()
  };
  const {error}=await supabase.from('blurb_cover_overrides').upsert(row,{onConflict:'source_id'});
  if(error){
    console.warn('Could not save Blurb cover override',error);
    toast('Couldn’t save that cover');
    return;
  }
  overrides.set(String(sourceId),row);
  closeCoverPicker();
  applyCoverOverrides();
  toast('Blurb cover updated');
}

async function resetEditionCover(sourceId){
  if(!isAdmin)return;
  const {error}=await supabase.from('blurb_cover_overrides').delete().eq('source_id',String(sourceId));
  if(error){toast('Couldn’t reset that cover');return;}
  overrides.delete(String(sourceId));
  closeCoverPicker();
  const book=catalogueById.get(String(sourceId));
  document.querySelectorAll('.discover-book,.book-card,.sheet-book').forEach(card=>{
    if(String(sourceIdForCard(card)||'')!==String(sourceId))return;
    const el=card.querySelector('.discover-cover,.book-cover,.mini-cover');
    if(book?.cover_url)paint(el,book.cover_url);
  });
  toast('Using default cover');
}

async function openCoverPicker(sourceId){
  if(!isAdmin||!sourceId)return;
  closeCoverPicker();
  const book=catalogueById.get(String(sourceId));
  const overlay=document.createElement('div');
  overlay.id='blurbCoverPicker';
  overlay.className='blurb-cover-picker-backdrop';
  overlay.innerHTML=`<section class="blurb-cover-picker" role="dialog" aria-modal="true" aria-label="Choose alternate cover">
    <button class="blurb-cover-close" type="button" aria-label="Close">×</button>
    <p class="blurb-cover-eyebrow">Choose cover artwork</p>
    <h2>${book?.title||'Book cover'}</h2>
    <p class="blurb-cover-sub">Pick another edition cover already in the Book of Zee catalogue.</p>
    <div class="blurb-cover-loading">Loading editions…</div>
  </section>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeCoverPicker();});
  overlay.querySelector('.blurb-cover-close')?.addEventListener('click',closeCoverPicker);

  try{
    const response=await fetch(`${CATALOGUE_URL}/${encodeURIComponent(sourceId)}/editions`,{headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`Editions ${response.status}`);
    const payload=await response.json();
    const editions=(payload.editions||[]).filter(e=>e?.cover_url);
    const panel=overlay.querySelector('.blurb-cover-picker');
    if(!panel)return;
    const current=overrides.get(String(sourceId))?.cover_url||book?.cover_url||'';
    panel.querySelector('.blurb-cover-loading')?.remove();
    if(!editions.length){
      panel.insertAdjacentHTML('beforeend','<div class="blurb-cover-empty">No alternate print/ebook covers found for this title.</div>');
      return;
    }
    const grid=document.createElement('div');
    grid.className='blurb-edition-grid';
    for(const edition of editions){
      const button=document.createElement('button');
      button.type='button';
      button.className='blurb-edition-card';
      if(String(edition.cover_url)===String(current))button.classList.add('current');
      const image=document.createElement('img');
      image.src=edition.cover_url;
      image.alt='';
      image.loading='lazy';
      const copy=document.createElement('span');
      copy.innerHTML=`<strong>${prettyFormat(edition.format)}</strong><small>${edition.publisher||''}${edition.publication_date?`${edition.publisher?' · ':''}${edition.publication_date}`:''}</small>`;
      button.append(image,copy);
      if(button.classList.contains('current')){
        const badge=document.createElement('i');badge.textContent='CURRENT';button.appendChild(badge);
      }
      button.addEventListener('click',()=>chooseEditionCover(sourceId,edition));
      grid.appendChild(button);
    }
    panel.appendChild(grid);
    if(overrides.has(String(sourceId))){
      const reset=document.createElement('button');
      reset.type='button';
      reset.className='blurb-cover-reset';
      reset.textContent='Use default cover';
      reset.addEventListener('click',()=>resetEditionCover(sourceId));
      panel.appendChild(reset);
    }
  }catch(error){
    console.warn('Could not load alternate covers',error);
    const loading=overlay.querySelector('.blurb-cover-loading');
    if(loading)loading.textContent='Couldn’t load edition covers right now.';
  }
}

function addAdminButtons(root=document){
  if(!isAdmin)return;
  root.querySelectorAll?.('.discover-book,.book-card').forEach(card=>{
    const sourceId=sourceIdForCard(card);
    if(!sourceId||hiddenIds.has(String(sourceId)))return;
    const target=card.querySelector('.discover-book-copy,.book-meta')||card;

    if(!card.querySelector('.admin-alt-cover')){
      const alt=document.createElement('span');
      alt.className='admin-alt-cover';
      alt.setAttribute('role','button');
      alt.setAttribute('tabindex','0');
      alt.textContent='◫ Alt cover';
      const act=e=>{e.preventDefault();e.stopPropagation();openCoverPicker(sourceId);};
      alt.addEventListener('click',act);
      alt.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act(e);}});
      target.appendChild(alt);
    }

    if(!card.querySelector('.admin-remove-book')){
      const control=document.createElement('span');
      control.className='admin-remove-book';
      control.setAttribute('role','button');
      control.setAttribute('tabindex','0');
      control.setAttribute('aria-label','Remove this book from Blurb');
      control.textContent='✕ Remove';
      const act=e=>{e.preventDefault();e.stopPropagation();removeFromBlurb(sourceId,card);};
      control.addEventListener('click',act);
      control.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act(e);}});
      target.appendChild(control);
    }
  });
}

function installStyles(){
  if(document.querySelector('#admin-book-control-styles'))return;
  const style=document.createElement('style');
  style.id='admin-book-control-styles';
  style.textContent=`
    .admin-remove-book,.admin-alt-cover{display:inline-flex;align-items:center;justify-content:center;margin-top:6px;margin-right:5px;padding:5px 9px;border:1px solid rgba(143,65,45,.28);border-radius:999px;background:#fff7f2;color:#9b4938;font-size:9px;line-height:1;cursor:pointer;user-select:none;white-space:nowrap}
    .admin-alt-cover{border-color:rgba(180,130,45,.34);background:#fffaf0;color:#8a651d}.admin-alt-cover:hover{background:#f8edcf}.admin-remove-book:hover{background:#fae8df}
    .blurb-cover-picker-backdrop{position:fixed;inset:0;z-index:99999;background:rgba(28,22,18,.66);display:flex;align-items:center;justify-content:center;padding:22px}
    .blurb-cover-picker{position:relative;width:min(880px,96vw);max-height:88vh;overflow:auto;background:#fffdf9;border:1px solid #e4d7c8;border-radius:24px;padding:28px;box-shadow:0 28px 80px rgba(28,18,12,.3);color:#2f211b}
    .blurb-cover-close{position:absolute;right:20px;top:18px;width:42px;height:42px;border-radius:50%;border:1px solid #dfd2c3;background:#fffdf9;font-size:24px;cursor:pointer}.blurb-cover-eyebrow{text-transform:uppercase;letter-spacing:.16em;color:#b58735;font-weight:800;font-size:11px;margin:0 0 8px}.blurb-cover-picker h2{font-family:Georgia,serif;font-size:30px;font-weight:500;margin:0 48px 5px 0}.blurb-cover-sub{margin:0 0 22px;color:#7b6b61}.blurb-cover-loading,.blurb-cover-empty{padding:28px 0;color:#8a786d}.blurb-edition-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:18px}.blurb-edition-card{position:relative;text-align:left;border:1px solid #e5d7c7;background:#fff;border-radius:16px;padding:10px;cursor:pointer;color:#2f211b}.blurb-edition-card.current{outline:2px solid #c99b43;outline-offset:2px}.blurb-edition-card img{display:block;width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:10px;background:#eee6db}.blurb-edition-card span{display:block;padding:9px 2px 2px}.blurb-edition-card strong,.blurb-edition-card small{display:block}.blurb-edition-card strong{font-size:14px}.blurb-edition-card small{font-size:11px;color:#806f64;margin-top:3px}.blurb-edition-card i{position:absolute;top:16px;left:16px;background:rgba(255,255,255,.92);border-radius:999px;padding:4px 7px;font-style:normal;font-size:8px;font-weight:800}.blurb-cover-reset{margin-top:20px;border:1px solid #d9cab9;background:#fff;border-radius:999px;padding:9px 14px;color:#765846;cursor:pointer}
    @media(max-width:560px){.blurb-cover-picker{padding:22px 16px;border-radius:20px}.blurb-edition-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.blurb-cover-picker h2{font-size:25px}}
  `;
  document.head.appendChild(style);
}

function apply(root=document){
  hideExcluded(root);
  applyCoverOverrides(root);
  addAdminButtons(root);
}

async function loadState(){
  const [{data:hidden},{data:coverRows},{data:{session}},catalogueResponse]=await Promise.all([
    supabase.from('blurb_hidden_books').select('source_id'),
    supabase.from('blurb_cover_overrides').select('source_id,edition_id,cover_url,format'),
    supabase.auth.getSession(),
    fetch(CATALOGUE_URL,{headers:{Accept:'application/json'}}).catch(()=>null)
  ]);
  hiddenIds=new Set((hidden||[]).map(row=>String(row.source_id)));
  overrides=new Map((coverRows||[]).map(row=>[String(row.source_id),row]));
  if(catalogueResponse?.ok){
    const payload=await catalogueResponse.json();
    const books=payload.books||[];
    catalogueById=new Map(books.map(book=>[String(book.id),book]));
    catalogueByKey=new Map(books.map(book=>[keyFor(book.title,book.author),book]));
  }
  currentUser=session?.user||null;
  if(currentUser){
    const {data:profile}=await supabase.from('blurb_profiles').select('is_admin').eq('id',currentUser.id).maybeSingle();
    isAdmin=profile?.is_admin===true;
  }else{
    isAdmin=false;
  }
  apply();
}

function start(){
  installStyles();
  const observer=new MutationObserver(mutations=>{
    for(const mutation of mutations){
      for(const node of mutation.addedNodes){
        if(node instanceof HTMLElement)apply(node.parentElement||node);
      }
    }
  });
  observer.observe(document.body,{childList:true,subtree:true});
  supabase.auth.onAuthStateChange(()=>setTimeout(loadState,0));
  loadState();
}

document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
