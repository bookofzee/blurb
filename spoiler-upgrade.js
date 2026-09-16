import './catalogue-covers.js?v=1';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';

const supabase=createClient('https://ndinulaqwixbmgjhrhdo.supabase.co','sb_publishable__zMSwgf2znc_n8927aheRw_PiWY5BL1');
const STORE='blurb-spoiler-safe-books';
const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
const keyFor=(title,author)=>`${norm(title)}|${norm(author)}`;
const safeBooks=new Set(JSON.parse(localStorage.getItem(STORE)||'[]'));

function showToast(message){
  const el=document.querySelector('#toast');
  if(!el)return;
  el.textContent=message;
  el.classList.add('show');
  clearTimeout(showToast.t);
  showToast.t=setTimeout(()=>el.classList.remove('show'),2200);
}

async function markRead(title,author){
  try{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.user){showToast(`We’ll stop hiding spoilers for ${title} on this device.`);return;}
    const {data:books}=await supabase.from('blurb_books').select('id,title,author').ilike('title',title).limit(10);
    const book=(books||[]).find(b=>norm(b.title)===norm(title)&&norm(b.author)===norm(author))||(books||[])[0];
    if(!book){showToast('Saved your spoiler preference.');return;}
    const {data:existing}=await supabase.from('blurb_library').select('is_favourite').eq('user_id',session.user.id).eq('book_id',book.id).maybeSingle();
    const {error}=await supabase.from('blurb_library').upsert({user_id:session.user.id,book_id:book.id,reading_status:'read',is_favourite:existing?.is_favourite||false,updated_at:new Date().toISOString()},{onConflict:'user_id,book_id'});
    showToast(error?`We’ll stop hiding spoilers for ${title}.`:`Marked ${title} as read.`);
  }catch{showToast(`We’ll stop hiding spoilers for ${title}.`);}
}

function enhance(cover){
  if(!(cover instanceof HTMLElement)||cover.dataset.spoilerUpgrade==='1')return;
  const panel=cover.querySelector('.spoiler-panel');
  if(!panel)return;
  const title=panel.querySelector('.spoiler-title')?.textContent?.trim()||'This book';
  const author=panel.querySelector('.spoiler-author')?.textContent?.trim()||'';
  const key=keyFor(title,author);
  if(safeBooks.has(key)){cover.remove();return;}
  cover.dataset.spoilerUpgrade='1';

  const chip=panel.querySelector('.spoiler-chip');
  if(chip)chip.innerHTML='<i>✦</i><span>Spoiler</span>';

  const bookCover=panel.querySelector('.spoiler-book-cover');
  if(bookCover&&!bookCover.parentElement?.classList.contains('spoiler-cover-wrap')){
    const wrap=document.createElement('div');
    wrap.className='spoiler-cover-wrap';
    bookCover.before(wrap);
    wrap.appendChild(bookCover);
    const ornament=document.createElement('div');
    ornament.className='spoiler-ornament';
    ornament.setAttribute('aria-hidden','true');
    ornament.innerHTML='<span></span>';
    wrap.after(ornament);
  }

  const reveal=panel.querySelector('[data-reveal]');
  if(reveal){
    reveal.textContent='Reveal this Blurb';
    let actions=panel.querySelector('.spoiler-actions');
    if(!actions){actions=document.createElement('div');actions.className='spoiler-actions';reveal.before(actions);actions.appendChild(reveal);}
    if(!actions.querySelector('.spoiler-read-button')){
      const read=document.createElement('button');
      read.type='button';
      read.className='spoiler-read-button';
      read.textContent='I’ve read this book';
      read.addEventListener('click',async e=>{
        e.preventDefault();e.stopPropagation();
        safeBooks.add(key);
        localStorage.setItem(STORE,JSON.stringify([...safeBooks]));
        cover.remove();
        await markRead(title,author);
      });
      actions.appendChild(read);
    }
  }
}

function enhanceAll(root=document){root.querySelectorAll?.('.spoiler-cover').forEach(enhance);}

async function syncReadBooks(){
  try{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.user)return;
    const {data}=await supabase.from('blurb_library').select('reading_status,blurb_books(title,author)').eq('user_id',session.user.id).eq('reading_status','read');
    (data||[]).forEach(row=>{if(row.blurb_books)safeBooks.add(keyFor(row.blurb_books.title,row.blurb_books.author));});
    localStorage.setItem(STORE,JSON.stringify([...safeBooks]));
    enhanceAll();
  }catch{}
}

const start=()=>{
  enhanceAll();
  new MutationObserver(muts=>muts.forEach(m=>m.addedNodes.forEach(n=>{if(n instanceof HTMLElement){if(n.matches?.('.spoiler-cover'))enhance(n);enhanceAll(n);}}))).observe(document.body,{childList:true,subtree:true});
  syncReadBooks();
};

document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
