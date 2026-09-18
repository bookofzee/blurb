import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';

const CATALOGUE_URL='https://book-of-zee.onrender.com/api/blurb/catalogue';
const supabase=createClient('https://ndinulaqwixbmgjhrhdo.supabase.co','sb_publishable__zMSwgf2znc_n8927aheRw_PiWY5BL1');
const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
const escapeHtml=(value='')=>String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let books=[];
let bySource=new Map();
let byKey=new Map();
let ready=false;
let trendingBooks=[];
let popularityScores=new Map();

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

function withCovers(list){
  return list.filter(book=>book?.cover_url);
}

function dailySpotlight(){
  const pool=withCovers(books);
  if(!pool.length)return books.slice(0,6);
  const day=Math.floor(Date.now()/86400000);
  const picks=[];
  const used=new Set();
  for(let i=0;i<6&&used.size<pool.length;i++){
    let index=Math.abs((day*97+i*331+17)%pool.length);
    while(used.has(index))index=(index+1)%pool.length;
    used.add(index);
    picks.push(pool[index]);
  }
  return picks;
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
  const {data:existing}=await supabase.from('blurb_library')
    .select('is_favourite')
    .eq('user_id',session.user.id)
    .eq('book_id',local.id)
    .maybeSingle();
  const {error}=await supabase.from('blurb_library').upsert({
    user_id:session.user.id,
    book_id:local.id,
    reading_status:'tbr',
    is_favourite:existing?.is_favourite||false,
    updated_at:new Date().toISOString()
  },{onConflict:'user_id,book_id'});
  toast(error?'Couldn’t update your library':'Added to your TBR');
}

function bindTbrActions(root){
  root?.querySelectorAll('[data-live-tbr]').forEach(el=>el.addEventListener('click',e=>{
    e.preventDefault();
    e.stopPropagation();
    addLiveBookToTbr(bySource.get(el.dataset.liveTbr));
  }));
}

function compactBookCard(book,variant='standard'){
  return `<article class="discover-book ${variant}">
    <div class="discover-cover" style="${coverStyle(book)}">${book.cover_url?'':`<span>${escapeHtml(book.title)}</span>`}</div>
    <div class="discover-book-copy">
      <strong>${escapeHtml(book.title)}</strong>
      <small>${escapeHtml(book.author)}</small>
      <button type="button" class="discover-tbr" data-live-tbr="${escapeHtml(book.id)}">＋ TBR</button>
    </div>
  </article>`;
}

function renderSearchResults(query){
  const grid=document.querySelector('#bookGrid');
  if(!grid)return;
  const matches=books.filter(b=>norm(b.title).includes(query)||norm(b.author).includes(query)).slice(0,20);
  const heading=document.querySelector('#bookGrid')?.previousElementSibling?.querySelector('h2');
  const count=document.querySelector('#bookCount');
  if(heading)heading.textContent='Search results';
  if(count)count.textContent=`${matches.length}${matches.length===20?'+' : ''} found`;
  grid.className='book-grid';
  grid.innerHTML=matches.map(book=>`
    <button class="book-card" data-live-book="${escapeHtml(book.id)}">
      <div class="book-cover" style="${coverStyle(book)}">${book.cover_url?'':`<span>${escapeHtml(book.title)}</span>`}</div>
      <div class="book-meta">
        <strong>${escapeHtml(book.title)}</strong>
        <small>${escapeHtml(book.author)}</small>
        <div class="book-actions-inline"><span class="tiny-button" data-live-tbr="${escapeHtml(book.id)}">＋ TBR</span></div>
      </div>
    </button>`).join('')||'<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">⌕</div><h3>No books found</h3><p>Try another title or author.</p></div>';
  bindTbrActions(grid);
}

function renderDiscoverHome(){
  const grid=document.querySelector('#bookGrid');
  if(!grid)return;
  const heading=grid.previousElementSibling?.querySelector('h2');
  const count=document.querySelector('#bookCount');
  if(heading)heading.textContent='Books in the Spotlight';
  if(count)count.textContent='';

  const spotlight=dailySpotlight();
  let trending=trendingBooks.filter(book=>book&&book.cover_url).slice(0,8);
  if(trending.length<6){
    const used=new Set([...spotlight,...trending].map(b=>b.id));
    for(const book of withCovers(books)){
      if(trending.length>=8)break;
      if(!used.has(book.id)){trending.push(book);used.add(book.id);}
    }
  }

  grid.className='discover-home';
  grid.innerHTML=`
    <div class="spotlight-rail" aria-label="Books in the Spotlight">
      ${spotlight.map(book=>compactBookCard(book,'spotlight')).join('')}
    </div>
    <div class="discover-subsection">
      <div class="discover-subtitle"><h2>Trending on Blurb</h2><span>Popular now</span></div>
      <div class="trending-rail" aria-label="Trending on Blurb">
        ${trending.map(book=>compactBookCard(book,'trending')).join('')}
      </div>
    </div>`;
  bindTbrActions(grid);
}

function renderDiscover(){
  if(!ready)return;
  const q=norm(document.querySelector('#discoverSearch')?.value||'');
  if(q)renderSearchResults(q);
  else renderDiscoverHome();
}

async function loadTrendingBooks(){
  try{
    const {data,error}=await supabase.from('blurb_posts')
      .select('book_id,blurb_books(title,author)')
      .eq('status','published')
      .limit(200);
    if(error||!data?.length)return;
    const scores=new Map();
    for(const post of data){
      const title=post.blurb_books?.title||'';
      const author=post.blurb_books?.author||'';
      const match=findBook('',title,author);
      if(match)scores.set(match.id,(scores.get(match.id)||0)+1);
    }
    popularityScores=scores;
    trendingBooks=[...scores.entries()]
      .sort((a,b)=>b[1]-a[1])
      .map(([id])=>bySource.get(String(id)))
      .filter(Boolean);
    if(!norm(document.querySelector('#discoverSearch')?.value||''))renderDiscoverHome();
    if(!document.querySelector('#bookSheet')?.hidden)renderPicker();
  }catch(err){
    console.warn('Could not load Blurb trending books',err);
  }
}

function closeBookSheet(){
  const sheet=document.querySelector('#bookSheet');
  const backdrop=document.querySelector('#sheetBackdrop');
  if(sheet)sheet.hidden=true;
  if(backdrop)backdrop.hidden=true;
}

async function uploadNewBookCover(file,userId){
  if(!file)return null;
  if(file.size>10*1024*1024)throw new Error('Cover image must be under 10 MB');
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
  const path=`${userId}/book-covers/${crypto.randomUUID()}.${ext}`;
  const {error}=await supabase.storage.from('blurb-media').upload(path,file,{contentType:file.type||'image/jpeg',upsert:false});
  if(error)throw error;
  return supabase.storage.from('blurb-media').getPublicUrl(path).data.publicUrl;
}

function resetAddBookForm(){
  const form=document.querySelector('#addBookForm');
  const preview=document.querySelector('#newBookCoverPreview');
  const status=document.querySelector('#addBookStatus');
  form?.reset();
  if(preview)preview.textContent='＋';
  if(status){status.textContent='';status.className='form-status';}
}

function bindAddBookUI(){
  const toggle=document.querySelector('#addBookToggle');
  const form=document.querySelector('#addBookForm');
  const cancel=document.querySelector('#cancelAddBook');
  const cover=document.querySelector('#newBookCover');
  const preview=document.querySelector('#newBookCoverPreview');
  if(!toggle||!form||form.dataset.bound==='1')return;
  form.dataset.bound='1';

  const search=document.querySelector('#bookSheetSearch');
  const list=document.querySelector('#bookSheetList');
  const heading=document.querySelector('#bookSheet h2');

  const showAddBook=()=>{
    form.hidden=false;
    if(search)search.hidden=true;
    if(list)list.hidden=true;
    if(heading)heading.textContent='Add a book';
    toggle.textContent='← Back to book list';
    setTimeout(()=>document.querySelector('#newBookTitle')?.focus(),60);
  };

  const showBookList=()=>{
    form.hidden=true;
    if(search)search.hidden=false;
    if(list)list.hidden=false;
    if(heading)heading.textContent='Choose a book';
    toggle.textContent='＋ Book not listed? Add it';
    resetAddBookForm();
  };

  toggle.addEventListener('click',()=>form.hidden?showAddBook():showBookList());
  cancel?.addEventListener('click',showBookList);

  cover?.addEventListener('change',()=>{
    const file=cover.files?.[0];
    if(!preview)return;
    if(!file){preview.textContent='＋';return;}
    const url=URL.createObjectURL(file);
    preview.innerHTML='<img src="'+url+'" alt="" />';
  });

  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const status=document.querySelector('#addBookStatus');
    const button=document.querySelector('#saveNewBook');
    const title=document.querySelector('#newBookTitle')?.value?.trim()||'';
    const author=document.querySelector('#newBookAuthor')?.value?.trim()||'';
    const file=cover?.files?.[0]||null;
    if(!title||!author)return;
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.user){
      if(status){status.textContent='Sign in before adding a new book.';status.className='form-status error';}
      return;
    }
    button.disabled=true;
    if(status){status.textContent='Adding book…';status.className='form-status';}
    try{
      const coverUrl=await uploadNewBookCover(file,session.user.id);
      const sourceId='user-'+crypto.randomUUID();
      const {data,error}=await supabase.from('blurb_books').insert({
        source:'user_added',
        source_id:sourceId,
        title,
        author,
        cover_url:coverUrl,
        genres:[]
      }).select('id,title,author,cover_url').single();
      if(error)throw error;

      const hidden=document.querySelector('#selectedBookId');
      const label=document.querySelector('#selectedBookLabel');
      if(hidden)hidden.value=data.id;
      if(label)label.textContent=data.title;

      resetAddBookForm();
      form.hidden=true;
      if(search)search.hidden=false;
      if(list)list.hidden=false;
      if(heading)heading.textContent='Choose a book';
      toggle.textContent='＋ Book not listed? Add it';
      closeBookSheet();
      toast('Book added');
    }catch(err){
      console.warn('Could not add custom book',err);
      if(status){status.textContent=err?.message||'Couldn’t add that book.';status.className='form-status error';}
    }finally{
      button.disabled=false;
    }
  });
}

function renderPicker(){
  bindAddBookUI();
  if(!ready)return;
  const list=document.querySelector('#bookSheetList');
  const search=document.querySelector('#bookSheetSearch');
  if(!list||!search)return;
  const q=norm(search.value);
  const matches=books
    .map((book,index)=>({book,index,score:popularityScores.get(book.id)||0}))
    .filter(x=>!q||norm(x.book.title).includes(q)||norm(x.book.author).includes(q))
    .sort((a,b)=>(b.score-a.score)||(a.index-b.index))
    .slice(0,20)
    .map(x=>x.book);
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

function installDiscoverStyles(){
  if(document.querySelector('#discover-redesign-styles'))return;
  const style=document.createElement('style');
  style.id='discover-redesign-styles';
  style.textContent=`
    .discover-home{display:block!important;width:100%!important;min-width:0!important}
    .spotlight-rail,.trending-rail{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(138px,42%);gap:13px;overflow-x:auto;overscroll-behavior-inline:contain;scroll-snap-type:x proximity;padding:2px 1px 10px;scrollbar-width:none}
    .spotlight-rail::-webkit-scrollbar,.trending-rail::-webkit-scrollbar{display:none}
    .discover-book{scroll-snap-align:start;min-width:0}
    .discover-cover{width:100%;aspect-ratio:2/3;border-radius:10px;background:linear-gradient(145deg,#70432d,#2f211b);background-size:cover;background-position:center;box-shadow:0 12px 24px rgba(80,46,27,.18);overflow:hidden;display:grid;place-items:center;padding:12px;color:#fff8ed;text-align:center;font-family:Georgia,serif}
    .discover-book-copy{padding:8px 2px 0;min-width:0}
    .discover-book-copy strong,.discover-book-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .discover-book-copy strong{font-size:12px}
    .discover-book-copy small{font-size:10px;color:var(--muted);margin-top:3px}
    .discover-tbr{margin-top:7px;border:1px solid var(--line);background:var(--panel);border-radius:999px;padding:5px 9px;font-size:9px;color:#6f4d3d}
    .discover-subsection{margin-top:25px}
    .discover-subtitle{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px}
    .discover-subtitle h2{margin:0;font-family:Georgia,serif;font-size:20px;font-weight:500}
    .discover-subtitle span{font-size:11px;color:var(--muted)}
    .trending-rail{grid-auto-columns:minmax(116px,34%)}
    .trending-rail .discover-cover{border-radius:8px}
    @media(max-width:380px){.spotlight-rail{grid-auto-columns:minmax(128px,46%)}.trending-rail{grid-auto-columns:minmax(108px,38%)}}
  `;
  document.head.appendChild(style);
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
    loadTrendingBooks();
  }catch(err){console.warn('Live Book of Zee catalogue unavailable',err);}
}

function start(){
  installDiscoverStyles();
  bindAddBookUI();
  document.querySelector('#discoverSearch')?.addEventListener('input',()=>queueMicrotask(renderDiscover));
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
