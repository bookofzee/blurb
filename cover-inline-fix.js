const CATALOGUE_URL='https://book-of-zee.onrender.com/api/blurb/catalogue';
const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
let byKey=new Map();
let ready=false;

function keyFor(title,author){return `${norm(title)}|${norm(author)}`;}

function paint(el,url){
  if(!(el instanceof HTMLElement)||!url)return;
  el.style.backgroundImage=`url('${String(url).replace(/'/g,'%27')}')`;
  el.style.backgroundSize='cover';
  el.style.backgroundPosition='center';
  el.style.backgroundRepeat='no-repeat';
  el.style.backgroundColor='#2f211b';
}

function apply(root=document){
  if(!ready)return;

  root.querySelectorAll?.('.discover-book').forEach(card=>{
    const title=card.querySelector('.discover-book-copy strong')?.textContent?.trim()||'';
    const author=card.querySelector('.discover-book-copy small')?.textContent?.trim()||'';
    const book=byKey.get(keyFor(title,author));
    if(book?.cover_url)paint(card.querySelector('.discover-cover'),book.cover_url);
  });

  root.querySelectorAll?.('.book-card').forEach(card=>{
    const title=card.querySelector('.book-meta strong')?.textContent?.trim()||'';
    const author=card.querySelector('.book-meta small')?.textContent?.trim()||'';
    const book=byKey.get(keyFor(title,author));
    if(book?.cover_url)paint(card.querySelector('.book-cover'),book.cover_url);
  });

  root.querySelectorAll?.('.sheet-book').forEach(card=>{
    const title=card.querySelector('strong')?.textContent?.trim()||'';
    const author=card.querySelector('small')?.textContent?.trim()||'';
    const book=byKey.get(keyFor(title,author));
    if(book?.cover_url)paint(card.querySelector('.mini-cover'),book.cover_url);
  });
}

async function load(){
  try{
    const response=await fetch(CATALOGUE_URL,{headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`Catalogue ${response.status}`);
    const payload=await response.json();
    byKey=new Map((payload.books||[]).map(book=>[keyFor(book.title,book.author),book]));
    ready=true;
    apply();
  }catch(error){
    console.warn('Cover style fix unavailable',error);
  }
}

function start(){
  const observer=new MutationObserver(mutations=>{
    if(!ready)return;
    for(const mutation of mutations){
      for(const node of mutation.addedNodes){
        if(node instanceof HTMLElement)apply(node.parentElement||node);
      }
    }
  });
  const grid=document.querySelector('#bookGrid');
  const picker=document.querySelector('#bookSheetList');
  if(grid)observer.observe(grid,{childList:true,subtree:true});
  if(picker)observer.observe(picker,{childList:true,subtree:true});
  load();
}

document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
