const SHARE_STYLE_ID='blurb-share-menu-style';
const smsIcon=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v10H9l-5 3v-13Z"/></svg>`;
const emailIcon=`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4.5 7 7.5 6 7.5-6"/></svg>`;
const linkIcon=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 14.5 14.5 9.5"/><path d="M7.2 16.8 5.4 18.6a3.5 3.5 0 0 1-5-5l3.1-3.1a3.5 3.5 0 0 1 4.9 0" transform="translate(3 0)"/><path d="m16.8 7.2 1.8-1.8a3.5 3.5 0 1 1 5 5l-3.1 3.1a3.5 3.5 0 0 1-4.9 0" transform="translate(-3 0)"/></svg>`;

function toast(message){
  const el=document.querySelector('#toast');
  if(!el)return;
  el.textContent=message;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t=setTimeout(()=>el.classList.remove('show'),1800);
}

function injectStyles(){
  if(document.getElementById(SHARE_STYLE_ID))return;
  const style=document.createElement('style');
  style.id=SHARE_STYLE_ID;
  style.textContent=`
    .feed-card.share-menu-active:after{content:"";position:absolute;inset:0;z-index:6;background:rgba(27,18,14,.58);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);pointer-events:auto;animation:shareShadeIn .16s ease both}
    @keyframes shareShadeIn{from{opacity:0}to{opacity:1}}
    .feed-card.share-menu-active .feed-actions{z-index:7}
    .feed-card.share-menu-active .feed-actions>*{opacity:.24;filter:blur(2px);pointer-events:none}
    .feed-card.share-menu-active .share-pop-wrap{opacity:1!important;filter:none!important;pointer-events:auto!important;z-index:15!important}

    .share-pop-wrap{position:relative;display:flex;flex-direction:column;align-items:center;min-width:50px;z-index:12}
    .share-pop-main{position:relative;z-index:16;border:0!important;background:transparent!important;color:#fff;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:50px;padding:0!important;box-shadow:none!important}
    .share-pop-main .action-icon{width:40px!important;height:38px!important;display:grid!important;place-items:center!important;background:transparent!important;border-radius:0!important;box-shadow:none!important;text-shadow:none!important;filter:none!important}
    .share-pop-main .action-icon svg{width:29px;height:29px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
    .share-pop-main>span:last-child{display:block!important;position:static!important;margin-top:1px!important;font-size:10px!important;font-weight:900!important;color:#fff!important;line-height:1.05!important;text-shadow:none!important;transform:none!important}

    /* Final row sits to the left of Share; each option starts at the Share button and travels left. */
    .share-pop-menu{position:absolute;right:54px;top:-5px;width:176px;height:62px;z-index:17;pointer-events:none}
    .share-pop-option{position:absolute;top:0;width:48px;height:48px;border-radius:50%;border:1px solid rgba(255,255,255,.42);background:#C96832;color:#fff;display:grid;place-items:center;opacity:0;pointer-events:none;box-shadow:none;transition:opacity .16s ease,transform .22s cubic-bezier(.2,.85,.32,1.22)}
    .share-pop-option:nth-child(1){left:0;transform:translateX(144px) scale(.62)}
    .share-pop-option:nth-child(2){left:64px;transform:translateX(96px) scale(.62)}
    .share-pop-option:nth-child(3){left:128px;transform:translateX(48px) scale(.62)}
    .share-pop-option svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .share-pop-option>span{position:absolute;top:53px;left:50%;transform:translateX(-50%);font-size:8px;font-weight:800;white-space:nowrap;color:#fff;line-height:1;text-shadow:none}
    .share-pop-wrap.open .share-pop-option{opacity:1;transform:translateX(0) scale(1);pointer-events:auto}
    .share-pop-wrap.open .share-pop-option:nth-child(2){transition-delay:.035s}
    .share-pop-wrap.open .share-pop-option:nth-child(1){transition-delay:.07s}
  `;
  document.head.appendChild(style);
}

function shareDetails(card){
  const title=card.querySelector('.book-chip strong')?.textContent?.trim()||'this book';
  const id=card.dataset.post||'';
  const url=`${location.origin}${location.pathname}${id?`#blurb-${encodeURIComponent(id)}`:''}`;
  return {title,url,text:`Check out this Blurb about ${title}`};
}

function closeAddMenus(){
  document.querySelectorAll('.add-action-wrap.open').forEach(wrap=>{
    wrap.classList.remove('open');
    wrap.querySelector('.add-main')?.setAttribute('aria-expanded','false');
    wrap.querySelector('.add-status-menu')?.setAttribute('aria-hidden','true');
    wrap.closest('.feed-card')?.classList.remove('add-menu-active');
  });
}

function closeShareWrap(wrap){
  if(!wrap)return;
  wrap.classList.remove('open');
  wrap.closest('.feed-card')?.classList.remove('share-menu-active');
  wrap.querySelector('.share-pop-main')?.setAttribute('aria-expanded','false');
}

function closeShareMenus(except=null){
  document.querySelectorAll('.share-pop-wrap.open').forEach(wrap=>{
    if(wrap!==except)closeShareWrap(wrap);
  });
}

async function act(kind,card){
  const {text,url}=shareDetails(card);
  if(kind==='sms'){
    location.href=`sms:?&body=${encodeURIComponent(`${text} ${url}`)}`;
    return;
  }
  if(kind==='email'){
    location.href=`mailto:?subject=${encodeURIComponent('A Blurb you might like')}&body=${encodeURIComponent(`${text}\n\n${url}`)}`;
    return;
  }
  if(kind==='copy'){
    try{await navigator.clipboard.writeText(url);}catch{
      const area=document.createElement('textarea');
      area.value=url;document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();
    }
    toast('Link copied');
  }
}

function enhanceCard(card){
  if(!(card instanceof HTMLElement)||card.querySelector('.share-pop-wrap'))return;
  const original=card.querySelector('[data-share]');
  if(!original)return;
  const main=original.cloneNode(true);
  main.classList.add('share-pop-main');
  main.setAttribute('aria-expanded','false');
  main.setAttribute('aria-label','Share this Blurb');
  const wrap=document.createElement('div');
  wrap.className='share-pop-wrap';
  const menu=document.createElement('div');
  menu.className='share-pop-menu';
  menu.innerHTML=`
    <button type="button" class="share-pop-option" data-share-pop="sms" aria-label="Share by SMS">${smsIcon}<span>SMS</span></button>
    <button type="button" class="share-pop-option" data-share-pop="email" aria-label="Share by email">${emailIcon}<span>Email</span></button>
    <button type="button" class="share-pop-option" data-share-pop="copy" aria-label="Copy link">${linkIcon}<span>Copy</span></button>`;
  wrap.append(main,menu);
  original.replaceWith(wrap);

  main.addEventListener('click',e=>{
    e.preventDefault();
    e.stopImmediatePropagation();
    const opening=!wrap.classList.contains('open');
    closeAddMenus();
    closeShareMenus(wrap);
    wrap.classList.toggle('open',opening);
    card.classList.toggle('share-menu-active',opening);
    main.setAttribute('aria-expanded',String(opening));
  },true);

  menu.querySelectorAll('[data-share-pop]').forEach(btn=>btn.addEventListener('click',async e=>{
    e.preventDefault();
    e.stopPropagation();
    await act(btn.dataset.sharePop,card);
    closeShareWrap(wrap);
  }));
}

function scan(root=document){
  if(root.matches?.('.feed-card'))enhanceCard(root);
  root.querySelectorAll?.('.feed-card').forEach(enhanceCard);
}

function start(){
  injectStyles();scan();
  const feed=document.querySelector('#feed');
  if(feed)new MutationObserver(mutations=>{
    for(const mutation of mutations)for(const node of mutation.addedNodes)if(node instanceof HTMLElement)scan(node);
  }).observe(feed,{childList:true,subtree:true});
  document.addEventListener('click',e=>{
    if(!e.target.closest('.share-pop-wrap'))closeShareMenus();
  });
}

document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
