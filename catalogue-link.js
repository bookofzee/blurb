import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';

const CATALOGUE_URL='https://book-of-zee.onrender.com/api/blurb/catalogue';
const supabase=createClient('https://ndinulaqwixbmgjhrhdo.supabase.co','sb_publishable__zMSwgf2znc_n8927aheRw_PiWY5BL1');
const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
const escapeHtml=(value='')=>String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let books=[];
let bySource=new Map();
let byKey=new Map();
let ready=false;
let discoverLimit=10;
let discoverQuery='';
let scrollTick=false;

function toast(message){
  const el=document.querySelector('#toast');
  if(!el)return;
  el.textContent=message;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t=setTimeout(()=>el.classList.remove('show'),1900);
}

function coverStyle(book){
  const url=book?.cover_url;
  return url?`background-image:url("${String(url).replace(/"/g,'%22')}");background-size:cover;background-position:center;background-repeat:no-repeat;background-color:#2f211b;`:'';
}

function findBook(sourceId,title,author){
  return bySource.get(String(sourceId||''))||byKey.get(`${norm(title)}|${norm(author)}`)||null;
}

async function ensureLocalBook(book){
  if(!book)return null;
  const sourceId=String(book.id||book.source_id||'');
  if(!sourceId)return null;

  const {data:existing}=await supabase.from('blurb_books')
    .select('id,source,source_id,title,author,cover_url')
    .eq('source','book_of_zee_prod')
    .eq('source_id',sourceId)
    .maybeSingle();
  if(existing)return existing;

  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.user){toast('Sign in to add this book');return null;}

  const {data,error}=await supabase.from('blurb_books').insert({
    source:'book_of_zee_prod',
    source_id:sourceId,
    title:book.title,
    author:book.author,
    cover_url:book.cover_url||null,
    genres:[]
  }).select('id,source,source_id,title,author,cover_url').single();

  if(error){
    const retry=await supabase.from('blurb_books')
      .select('id,source,source_id,title,author,cover_url')
      .eq('source','book_of_zee_prod')
      .eq('source_id',sourceId)
      .maybeSingle();
    if(retry.data)return retry.data;
    console.warn('Could not create Blurb book link',error);
    toast('Couldn’t link that book yet');
    return null;
  }
  return data;
}

async function addLiveBookToTbr(book){
  const local=await ensureLocalBook(book);
  if(!local)return;
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.user)return;
  const {error}=await supabase.from('blurb_library').upsert({
    user_id:session.user.id,
    book_id:local.id,
    reading_status:'tbr',
    is_favourite:false,
    updated_at:new Date().toISOString()
  },{onConflict:'user_id,book_id'});
  toast(error?'Couldn’t update your library':'Added to your TBR');
}

function getDiscoverMatches(){
  const q=norm(document.querySelector('#discoverSearch')?.value||'');
  return {q,matches:books.filter(b=>!q||norm(b.title).includes(q)||norm(b.author).includes(q))};
}

function renderDiscover(){
  if(!ready)return;
  const grid=document.querySelector('#bookGrid');
  if(!grid)return;
  const {q,matches}=getDiscoverMatches();
  if(q!==discoverQuery){
    discoverQuery=q;
    discoverLimit=10;
  }
  const visible=matches.slice(0,discoverLimit);
  const count=document.querySelector('#bookCount');
  if(count)count.textContent=`${matches.length} ${matches.length===1?'book':'books'}`;
  grid.innerHTML=visible.map(book=>`
    <button class="book-card" data-live-book="${escapeHtml(book.id)}">
      <div class="book-cover" style="${coverStyle(book)}">${book.cover_url?'':`<span>${escapeHtml(book.title)}</span>`}</div>
      <div class="book-meta">
        <strong>${escapeHtml(book.title)}</strong>
        <small>${escapeHtml(book.author)}</small>
        <div class="book-actions-inline"><span class="tiny-button" data-live-tbr="${escapeHtml(book.id)}">＋ TBR</span></div>
      </div>
    </button>`).join('')||'<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">⌕</div><h3>No books found</h3><p>Try another title or author.</p></div>';

  grid.querySelectorAll('[data-live-tbr]').forEach(el=>el.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();
    addLiveBookToTbr(bySource.get(el.dataset.liveTbr));
  }));
}

function maybeLoadMoreDiscover(){
  if(!ready||scrollTick)return;
  scrollTick=true;
  requestAnimationFrame(()=>{
    scrollTick=false;
    const scroller=document.querySelector('#discoverView .page-scroll');
    if(!scroller)return;
    const nearBottom=scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<450;
    if(!nearBottom)return;
    const {matches}=getDiscoverMatches();
    if(discoverLimit>=matches.length)return;
    discoverLimit=Math.min(discoverLimit+10,matches.length);
    renderDiscover();
  });
}

function closeBookSheet(){
  const sheet=document.querySelector('#bookSheet');
  const backdrop=document.querySelector('#sheetBackdrop');
  if(sheet)sheet.hidden=true;
  if(backdrop)backdrop.hidden=true;
}

function renderPicker(){
  if(!ready)return;
  const list=document.querySelector('#bookSheetList');
  const search=document.querySelector('#bookSheetSearch');
  if(!list||!search)return;
  const q=norm(search.value);
  const matches=books.filter(b=>!q||norm(b.title).includes(q)||norm(b.author).includes(q)).slice(0,20);
  list.innerHTML=matches.map(book=>`
    <button class="sheet-book" data-live-pick="${escapeHtml(book.id)}">
      <i class="mini-cover" style="${coverStyle(book)}"></i>
      <span><strong>${escapeHtml(book.title)}</strong><small>${escapeHtml(book.author)}</small></span>
    </button>`).join('');

  list.querySelectorAll('[data-live-pick]').forEach(el=>el.addEventListener('click',async e=>{
    e.preventDefault();
    const book=bySource.get(el.dataset.livePick);
    const local=await ensureLocalBook(book);
    if(!local)return;
    const hidden=document.querySelector('#selectedBookId');
    const label=document.querySelector('#selectedBookLabel');
    if(hidden)hidden.value=local.id;
    if(label)label.textContent=`${book.title} — ${book.author}`;
    closeBookSheet();
  }));
}

function paintExistingCovers(root=document){
  if(!ready)return;
  root.querySelectorAll?.('.feed-card').forEach(card=>{
    const chip=card.querySelector('.book-chip');
    const title=chip?.querySelector('strong')?.textContent?.trim()||card.querySelector('.spoiler-title')?.textContent?.trim()||'';
    const author=chip?.querySelector('small')?.textContent?.trim()||card.querySelector('.spoiler-author')?.textContent?.trim()||'';
    const book=findBook('',title,author);
    if(!book?.cover_url)return;
    for(const el of [card.querySelector('.cover-art'),card.querySelector('.spoiler-book-cover'),chip?.querySelector('.mini-cover')]){
      if(!(el instanceof HTMLElement))continue;
      el.style.backgroundImage=`url("${book.cover_url.replace(/"/g,'%22')}")`;
      el.style.backgroundSize='cover';
      el.style.backgroundPosition='center';
      el.style.backgroundRepeat='no-repeat';
      [...el.children].forEach(child=>{child.style.opacity='0';child.style.pointerEvents='none';});
    }
  });
  root.querySelectorAll?.('.library-row').forEach(row=>{
    const title=row.querySelector('.library-copy strong')?.textContent?.trim()||'';
    const author=row.querySelector('.library-copy span')?.textContent?.trim()||'';
    const book=findBook('',title,author);
    const el=row.querySelector('.mini-cover');
    if(book?.cover_url&&el instanceof HTMLElement){
      el.style.backgroundImage=`url("${book.cover_url.replace(/"/g,'%22')}")`;
      el.style.backgroundSize='cover';el.style.backgroundPosition='center';el.style.backgroundRepeat='no-repeat';
    }
  });
}

async function loadCatalogue(){
  try{
    const response=await fetch(CATALOGUE_URL,{headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`Catalogue ${response.status}`);
    const payload=await response.json();
    books=(payload.books||[]).map(b=>({id:String(b.id),title:String(b.title||'Untitled'),author:String(b.author||''),cover_url:b.cover_url||null}));
    bySource=new Map(books.map(b=>[b.id,b]));
    byKey=new Map(books.map(b=>[`${norm(b.title)}|${norm(b.author)}`,b]));
    ready=true;
    renderDiscover();
    paintExistingCovers();
  }catch(err){console.warn('Live Book of Zee catalogue unavailable',err);}
}

function start(){
  document.querySelector('#discoverSearch')?.addEventListener('input',()=>{
    discoverLimit=10;
    queueMicrotask(renderDiscover);
  });
  document.querySelector('#discoverView .page-scroll')?.addEventListener('scroll',maybeLoadMoreDiscover,{passive:true});
  document.querySelector('#bookSheetSearch')?.addEventListener('input',()=>queueMicrotask(renderPicker));
  document.querySelector('#bookPickerButton')?.addEventListener('click',()=>setTimeout(renderPicker,0));
  document.querySelector('[data-view="discover"]')?.addEventListener('click',()=>setTimeout(renderDiscover,0));

  new MutationObserver(mutations=>{
    if(!ready)return;
    for(const mutation of mutations){
      for(const node of mutation.addedNodes){
        if(node instanceof HTMLElement)paintExistingCovers(node.parentElement||node);
      }
    }
  }).observe(document.body,{childList:true,subtree:true});

  loadCatalogue();
}

document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
