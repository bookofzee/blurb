import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';

const supabase=createClient('https://ndinulaqwixbmgjhrhdo.supabase.co','sb_publishable__zMSwgf2znc_n8927aheRw_PiWY5BL1');
let hiddenIds=new Set();
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

function addAdminButtons(root=document){
  if(!isAdmin)return;
  root.querySelectorAll?.('.discover-book,.book-card').forEach(card=>{
    const sourceId=sourceIdForCard(card);
    if(!sourceId||hiddenIds.has(String(sourceId))||card.querySelector('.admin-remove-book'))return;
    const control=document.createElement('span');
    control.className='admin-remove-book';
    control.setAttribute('role','button');
    control.setAttribute('tabindex','0');
    control.setAttribute('aria-label','Remove this book from Blurb');
    control.textContent='✕ Remove';
    const act=e=>{
      e.preventDefault();
      e.stopPropagation();
      removeFromBlurb(sourceId,card);
    };
    control.addEventListener('click',act);
    control.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act(e);}});
    const target=card.querySelector('.discover-book-copy,.book-meta')||card;
    target.appendChild(control);
  });
}

function installStyles(){
  if(document.querySelector('#admin-book-control-styles'))return;
  const style=document.createElement('style');
  style.id='admin-book-control-styles';
  style.textContent=`
    .admin-remove-book{display:inline-flex;align-items:center;justify-content:center;margin-top:6px;margin-left:6px;padding:5px 9px;border:1px solid rgba(143,65,45,.28);border-radius:999px;background:#fff7f2;color:#9b4938;font-size:9px;line-height:1;cursor:pointer;user-select:none;white-space:nowrap}
    .admin-remove-book:hover{background:#fae8df}
    .book-meta .admin-remove-book{margin-left:4px}
  `;
  document.head.appendChild(style);
}

function apply(root=document){
  hideExcluded(root);
  addAdminButtons(root);
}

async function loadState(){
  const [{data:hidden},{data:{session}}]=await Promise.all([
    supabase.from('blurb_hidden_books').select('source_id'),
    supabase.auth.getSession()
  ]);
  hiddenIds=new Set((hidden||[]).map(row=>String(row.source_id)));
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
