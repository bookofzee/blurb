import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';

const supabase=createClient('https://ndinulaqwixbmgjhrhdo.supabase.co','sb_publishable__zMSwgf2znc_n8927aheRw_PiWY5BL1');
const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
const keyFor=(title,author)=>`${norm(title)}|${norm(author)}`;
let byId=new Map();
let byKey=new Map();
let ready=false;

function coverFor({id,title,author}={}){
  if(id&&byId.has(id))return byId.get(id)?.cover_url||null;
  const row=byKey.get(keyFor(title,author));
  return row?.cover_url||null;
}

function paint(el,url){
  if(!(el instanceof HTMLElement)||!url)return;
  if(el.dataset.catalogueCover===url)return;
  el.dataset.catalogueCover=url;
  el.style.backgroundImage=`url("${url.replace(/"/g,'%22')}")`;
  el.style.backgroundSize='cover';
  el.style.backgroundPosition='center';
  el.style.backgroundRepeat='no-repeat';
  el.style.backgroundColor='#2f211b';
  [...el.children].forEach(child=>{child.style.opacity='0';child.style.pointerEvents='none';});
}

function detailsFromCard(card){
  const chip=card.querySelector('.book-chip');
  const id=chip?.dataset?.book||'';
  const title=chip?.querySelector('strong')?.textContent?.trim()||card.querySelector('.spoiler-title')?.textContent?.trim()||'';
  const author=chip?.querySelector('small')?.textContent?.trim()||card.querySelector('.spoiler-author')?.textContent?.trim()||'';
  return {id,title,author};
}

function apply(root=document){
  if(!ready)return;

  root.querySelectorAll?.('[data-book-card]').forEach(card=>{
    const id=card.dataset.bookCard;
    const title=card.querySelector('.book-meta strong')?.textContent?.trim()||'';
    const author=card.querySelector('.book-meta small')?.textContent?.trim()||'';
    paint(card.querySelector('.book-cover'),coverFor({id,title,author}));
  });

  root.querySelectorAll?.('[data-pick-book]').forEach(row=>{
    const id=row.dataset.pickBook;
    const title=row.querySelector('strong')?.textContent?.trim()||'';
    const author=row.querySelector('small')?.textContent?.trim()||'';
    paint(row.querySelector('.mini-cover'),coverFor({id,title,author}));
  });

  root.querySelectorAll?.('.book-chip').forEach(chip=>{
    const id=chip.dataset.book||'';
    const title=chip.querySelector('strong')?.textContent?.trim()||'';
    const author=chip.querySelector('small')?.textContent?.trim()||'';
    paint(chip.querySelector('.mini-cover'),coverFor({id,title,author}));
  });

  root.querySelectorAll?.('.library-row').forEach(row=>{
    const id=row.querySelector('[data-library-book]')?.dataset?.libraryBook||'';
    const title=row.querySelector('.library-copy strong')?.textContent?.trim()||'';
    const author=row.querySelector('.library-copy span')?.textContent?.trim()||'';
    paint(row.querySelector('.mini-cover'),coverFor({id,title,author}));
  });

  root.querySelectorAll?.('.feed-card').forEach(card=>{
    const details=detailsFromCard(card);
    const url=coverFor(details);
    paint(card.querySelector('.cover-art'),url);
    paint(card.querySelector('.spoiler-book-cover'),url);
  });

  root.querySelectorAll?.('.spoiler-panel').forEach(panel=>{
    const title=panel.querySelector('.spoiler-title')?.textContent?.trim()||'';
    const author=panel.querySelector('.spoiler-author')?.textContent?.trim()||'';
    paint(panel.querySelector('.spoiler-book-cover'),coverFor({title,author}));
  });
}

async function loadCatalogue(){
  try{
    const {data,error}=await supabase.from('blurb_books').select('id,title,author,cover_url').order('title').limit(1000);
    if(error)throw error;
    const rows=data||[];
    byId=new Map(rows.map(row=>[String(row.id),row]));
    byKey=new Map(rows.map(row=>[keyFor(row.title,row.author),row]));
    ready=true;
    apply();
  }catch(err){console.warn('Blurb catalogue covers unavailable',err);}
}

const start=()=>{
  loadCatalogue();
  new MutationObserver(mutations=>{
    if(!ready)return;
    for(const mutation of mutations){
      for(const node of mutation.addedNodes){
        if(node instanceof HTMLElement){
          apply(node);
          if(node.parentElement)apply(node.parentElement);
        }
      }
    }
  }).observe(document.body,{childList:true,subtree:true});
};

document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
