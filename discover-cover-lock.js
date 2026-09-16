const CATALOGUE_URL='https://book-of-zee.onrender.com/api/blurb/catalogue';
let coverMap=new Map();
let ready=false;

function applyCovers(root=document){
  if(!ready)return;
  root.querySelectorAll?.('#bookGrid .book-card[data-live-book]').forEach(card=>{
    const id=String(card.dataset.liveBook||'');
    const url=coverMap.get(id);
    const cover=card.querySelector('.book-cover');
    if(!(cover instanceof HTMLElement)||!url)return;

    let img=cover.querySelector('img[data-live-cover]');
    if(!img){
      img=document.createElement('img');
      img.dataset.liveCover='1';
      img.alt='';
      img.loading='lazy';
      img.decoding='async';
      cover.prepend(img);
    }
    if(img.src!==url)img.src=url;
    cover.classList.add('has-live-cover');
  });
}

async function load(){
  try{
    const response=await fetch(CATALOGUE_URL,{headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`Catalogue ${response.status}`);
    const payload=await response.json();
    coverMap=new Map((payload.books||[]).filter(b=>b?.cover_url).map(b=>[String(b.id),String(b.cover_url)]));
    ready=true;
    applyCovers();
  }catch(err){
    console.warn('Discover cover lock unavailable',err);
  }
}

new MutationObserver(mutations=>{
  if(!ready)return;
  for(const mutation of mutations){
    for(const node of mutation.addedNodes){
      if(node instanceof HTMLElement){
        if(node.matches?.('#bookGrid, #bookGrid *'))applyCovers(document);
        else if(node.querySelector?.('#bookGrid'))applyCovers(document);
      }
    }
  }
}).observe(document.body,{childList:true,subtree:true});

document.querySelector('#discoverSearch')?.addEventListener('input',()=>setTimeout(()=>applyCovers(),0));
document.querySelector('[data-view="discover"]')?.addEventListener('click',()=>setTimeout(()=>applyCovers(),0));

load();
