function markNineSixteen(img){
  if(!(img instanceof HTMLImageElement)||!img.classList.contains('feed-media'))return;
  const apply=()=>{
    if(!img.naturalWidth||!img.naturalHeight)return;
    const ratio=img.naturalWidth/img.naturalHeight;
    if(Math.abs(ratio-(9/16))<0.025){
      img.classList.add('review-card-media');
      img.closest('.feed-card')?.classList.add('review-card-post');
    }
  };
  if(img.complete)apply();
  else img.addEventListener('load',apply,{once:true});
}

function scan(root=document){
  if(root instanceof HTMLImageElement)markNineSixteen(root);
  root.querySelectorAll?.('img.feed-media').forEach(markNineSixteen);
}

function start(){
  scan();
  const feed=document.querySelector('#feed');
  if(feed){
    new MutationObserver(mutations=>{
      for(const mutation of mutations){for(const node of mutation.addedNodes){if(node instanceof HTMLElement)scan(node);}}
    }).observe(feed,{childList:true,subtree:true});
  }
}

document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
