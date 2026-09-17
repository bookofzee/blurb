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
    .share-pop-wrap{position:relative;display:flex;flex-direction:column;align-items:center;min-width:50px;z-index:12}
    .share-pop-main{position:relative;z-index:13;border:0;background:transparent;color:#fff;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:50px}
    .share-pop-main .action-icon{width:40px!important;height:38px!important;display:grid!important;place-items:center!important;background:transparent!important;box-shadow:none!important;text-shadow:none!important;filter:none!important}
    .share-pop-main .action-icon svg{width:29px;height:29px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
    .share-pop-main>span:last-child{font-size:10px;font-weight:900;color:#fff;text-shadow:none!important}
    .share-pop-menu{position:absolute;right:52px;top:-4px;display:flex;align-items:flex-start;gap:12px;z-index:14;pointer-events:none}
    .share-pop-option{width:48px;height:48px;border-radius:50%;border:1px solid rgba(255,255,255,.42);background:#C96832;color:#fff;display:grid;place-items:center;position:relative;opacity:0;transform:translateX(18px) scale(.62);transition:opacity .16s ease,transform .2s cubic-bezier(.2,.85,.32,1.22);pointer-events:none;box-shadow:none}
    .share-pop-option svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .share-pop-option>span{position:absolute;top:53px;left:50%;transform:translateX(-50%);font-size:8px;font-weight:800;white-space:nowrap;color:#fff}
    .share-pop-wrap.open .share-pop-option{opacity:1;transform:translateX(0) scale(1);pointer-events:auto}
    .share-pop-wrap.open .share-pop-option:nth-child(2){transition-delay:.035s}
    .share-pop-wrap.open .share-pop-option:nth-child(3){transition-delay:.07s}
  `;
  document.head.appendChild(style);
}

function shareDetails(card){
  const title=card.querySelector('.book-chip strong')?.textContent?.trim()||'this book';
  const id=card.dataset.post||'';
  const url=`${location.origin}${location.pathname}${id?`#blurb-${encodeURIComponent(id)}`:''}`;
  return {title,url,text:`Check out this Blurb about ${title}`};
}

function closeShareMenus(except=null){
  document.querySelectorAll('.share-pop-wrap.open').forEach(wrap=>{
    if(wrap===except)return;
    wrap.classList.remove('open');
    wrap.querySelector('.share-pop-main')?.setAttribute('aria-expanded','false');
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
    e.preventDefault();e.stopPropagation();
    const opening=!wrap.classList.contains('open');
    closeShareMenus(wrap);
    wrap.classList.toggle('open',opening);
    main.setAttribute('aria-expanded',String(opening));
  });
  menu.querySelectorAll('[data-share-pop]').forEach(btn=>btn.addEventListener('click',async e=>{
    e.preventDefault();e.stopPropagation();
    await act(btn.dataset.sharePop,card);
    wrap.classList.remove('open');
    main.setAttribute('aria-expanded','false');
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
  document.addEventListener('click',e=>{if(!e.target.closest('.share-pop-wrap'))closeShareMenus();});
}

document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
