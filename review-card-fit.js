function markReviewCard(img){
  if(!(img instanceof HTMLImageElement)||!img.classList.contains('feed-media'))return;
  const apply=()=>{
    if(!img.naturalWidth||!img.naturalHeight)return;
    const ratio=img.naturalWidth/img.naturalHeight;
    const feed=img.closest('#feed')||document.querySelector('#feed');
    const app=document.querySelector('.app-shell');
    const nav=document.querySelector('.bottom-nav');
    const feedWidth=feed?.clientWidth||app?.clientWidth||0;
    const appHeight=app?.clientHeight||window.innerHeight;
    const navHeight=nav?.getBoundingClientRect().height||72;
    const feedHeight=(feed?.clientHeight||0)||(appHeight-navHeight);
    const feedRatio=feedWidth&&feedHeight?feedWidth/feedHeight:0;
    const isLegacyNineSixteen=Math.abs(ratio-(9/16))<0.025;
    const matchesFeed=feedRatio&&Math.abs(ratio-feedRatio)<0.025;
    if(isLegacyNineSixteen||matchesFeed){
      img.classList.add('review-card-media');
      img.closest('.feed-card')?.classList.add('review-card-post');
    }
  };
  if(img.complete)apply();
  else img.addEventListener('load',apply,{once:true});
}

function scan(root=document){
  if(root instanceof HTMLImageElement)markReviewCard(root);
  root.querySelectorAll?.('img.feed-media').forEach(markReviewCard);
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
