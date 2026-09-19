import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';
import { normalizeEditorState, editorMediaStyle, editorOverlayMarkup, editorFeedClasses, editorLookMarkup } from './editor-state.js?v=2';

const SUPABASE_URL = 'https://ndinulaqwixbmgjhrhdo.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable__zMSwgf2znc_n8927aheRw_PiWY5BL1';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const state = {
  user: null,
  profile: null,
  books: [],
  posts: [],
  followingIds: new Set(),
  library: [],
  feedMode: 'for-you',
  activeView: 'feed',
  selectedBook: null,
  selectedRating: null,
  authMode: 'signin',
  activePostForComments: null,
  libraryTab: 'tbr',
};

const palettes = [
  ['#6f324c','#15101b','#9b5b69'], ['#263d5b','#10131d','#53749a'], ['#69532c','#18140d','#9b7e3d'],
  ['#24463e','#0d1715','#4a786e'], ['#5b2a2a','#160d0d','#8c4e4e'], ['#47345f','#120f1a','#725991'],
  ['#273c53','#0c1118','#55718b'], ['#684639','#17100d','#9c6a55']
];
const tropes = ['Enemies to Lovers','Found Family','Slow Burn','Morally Grey','One Bed','Dragons','Second Chance','Touch Her and Die'];
const demoPosts = [
  {id:'demo-1',username:'paperbackwitch',display_name:'Maya',caption:'I went in for dragons and came out emotionally attached to an entire squad. The pacing is chaos in the best way.',rating:4.5,tags:['dragons','enemies to lovers','fantasy'],likes:2418,comments:184,bookKey:'fourth-wing',spoiler:false},
  {id:'demo-2',username:'chapterandchaos',display_name:'Liv',caption:'This is the book that taught me I apparently enjoy morally questionable fae men and poor decision making.',rating:4,tags:['fae','romance','fantasy'],likes:978,comments:72,bookKey:'acotar',spoiler:false},
  {id:'demo-3',username:'afterdarkreads',display_name:'Nora',caption:'The last reveal changed how I read every chapter before it. I need to discuss this immediately.',rating:4.5,tags:['thriller','plot twist','mystery'],likes:1302,comments:256,bookKey:'silent-patient',spoiler:true},
  {id:'demo-4',username:'annotatedamy',display_name:'Amy',caption:'A quiet, clever sci-fi story until suddenly you would die for a friendship you did not see coming.',rating:5,tags:['sci fi','found family','space'],likes:3201,comments:119,bookKey:'project-hail-mary',spoiler:false}
];

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const escapeHtml = (value='') => String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const initials = (name='B') => name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
const compactNum = n => Intl.NumberFormat('en-GB',{notation:'compact',maximumFractionDigits:1}).format(n||0);
const timeAgo = iso => { const s=Math.max(1,(Date.now()-new Date(iso).getTime())/1000); if(s<60)return 'now'; if(s<3600)return `${Math.floor(s/60)}m`; if(s<86400)return `${Math.floor(s/3600)}h`; return `${Math.floor(s/86400)}d`; };
const paletteFor = key => palettes[Math.abs([...String(key)].reduce((a,c)=>a+c.charCodeAt(0),0))%palettes.length];
function ratingStars(value){ if(!value) return ''; const whole=Math.floor(value); const half=value%1>=.5; return '★'.repeat(whole)+(half?'½':''); }
function toast(message){ const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('show'),1900); }

function spoilerWarningEnabledForBook(book){
  const sourceId=String(book?.source_id||book?.id||'').trim();
  if(!sourceId)return true;
  try{return localStorage.getItem('blurb-spoiler-warning:'+sourceId)!=='0';}
  catch{return true;}
}

function showView(view){
  state.activeView=view;
  $$('.view').forEach(el=>el.classList.toggle('view-active',el.id===`${view}View`));
  $$('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.view===view));
  if(view==='discover') renderDiscover();
  if(view==='library') loadLibrary();
  if(view==='profile') renderProfile();
  if(view==='create' && !state.user) openSheet('authSheet');
}

function openSheet(id){ $('#sheetBackdrop').hidden=false; $$('.sheet').forEach(s=>s.hidden=true); $(`#${id}`).hidden=false; }
function closeSheets(){ $('#sheetBackdrop').hidden=true; $$('.sheet').forEach(s=>s.hidden=true); }
function requireAuth(){ if(state.user) return true; openSheet('authSheet'); return false; }

async function loadSession(){
  const {data:{session}}=await supabase.auth.getSession();
  state.user=session?.user||null;
  if(state.user) await ensureProfile();
  supabase.auth.onAuthStateChange(async (_event,session)=>{
    state.user=session?.user||null;
    state.profile=null;
    if(state.user) await ensureProfile();
    renderProfile();
    if(state.activeView==='library') loadLibrary();
  });
}

async function ensureProfile(){
  if(!state.user) return;
  const {data}=await supabase.from('blurb_profiles').select('*').eq('id',state.user.id).maybeSingle();
  if(data){ state.profile=data; return; }
  const guessed=(state.user.email?.split('@')[0]||'reader').replace(/[^A-Za-z0-9_]/g,'').slice(0,20);
  const {data:created}=await supabase.from('blurb_profiles').insert({id:state.user.id,display_name:guessed||'Reader'}).select().single();
  state.profile=created||null;
}

async function loadBooks(){
  const {data,error}=await supabase.from('blurb_books').select('*').order('title');
  if(!error && data) state.books=data;
  renderDiscover();
  renderBookSheet();
}

async function loadPosts(){
  const {data,error}=await supabase.from('blurb_posts').select('id,user_id,book_id,post_type,media_url,thumbnail_url,media_scale,media_offset_x,media_offset_y,media_fit,media_rotation,editor_state,caption,rating,contains_spoilers,created_at,blurb_books(id,title,author,genres,source_id)').eq('status','published').order('created_at',{ascending:false}).limit(30);
  if(error || !data?.length){ state.posts=[]; renderFeed(); return; }
  const ids=[...new Set(data.map(p=>p.user_id))];
  const postIds=data.map(p=>p.id);
  const [{data:profiles},{data:likes},{data:comments},{data:postTags}]=await Promise.all([
    supabase.from('blurb_profiles').select('id,username,display_name,avatar_url').in('id',ids),
    supabase.from('blurb_likes').select('post_id,user_id').in('post_id',postIds),
    supabase.from('blurb_comments').select('post_id').in('post_id',postIds),
    supabase.from('blurb_post_tags').select('post_id,tag').in('post_id',postIds)
  ]);
  const pMap=Object.fromEntries((profiles||[]).map(p=>[p.id,p]));
  const likesBy={}; (likes||[]).forEach(x=>(likesBy[x.post_id]??=[]).push(x.user_id));
  const commentsBy={}; (comments||[]).forEach(x=>commentsBy[x.post_id]=(commentsBy[x.post_id]||0)+1);
  const tagsBy={}; (postTags||[]).forEach(x=>(tagsBy[x.post_id]??=[]).push(x.tag));
  state.posts=data.map(p=>({...p,profile:pMap[p.user_id]||{},likes:likesBy[p.id]?.length||0,liked:state.user?likesBy[p.id]?.includes(state.user.id):false,comments:commentsBy[p.id]||0,tags:tagsBy[p.id]||[]}));
  renderFeed();
}

async function loadFollowing(){
  if(!state.user){ state.followingIds=new Set(); return; }
  const {data}=await supabase.from('blurb_follows').select('following_id').eq('follower_id',state.user.id);
  state.followingIds=new Set((data||[]).map(x=>x.following_id));
}

function getDemoFeed(){
  return demoPosts.map((p,i)=>{
    const book=state.books.find(b=>b.source_id===p.bookKey)||{id:null,title:['Fourth Wing','A Court of Thorns and Roses','The Silent Patient','Project Hail Mary'][i],author:['Rebecca Yarros','Sarah J. Maas','Alex Michaelides','Andy Weir'][i],genres:[]};
    return {...p,demo:true,book,profile:{username:p.username,display_name:p.display_name},contains_spoilers:p.spoiler};
  });
}

function renderFeed(){
  let items=state.posts.length?state.posts:getDemoFeed();
  if(state.feedMode==='following'){
    if(!state.user){ $('#feed').innerHTML='<div class="feed-empty"><div><h3>See people you follow</h3><p>Sign in to build your Following feed.</p><button class="secondary-button" id="feedSignIn">Sign in</button></div></div>'; $('#feedSignIn')?.addEventListener('click',()=>openSheet('authSheet')); return; }
    items=state.posts.filter(p=>state.followingIds.has(p.user_id));
    if(!items.length){ $('#feed').innerHTML='<div class="feed-empty"><div><h3>Your Following feed is quiet</h3><p>Follow reviewers from the For You feed and they’ll appear here.</p></div></div>'; return; }
  }
  $('#feed').innerHTML=items.map((p,i)=>feedCard(p,i)).join('');
  bindFeedActions();
  observeVideos();
}

function feedCard(post,i){
  const book=post.blurb_books||post.book||{};
  const profile=post.profile||{};
  const [a,b,g]=paletteFor(book.title||post.id);
  const username=profile.username||profile.display_name||'reader';
  const displayName=profile.display_name||username;
  const tags=(post.tags?.length?post.tags:book.genres||[]).slice(0,8);
  const rawEditorState=post.editor_state&&Object.keys(post.editor_state||{}).length
    ?post.editor_state
    :{media:{
      scale:Number(post.media_scale)||1,
      x:Number(post.media_offset_x)||0,
      y:Number(post.media_offset_y)||0,
      fit:post.media_fit==='contain'?'contain':'cover',
      rotation:Number(post.media_rotation)||0
    }};
  const editorState=normalizeEditorState(rawEditorState);
  const mediaStyle=editorMediaStyle(editorState);
  const editorClasses=editorFeedClasses(editorState);
  const editorOverlays=editorOverlayMarkup(editorState,escapeHtml);
  const editorLook=editorLookMarkup(editorState);
  const media=post.media_url ? (post.post_type==='video'?`<video class="feed-media" src="${escapeHtml(post.media_url)}" playsinline muted loop preload="metadata" style="${mediaStyle}"></video>`:`<img class="feed-media" src="${escapeHtml(post.media_url)}" alt="${escapeHtml(book.title||'Book review')}" style="${mediaStyle}" />`) : `<div class="cover-stage"><div class="cover-art" style="--cover-a:${a};--cover-b:${b}"><div class="cover-mark">${escapeHtml(book.title||'A book worth talking about')}</div><div class="cover-author">${escapeHtml(book.author||'BLURB')}</div></div></div>`;
  const spoiler=post.contains_spoilers&&spoilerWarningEnabledForBook(book)?`<div class="spoiler-cover">
    <div class="spoiler-panel">
      <span class="spoiler-chip">Spoiler</span>
      <div class="spoiler-book-cover" style="--cover-a:${a};--cover-b:${b}">
        <span>${escapeHtml(book.title||'Book')}</span>
        <small>${escapeHtml(book.author||'')}</small>
      </div>
      <strong class="spoiler-title">${escapeHtml(book.title||'This book')}</strong>
      <em class="spoiler-author">${escapeHtml(book.author||'')}</em>
      <button data-reveal="${post.id}">Reveal this Blurb</button>
    </div>
  </div>`:'';
  return `<article class="feed-card ${editorClasses}" data-post="${post.id}" style="--card-a:${a};--card-b:${b};--card-glow:${g}">
    ${media}${editorLook}${editorOverlays}${spoiler}
    <div class="feed-copy">
      <div class="creator-row"><div class="avatar">${profile.avatar_url?`<img src="${escapeHtml(profile.avatar_url)}" alt="" />`:initials(displayName)}</div><strong>@${escapeHtml(username)}</strong></div>
      ${post.rating?`<div class="rating-line">${ratingStars(Number(post.rating))} <span>${Number(post.rating).toFixed(1)}</span></div>`:''}
      <p class="caption">${escapeHtml(post.caption)}</p>
      <div class="tags">${tags.map(t=>`<span class="tag ${String(t).startsWith('#')?'hashtag':'trope'}">${escapeHtml(String(t).replace(/^#/,''))}</span>`).join('')}</div>
      <button class="book-chip" data-book="${book.id||''}" style="--cover-a:${a};--cover-b:${b}"><i class="mini-cover"></i><span><strong>${escapeHtml(book.title||'Untitled')}</strong><small>${escapeHtml(book.author||'')}</small></span></button>
    </div>
    <div class="feed-actions">
      <button class="action-button ${post.liked?'active':''}" data-like="${post.id}"><span class="action-icon">♥</span><span>${compactNum(post.likes)}</span></button>
      <button class="action-button" data-comments="${post.id}"><span class="action-icon">◌</span><span>${compactNum(post.comments)}</span></button>
      <button class="action-button" data-tbr="${book.id||''}"><span class="action-icon">＋</span><span>TBR</span></button>
      <button class="action-button" data-share="${post.id}"><span class="action-icon">↗</span><span>Share</span></button>
    </div>
  </article>`;
}

function bindFeedActions(){
  $$('[data-reveal]').forEach(b=>b.addEventListener('click',()=>b.closest('.spoiler-cover').remove()));
  $$('[data-like]').forEach(b=>b.addEventListener('click',()=>toggleLike(b.dataset.like,b)));
  $$('[data-comments]').forEach(b=>b.addEventListener('click',()=>openComments(b.dataset.comments)));
  $$('[data-tbr]').forEach(b=>b.addEventListener('click',()=>addToLibrary(b.dataset.tbr,'tbr')));
  $$('[data-share]').forEach(b=>b.addEventListener('click',()=>sharePost(b.dataset.share)));
  $$('[data-follow]').forEach(b=>b.addEventListener('click',()=>toggleFollow(b.dataset.follow,b)));
  $$('.book-chip').forEach(b=>b.addEventListener('click',()=>{const book=state.books.find(x=>x.id===b.dataset.book); if(book){showView('discover'); $('#discoverSearch').value=book.title; renderDiscover(book.title);}}));
}

function observeVideos(){
  const observer=new IntersectionObserver(entries=>entries.forEach(e=>{const v=e.target.querySelector('video'); if(v){e.isIntersecting&&e.intersectionRatio>.65?v.play().catch(()=>{}):v.pause();}}),{root:$('#feed'),threshold:[.65]});
  $$('.feed-card').forEach(card=>observer.observe(card));
}

async function toggleLike(postId,button){
  const demo=postId.startsWith('demo-');
  if(demo){button.classList.toggle('active'); const count=button.querySelector('span:last-child'); const current=Number(count.textContent.replace(/[^0-9.]/g,''))||0; toast(button.classList.contains('active')?'Liked':'Like removed'); return;}
  if(!requireAuth()) return;
  const post=state.posts.find(p=>p.id===postId); if(!post)return;
  if(post.liked){ await supabase.from('blurb_likes').delete().eq('user_id',state.user.id).eq('post_id',postId); post.liked=false; post.likes=Math.max(0,post.likes-1); }
  else { const {error}=await supabase.from('blurb_likes').insert({user_id:state.user.id,post_id:postId}); if(error){toast('Couldn’t like that');return;} post.liked=true; post.likes++; }
  button.classList.toggle('active',post.liked); button.querySelector('span:last-child').textContent=compactNum(post.likes);
}

async function toggleFollow(userId,button){
  if(!requireAuth()) return; if(!userId||userId===state.user.id){toast('That’s you');return;}
  const follows=state.followingIds.has(userId);
  if(follows){await supabase.from('blurb_follows').delete().eq('follower_id',state.user.id).eq('following_id',userId);state.followingIds.delete(userId);button.textContent='Follow';}
  else {const {error}=await supabase.from('blurb_follows').insert({follower_id:state.user.id,following_id:userId});if(error){toast('Couldn’t follow');return;}state.followingIds.add(userId);button.textContent='Following';}
}

async function sharePost(postId){
  const url=`${location.origin}/?post=${encodeURIComponent(postId)}`;
  try{ if(navigator.share) await navigator.share({title:'Blurb',text:'You need to see this book review on Blurb.',url}); else {await navigator.clipboard.writeText(url);toast('Link copied');} }catch{}
}

function renderDiscover(filter=''){
  const q=(filter||$('#discoverSearch')?.value||'').trim().toLowerCase();
  const books=state.books.filter(b=>!q||b.title.toLowerCase().includes(q)||b.author.toLowerCase().includes(q)||(b.genres||[]).some(g=>g.toLowerCase().includes(q)));
  $('#bookCount').textContent=`${books.length} ${books.length===1?'book':'books'}`;
  $('#tropeRail').innerHTML=tropes.map(t=>`<button class="pill ${q===t.toLowerCase()?'active':''}" data-trope="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('');
  $('#bookGrid').innerHTML=books.map(book=>bookCard(book)).join('')||'<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">⌕</div><h3>No books found</h3><p>Try another title, author or trope.</p></div>';
  $$('[data-trope]').forEach(b=>b.addEventListener('click',()=>{$('#discoverSearch').value=b.dataset.trope;renderDiscover(b.dataset.trope);}));
  $$('[data-book-tbr]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();addToLibrary(b.dataset.bookTbr,'tbr');}));
}

function bookCard(book){
  const [a,b]=paletteFor(book.title);
  return `<button class="book-card" data-book-card="${book.id}" style="--cover-a:${a};--cover-b:${b}"><div class="book-cover"><span>${escapeHtml(book.title)}</span></div><div class="book-meta"><strong>${escapeHtml(book.title)}</strong><small>${escapeHtml(book.author)}</small><div class="book-actions-inline"><span class="tiny-button" data-book-tbr="${book.id}">＋ TBR</span>${(book.genres||[])[0]?`<span class="tiny-button">${escapeHtml(book.genres[0])}</span>`:''}</div></div></button>`;
}

async function addToLibrary(bookId,status){
  if(!bookId){toast('Book link coming next');return;} if(!requireAuth())return;
  const existing=state.library.find(x=>x.book_id===bookId);
  const payload={user_id:state.user.id,book_id:bookId,reading_status:status,is_favourite:existing?.is_favourite||false,updated_at:new Date().toISOString()};
  const {error}=await supabase.from('blurb_library').upsert(payload,{onConflict:'user_id,book_id'});
  if(error){toast('Couldn’t update your library');return;} toast(status==='tbr'?'Added to your TBR':'Library updated'); if(state.activeView==='library')loadLibrary();
}

async function loadLibrary(){
  const root=$('#libraryContent');
  if(root)root.innerHTML='<div class="empty-state"><p>Loading your library…</p></div>';

  try{
    let user=state.user;
    if(!user){
      const {data:{session},error:sessionError}=await supabase.auth.getSession();
      if(sessionError)console.warn('Could not refresh session',sessionError);
      user=session?.user||null;
      if(user){
        state.user=user;
        if(!state.profile)await ensureProfile();
      }
    }

    if(!user){
      if(root)root.innerHTML=emptyAuth('Sign in to build your library','Keep your TBR, current reads and favourites together.');
      bindEmptySignIn();
      return;
    }

    const {data:libraryRows,error:libraryError}=await supabase
      .from('blurb_library')
      .select('book_id,reading_status,is_favourite,updated_at')
      .eq('user_id',user.id)
      .order('updated_at',{ascending:false});

    if(libraryError)throw libraryError;

    const rows=libraryRows||[];
    const bookIds=[...new Set(rows.map(x=>x.book_id).filter(Boolean))];
    let booksById={};

    if(bookIds.length){
      const {data:bookRows,error:bookError}=await supabase
        .from('blurb_books')
        .select('id,source,source_id,title,author,genres,cover_url,description')
        .in('id',bookIds);
      if(bookError)throw bookError;
      booksById=Object.fromEntries((bookRows||[]).map(book=>[book.id,book]));
    }

    state.library=rows.map(row=>({
      ...row,
      blurb_books:booksById[row.book_id]||null
    }));
    renderLibrary();
  }catch(error){
    console.error('Could not load library',error);
    state.library=[];
    if(root)root.innerHTML=emptyText('Couldn’t load your library','Refresh the page and try again.');
  }
}

function renderLibrary(){
  try{
    const items=(state.library||[]).filter(x=>state.libraryTab==='favourites'?x.is_favourite:x.reading_status===state.libraryTab);
    $$('#libraryTabs button').forEach(b=>b.classList.toggle('active',b.dataset.library===state.libraryTab));
    const root=$('#libraryContent');
    if(!root)return;

    root.innerHTML=items.length?`<div class="library-grid">${items.map(x=>{
      const b=x.blurb_books||{};
      const title=b.title||'Untitled';
      const author=b.author||'';
      const [a,c]=paletteFor(title);
      return `<article class="library-book-card"
        data-library-card
        data-library-book="${escapeHtml(x.book_id||'')}"
        data-library-source="${escapeHtml(b.source_id||'')}"
        data-library-title="${escapeHtml(title)}"
        data-library-author="${escapeHtml(author)}">
        <button type="button" class="library-book-cover" style="--cover-a:${a};--cover-b:${c}" aria-label="View ${escapeHtml(title)} details">
          <span>${escapeHtml(title)}</span>
        </button>
        <div class="library-book-meta">
          <strong>${escapeHtml(title)}</strong>
          <small>${escapeHtml(author)}</small>
        </div>
      </article>`;
    }).join('')}</div>`:emptyText(state.libraryTab==='tbr'?'Your TBR is waiting':'Nothing here yet','Add books from Discover or straight from a Blurb in your feed.');
  }catch(error){
    console.error('Could not render library',error);
    const root=$('#libraryContent');
    if(root)root.innerHTML=emptyText('Couldn’t display your library','Refresh the page and try again.');
  }
}
function emptyText(title,copy){return `<div class="empty-state"><div class="empty-icon">▤</div><h3>${title}</h3><p>${copy}</p><button class="secondary-button" data-go-discover>Discover books</button></div>`;}
function emptyAuth(title,copy){return `<div class="empty-state"><div class="empty-icon">▤</div><h3>${title}</h3><p>${copy}</p><button class="secondary-button" data-empty-signin>Sign in</button></div>`;}
function bindEmptySignIn(){ $('[data-empty-signin]')?.addEventListener('click',()=>openSheet('authSheet')); }

async function renderProfile(){
  const root=$('#profileContent');
  if(!state.user){ root.innerHTML=`<div class="empty-state" style="padding-top:110px"><div class="empty-icon">◉</div><h3>Your reader profile</h3><p>Post reviews, follow readers and keep your book life in one place.</p><button class="secondary-button" data-profile-signin>Sign in or create account</button></div>`; $('[data-profile-signin]')?.addEventListener('click',()=>openSheet('authSheet')); return; }
  await ensureProfile();
  const [{count:postCount},{count:followerCount},{count:followingCount},{data:posts}]=await Promise.all([
    supabase.from('blurb_posts').select('*',{count:'exact',head:true}).eq('user_id',state.user.id),
    supabase.from('blurb_follows').select('*',{count:'exact',head:true}).eq('following_id',state.user.id),
    supabase.from('blurb_follows').select('*',{count:'exact',head:true}).eq('follower_id',state.user.id),
    supabase.from('blurb_posts').select('id,caption,book_id,blurb_books(title)').eq('user_id',state.user.id).order('created_at',{ascending:false}).limit(9)
  ]);
  const p=state.profile||{}; const name=p.display_name||p.username||state.user.email?.split('@')[0]||'Reader';
  root.innerHTML=`<div class="profile-shell">
    <div class="profile-settings-wrap">
      <button class="profile-settings-button" id="profileSettingsButton" type="button" aria-label="Profile settings" aria-expanded="false">
        <img class="profile-settings-png" src="https://res.cloudinary.com/pfswmydz/image/upload/blurb-settings.png" alt="" />
      </button>
      <div class="profile-settings-menu" id="profileSettingsMenu" hidden>
        <button type="button" id="editProfileButton">Edit profile</button>
        <button type="button" id="signOutButton" class="danger">Sign out</button>
      </div>
    </div>
    <div class="profile-hero">
      <div class="profile-intro">
        <div class="profile-avatar">${p.avatar_url?`<img src="${escapeHtml(p.avatar_url)}" alt="" />`:initials(name)}</div>
        <div class="profile-identity">
          <h1>${escapeHtml(name)}</h1>
          <div class="profile-username">@${escapeHtml(p.username||'choose_a_username')}</div>
        </div>
      </div>
      <p class="profile-bio">${escapeHtml(p.bio||'Books, reviews and whatever I’m currently obsessed with.')}</p>
      <div class="profile-stats">
        <div class="profile-stat"><strong>${postCount||0}</strong><span>Blurbs</span></div>
        <div class="profile-stat"><strong>${followerCount||0}</strong><span>Followers</span></div>
        <div class="profile-stat"><strong>${followingCount||0}</strong><span>Following</span></div>
      </div>
    </div>
  </div>
  <div class="profile-tabs"><button class="active">Blurbs</button><button>Reviews</button><button>Library</button></div><div class="profile-grid">${(posts||[]).map(x=>{const [a,b]=paletteFor(x.id);return `<div class="profile-post" style="--card-a:${a};--card-b:${b}">${escapeHtml(x.blurb_books?.title||x.caption||'Blurb')}</div>`;}).join('')}</div>`;
  const settingsButton=$('#profileSettingsButton');
  const settingsMenu=$('#profileSettingsMenu');
  settingsButton?.addEventListener('click',e=>{
    e.stopPropagation();
    const opening=settingsMenu.hidden;
    settingsMenu.hidden=!opening;
    settingsButton.setAttribute('aria-expanded',String(opening));
  });
  root.addEventListener('click',e=>{
    if(!e.target.closest('.profile-settings-wrap')&&settingsMenu&&!settingsMenu.hidden){settingsMenu.hidden=true;settingsButton?.setAttribute('aria-expanded','false');}
  },{once:true});
  $('#signOutButton').addEventListener('click',async()=>{await supabase.auth.signOut();toast('Signed out');showView('feed');});
  $('#editProfileButton').addEventListener('click',()=>{if(settingsMenu)settingsMenu.hidden=true;editProfile();});
}

async function editProfile(){
  const username=prompt('Username (letters, numbers and underscores)',state.profile?.username||''); if(username===null)return;
  const displayName=prompt('Display name',state.profile?.display_name||''); if(displayName===null)return;
  const bio=prompt('Bio',state.profile?.bio||''); if(bio===null)return;
  const clean=username.trim().replace(/^@/,'');
  if(clean && !/^[A-Za-z0-9_]{3,24}$/.test(clean)){toast('Username must be 3–24 letters, numbers or underscores');return;}
  const {data,error}=await supabase.from('blurb_profiles').update({username:clean||null,display_name:displayName.trim(),bio:bio.trim(),updated_at:new Date().toISOString()}).eq('id',state.user.id).select().single();
  if(error){toast(error.message.includes('duplicate')?'That username is taken':'Couldn’t update profile');return;} state.profile=data;renderProfile();toast('Profile updated');
}

function renderBookSheet(filter=''){
  if(!$('#bookSheetList'))return; const q=(filter||'').toLowerCase(); const books=state.books.filter(b=>!q||b.title.toLowerCase().includes(q)||b.author.toLowerCase().includes(q));
  $('#bookSheetList').innerHTML=books.map(book=>{const [a,b]=paletteFor(book.title);return `<button class="sheet-book" data-pick-book="${book.id}" style="--cover-a:${a};--cover-b:${b}"><i class="mini-cover"></i><span><strong>${escapeHtml(book.title)}</strong><small>${escapeHtml(book.author)}</small></span></button>`;}).join('');
  $$('[data-pick-book]').forEach(b=>b.addEventListener('click',()=>{state.selectedBook=state.books.find(x=>x.id===b.dataset.pickBook);$('#selectedBookId').value=state.selectedBook.id;$('#selectedBookLabel').textContent=`${state.selectedBook.title} — ${state.selectedBook.author}`;closeSheets();}));
}

function initRatingPicker(){
  const values=[0.5,1,1.5,2,2.5,3,3.5,4,4.5,5];
  $('#ratingPicker').innerHTML=values.map(v=>`<button class="rating-button" type="button" data-rating="${v}">${v===.5?'½':ratingStars(v)}</button>`).join('');
  $$('[data-rating]').forEach(b=>b.addEventListener('click',()=>{state.selectedRating=Number(b.dataset.rating);$('#ratingValue').value=state.selectedRating;$$('[data-rating]').forEach(x=>x.classList.toggle('active',x===b));}));
}

async function publishPost(e){
  e.preventDefault(); if(!requireAuth())return;
  const bookId=$('#selectedBookId').value; const caption=$('#caption').value.trim(); const file=$('#mediaFile').files[0];
  if(!bookId){setCreateStatus('Choose a book first.',true);return;} if(!caption){setCreateStatus('Write something about the book first.',true);return;}
  $('#publishButton').disabled=true; setCreateStatus(file?'Uploading media…':'Publishing…');
  try{
    let mediaUrl=null,postType='text';
    if(file){ const ext=(file.name.split('.').pop()||'bin').toLowerCase(); const path=`${state.user.id}/${crypto.randomUUID()}.${ext}`; const {error:uploadError}=await supabase.storage.from('blurb-media').upload(path,file,{contentType:file.type,upsert:false}); if(uploadError)throw uploadError; const {data:publicData}=supabase.storage.from('blurb-media').getPublicUrl(path); mediaUrl=publicData.publicUrl; postType=file.type.startsWith('video/')?'video':'image'; setCreateStatus('Publishing…'); }
    const payload={user_id:state.user.id,book_id:bookId,post_type:postType,media_url:mediaUrl,caption,rating:state.selectedRating,contains_spoilers:$('#spoilerToggle').checked,status:'published'};
    const {data:post,error}=await supabase.from('blurb_posts').insert(payload).select().single(); if(error)throw error;
    const tags=$('#tags').value.split(',').map(x=>x.trim().replace(/^#/,'')).filter(Boolean).slice(0,10); if(tags.length)await supabase.from('blurb_post_tags').insert(tags.map(tag=>({post_id:post.id,tag})));
    setCreateStatus('Posted!',false,true); toast('Your Blurb is live'); resetCreateForm(); await loadPosts(); showView('feed'); $('#feed').scrollTo({top:0,behavior:'smooth'});
  }catch(err){console.error(err);setCreateStatus(err?.message||'Couldn’t publish that Blurb.',true);}finally{$('#publishButton').disabled=false;}
}
function setCreateStatus(msg,error=false,success=false){const el=$('#createStatus');el.textContent=msg;el.className=`form-status${error?' error':''}${success?' success':''}`;}
function resetCreateForm(){ $('#createForm').reset();$('#selectedBookId').value='';$('#selectedBookLabel').textContent='Choose a book';$('#mediaPreview').hidden=true;$('#mediaPreview').innerHTML='';$('#uploadPrompt').hidden=false;$('#captionCount').textContent='0';state.selectedBook=null;state.selectedRating=null;$$('[data-rating]').forEach(x=>x.classList.remove('active')); }

async function openComments(postId){
  state.activePostForComments=postId; openSheet('commentsSheet');
  if(postId.startsWith('demo-')){ $('#commentsList').innerHTML=`<div class="comment-row"><div class="avatar">R</div><div class="comment-body"><strong>@readrepeat</strong><p>This is exactly the review I needed 😂</p><time>12m</time></div></div><div class="comment-row"><div class="avatar">S</div><div class="comment-body"><strong>@shelflife</strong><p>Adding it to my TBR immediately.</p><time>4m</time></div></div>`; return; }
  $('#commentsList').innerHTML='<div class="empty-state"><p>Loading comments…</p></div>';
  const {data}=await supabase.from('blurb_comments').select('id,user_id,body,created_at').eq('post_id',postId).order('created_at');
  const ids=[...new Set((data||[]).map(x=>x.user_id))]; let profiles=[]; if(ids.length){const r=await supabase.from('blurb_profiles').select('id,username,display_name,avatar_url').in('id',ids);profiles=r.data||[];}
  const map=Object.fromEntries(profiles.map(p=>[p.id,p]));
  $('#commentsList').innerHTML=(data||[]).length?(data||[]).map(c=>{const p=map[c.user_id]||{};const name=p.username||p.display_name||'reader';return `<div class="comment-row"><div class="avatar">${p.avatar_url?`<img src="${escapeHtml(p.avatar_url)}" alt="" />`:initials(name)}</div><div class="comment-body"><strong>@${escapeHtml(name)}</strong><p>${escapeHtml(c.body)}</p><time>${timeAgo(c.created_at)}</time></div></div>`;}).join(''):'<div class="empty-state"><h3>No comments yet</h3><p>Be the first to start the conversation.</p></div>';
}

async function postComment(e){
  e.preventDefault(); if(!requireAuth())return; const body=$('#commentInput').value.trim(); if(!body)return; if(state.activePostForComments?.startsWith('demo-')){toast('Demo post — comments stay local');$('#commentInput').value='';return;}
  const {error}=await supabase.from('blurb_comments').insert({post_id:state.activePostForComments,user_id:state.user.id,body}); if(error){toast('Couldn’t post comment');return;} $('#commentInput').value='';await openComments(state.activePostForComments);await loadPosts();
}

function initEvents(){
  $$('.nav-item').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
  $('#feedForYou').addEventListener('click',()=>{state.feedMode='for-you';$('#feedForYou').classList.add('active');$('#feedFollowing').classList.remove('active');renderFeed();});
  $('#feedFollowing').addEventListener('click',async()=>{state.feedMode='following';$('#feedFollowing').classList.add('active');$('#feedForYou').classList.remove('active');await loadFollowing();renderFeed();});
  $('#discoverSearch').addEventListener('input',()=>renderDiscover());
  $('#bookPickerButton').addEventListener('click',()=>{renderBookSheet();openSheet('bookSheet');setTimeout(()=>$('#bookSheetSearch').focus(),100);});
  $('#bookSheetSearch').addEventListener('input',e=>renderBookSheet(e.target.value));
  $('#createForm').addEventListener('submit',publishPost);
  $('#caption').addEventListener('input',e=>$('#captionCount').textContent=e.target.value.length);
  $('#mediaFile').addEventListener('change',previewMedia);
  $('#sheetBackdrop').addEventListener('click',closeSheets); $$('[data-close-sheet]').forEach(b=>b.addEventListener('click',closeSheets));
  $('#signInMode').addEventListener('click',()=>setAuthMode('signin')); $('#signUpMode').addEventListener('click',()=>setAuthMode('signup'));
  $('#authForm').addEventListener('submit',handleAuth); $('#commentForm').addEventListener('submit',postComment);
  $('#libraryTabs')?.addEventListener('click',e=>{
    const button=e.target.closest('button[data-library]');
    if(!button)return;
    state.libraryTab=button.dataset.library;
    renderLibrary();
  });
  window.addEventListener('blurb-library-changed',()=>{if(state.activeView==='library')loadLibrary();});
window.addEventListener('blurb-spoiler-preference-changed',()=>{if(state.activeView==='home')renderFeed();});
  $('#libraryContent').addEventListener('click',e=>{if(e.target.closest('[data-go-discover]'))showView('discover');});
  $('#openNotifications').addEventListener('click',()=>state.user?toast('Notifications are ready for live activity'):openSheet('authSheet'));
}

function previewMedia(){
  const file=$('#mediaFile').files[0]; if(!file)return; const url=URL.createObjectURL(file); $('#uploadPrompt').hidden=true;const preview=$('#mediaPreview');preview.hidden=false;preview.innerHTML=file.type.startsWith('video/')?`<video src="${url}" muted controls></video>`:`<img src="${url}" alt="Preview" />`;
}
function setAuthMode(mode){state.authMode=mode;$('#signInMode').classList.toggle('active',mode==='signin');$('#signUpMode').classList.toggle('active',mode==='signup');$('#authSubmit').textContent=mode==='signin'?'Sign in':'Create account';$('#authStatus').textContent='';}
async function handleAuth(e){
  e.preventDefault(); const email=$('#authEmail').value.trim();const password=$('#authPassword').value;const status=$('#authStatus');status.textContent=state.authMode==='signin'?'Signing in…':'Creating account…';status.className='form-status';
  const result=state.authMode==='signin'?await supabase.auth.signInWithPassword({email,password}):await supabase.auth.signUp({email,password});
  if(result.error){status.textContent=result.error.message;status.className='form-status error';return;}
  if(state.authMode==='signup'&&!result.data.session){status.textContent='Check your email to confirm your account, then come back and sign in.';status.className='form-status success';return;}
  state.user=result.data.user||result.data.session?.user||null;await ensureProfile();closeSheets();toast(state.authMode==='signin'?'Welcome back':'Welcome to Blurb');await Promise.all([loadPosts(),loadFollowing()]); if(state.activeView==='profile')renderProfile();
}

async function boot(){
  initRatingPicker();initEvents();
  await loadSession();
  await Promise.all([loadBooks(),loadFollowing()]);
  await loadPosts();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
}
boot();
