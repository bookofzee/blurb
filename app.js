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
  librarySearchByTab: {tbr:'',reading:'',read:'',dnf:''},
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

async function openBlurbPost(postId){
  if(!postId)return false;

  let post=state.posts.find(p=>String(p.id)===String(postId));

  if(!post&&!String(postId).startsWith('demo-')){
    const {data,error}=await supabase.from('blurb_posts')
      .select('id,user_id,book_id,post_type,media_url,thumbnail_url,media_scale,media_offset_x,media_offset_y,media_fit,media_rotation,editor_state,caption,rating,contains_spoilers,created_at,blurb_books(id,title,author,genres,source_id)')
      .eq('id',postId)
      .eq('status','published')
      .maybeSingle();

    if(error||!data)return false;

    const [{data:profile},{data:likes},{data:comments},{data:postTags}]=await Promise.all([
      supabase.from('blurb_profiles').select('id,username,display_name,avatar_url').eq('id',data.user_id).maybeSingle(),
      supabase.from('blurb_likes').select('post_id,user_id').eq('post_id',data.id),
      supabase.from('blurb_comments').select('post_id').eq('post_id',data.id),
      supabase.from('blurb_post_tags').select('post_id,tag').eq('post_id',data.id)
    ]);

    post={
      ...data,
      profile:profile||{},
      likes:(likes||[]).length,
      liked:state.user?(likes||[]).some(x=>x.user_id===state.user.id):false,
      comments:(comments||[]).length,
      tags:(postTags||[]).map(x=>x.tag)
    };
    state.posts=[post,...state.posts.filter(p=>String(p.id)!==String(post.id))];
  }

  if(!post)return false;

  state.feedMode='for-you';
  $('#feedForYou')?.classList.add('active');
  $('#feedFollowing')?.classList.remove('active');
  showView('feed');
  renderFeed();

  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      const card=document.querySelector(`.feed-card[data-post="${CSS.escape(String(postId))}"]`);
      if(card){
        card.scrollIntoView({block:'start',behavior:'auto'});
        const video=card.querySelector('video');
        video?.play?.().catch(()=>{});
      }
    });
  });

  return true;
}

window.openBlurbPost=openBlurbPost;

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
  document.querySelectorAll('.book-chip').forEach(b=>b.addEventListener('click',e=>{
    e.preventDefault();
    e.stopPropagation();
    if(typeof window.openBlurbFeedBook==='function'&&window.openBlurbFeedBook(b))return;
    const book=state.books.find(x=>x.id===b.dataset.book);
    if(book){showView('discover'); $('#discoverSearch').value=book.title; renderDiscover(book.title);}
  }));
}

function installFeedReelPaging(){
  const feed=document.querySelector('#feed');
  if(!feed||feed.dataset.reelPaging==='1')return;
  feed.dataset.reelPaging='1';

  let wheelGesture=false;
  let wheelResetTimer=null;
  let touchStartY=null;
  let touchStartTop=0;
  let touchStartIndex=0;
  let touchMoved=false;

  const cards=()=>Array.from(feed.querySelectorAll('.feed-card'));

  const indexAtScroll=()=>{
    const list=cards();
    if(!list.length)return 0;
    let best=0;
    let distance=Infinity;
    list.forEach((card,index)=>{
      const d=Math.abs(card.offsetTop-feed.scrollTop);
      if(d<distance){distance=d;best=index;}
    });
    return best;
  };

  const goToIndex=(index,behavior='smooth')=>{
    const list=cards();
    if(!list.length)return;
    const target=Math.max(0,Math.min(list.length-1,index));
    feed.scrollTo({top:list[target].offsetTop,behavior});
  };

  feed.addEventListener('wheel',e=>{
    if(Math.abs(e.deltaY)<Math.abs(e.deltaX))return;
    e.preventDefault();

    clearTimeout(wheelResetTimer);
    wheelResetTimer=setTimeout(()=>{wheelGesture=false;},260);

    if(wheelGesture||Math.abs(e.deltaY)<6)return;
    wheelGesture=true;

    const current=indexAtScroll();
    goToIndex(current+(e.deltaY>0?1:-1));
  },{passive:false});

  feed.addEventListener('touchstart',e=>{
    if(e.touches.length!==1)return;
    touchStartY=e.touches[0].clientY;
    touchStartTop=feed.scrollTop;
    touchStartIndex=indexAtScroll();
    touchMoved=false;
  },{passive:true});

  feed.addEventListener('touchmove',e=>{
    if(touchStartY===null||e.touches.length!==1)return;
    const delta=touchStartY-e.touches[0].clientY;
    if(Math.abs(delta)<3)return;
    e.preventDefault();
    touchMoved=true;

    const height=Math.max(1,feed.clientHeight);
    const restrained=Math.max(-height*.34,Math.min(height*.34,delta*.42));
    feed.scrollTop=touchStartTop+restrained;
  },{passive:false});

  feed.addEventListener('touchend',e=>{
    if(touchStartY===null)return;
    const endY=e.changedTouches?.[0]?.clientY??touchStartY;
    const delta=touchStartY-endY;
    const startIndex=touchStartIndex;

    touchStartY=null;
    touchMoved=false;

    if(Math.abs(delta)<42){
      goToIndex(startIndex);
      return;
    }
    goToIndex(startIndex+(delta>0?1:-1));
  },{passive:true});

  feed.addEventListener('touchcancel',()=>{
    if(touchStartY===null)return;
    const startIndex=touchStartIndex;
    touchStartY=null;
    touchMoved=false;
    goToIndex(startIndex);
  },{passive:true});
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
    const tabItems=(state.library||[]).filter(x=>state.libraryTab==='favourites'?x.is_favourite:x.reading_status===state.libraryTab);
    const query=String(state.librarySearchByTab?.[state.libraryTab]||'').trim().toLowerCase();
    const items=query
      ? tabItems.filter(x=>{
          const b=x.blurb_books||{};
          return String(b.title||'').toLowerCase().includes(query)||String(b.author||'').toLowerCase().includes(query);
        })
      : tabItems;
    document.querySelectorAll('#libraryTabs button').forEach(b=>b.classList.toggle('active',b.dataset.library===state.libraryTab));

    const search=$('#librarySearch');
    if(search){
      const labels={tbr:'TBR',reading:'Reading',read:'Read',dnf:'DNF'};
      search.placeholder=`Search ${labels[state.libraryTab]||'library'}`;
      if(search.value!==String(state.librarySearchByTab?.[state.libraryTab]||''))search.value=String(state.librarySearchByTab?.[state.libraryTab]||'');
    }

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
    }).join('')}</div>`:query
      ? emptyText('No books found',`Nothing in this ${state.libraryTab==='tbr'?'TBR':state.libraryTab} list matches “${escapeHtml(query)}”.`)
      : emptyText(state.libraryTab==='tbr'?'Your TBR is waiting':'Nothing here yet','Add books from Discover or straight from a Blurb in your feed.');
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
  if(!state.user){
    root.innerHTML=`<div class="empty-state" style="padding-top:110px"><div class="empty-icon">◉</div><h3>Your reader profile</h3><p>Post reviews, follow readers and keep your book life in one place.</p><button class="secondary-button" data-profile-signin>Sign in or create account</button></div>`;
    $('[data-profile-signin]')?.addEventListener('click',()=>openSheet('authSheet'));
    return;
  }

  await ensureProfile();

  const [{count:postCount},{count:followerCount},{count:followingCount}]=await Promise.all([
    supabase.from('blurb_posts').select('*',{count:'exact',head:true}).eq('user_id',state.user.id).eq('status','published'),
    supabase.from('blurb_follows').select('*',{count:'exact',head:true}).eq('following_id',state.user.id),
    supabase.from('blurb_follows').select('*',{count:'exact',head:true}).eq('follower_id',state.user.id)
  ]);

  const p=state.profile||{};
  const name=p.display_name||p.username||state.user.email?.split('@')[0]||'Reader';
  const bannerStyle=p.banner_url?` style="background-image:url('${escapeHtml(p.banner_url)}')"`:'';

  root.innerHTML=`
    <div class="profile-shell">
      <div class="profile-banner ${p.banner_url?'has-image':''}"${bannerStyle}>
        <div class="profile-banner-books" aria-hidden="true"></div>
      </div>

      <section class="profile-panel">
        <div class="profile-avatar-wrap">
          <div class="profile-avatar">${p.avatar_url?`<img src="${escapeHtml(p.avatar_url)}" alt="" />`:initials(name)}</div>
        </div>

        <div class="profile-top-actions">
          <button class="profile-edit-main" id="profileEditButton" type="button">Edit profile</button>
          <div class="profile-settings-wrap">
            <button class="profile-settings-button" id="profileSettingsButton" type="button" aria-label="Profile settings" aria-expanded="false">
              <img class="profile-settings-png" src="https://res.cloudinary.com/pfswmydz/image/upload/blurb-settings.png" alt="" />
            </button>
            <div class="profile-settings-menu" id="profileSettingsMenu" hidden>
              <button type="button" id="editProfileMenuButton">Edit profile</button>
              <button type="button" id="signOutButton" class="danger">Sign out</button>
            </div>
          </div>
        </div>

        <div class="profile-copy">
          <h1>${escapeHtml(name)}</h1>
          <div class="profile-username">@${escapeHtml(p.username||'choose_a_username')}</div>
          <p class="profile-bio">${escapeHtml(p.bio||'Books, reviews and whatever I’m currently obsessed with.')}</p>
        </div>

        <div class="profile-stats">
          <button class="profile-stat" type="button" data-profile-stat="blurbs"><strong>${postCount||0}</strong><span>Blurbs</span></button>
          <button class="profile-stat" type="button" data-profile-stat="followers"><strong>${followerCount||0}</strong><span>Followers</span></button>
          <button class="profile-stat" type="button" data-profile-stat="following"><strong>${followingCount||0}</strong><span>Following</span></button>
        </div>
      </section>
    </div>

    <div class="profile-tabs" role="tablist" aria-label="Profile content">
      <button class="active" type="button" role="tab" aria-selected="true" data-profile-tab="blurbs">Blurbs</button>
      <button type="button" role="tab" aria-selected="false" data-profile-tab="liked">Liked</button>
      <button type="button" role="tab" aria-selected="false" data-profile-tab="saved">Saved</button>
    </div>
    <div class="profile-grid" data-profile-grid><div class="profile-grid-loading">Gathering your Blurbs…</div></div>
  `;

  const settingsButton=$('#profileSettingsButton');
  const settingsMenu=$('#profileSettingsMenu');
  settingsButton?.addEventListener('click',e=>{
    e.stopPropagation();
    const opening=settingsMenu.hidden;
    settingsMenu.hidden=!opening;
    settingsButton.setAttribute('aria-expanded',String(opening));
  });

  root.addEventListener('click',e=>{
    if(!e.target.closest('.profile-settings-wrap')&&settingsMenu&&!settingsMenu.hidden){
      settingsMenu.hidden=true;
      settingsButton?.setAttribute('aria-expanded','false');
    }
  });

  $('#signOutButton')?.addEventListener('click',async()=>{
    await supabase.auth.signOut();
    toast('Signed out');
    showView('feed');
  });

  const openEditor=()=>{
    if(settingsMenu)settingsMenu.hidden=true;
    editProfile();
  };
  $('#profileEditButton')?.addEventListener('click',openEditor);
  $('#editProfileMenuButton')?.addEventListener('click',openEditor);

  window.dispatchEvent(new CustomEvent('blurb-profile-rendered'));
}

async function uploadProfileAsset(file,kind){
  if(!state.user||!file)return null;
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
  const path=`${state.user.id}/profile/${kind}-${crypto.randomUUID?.()||Date.now()}.${ext}`;
  const {error}=await supabase.storage.from('blurb-media').upload(path,file,{
    contentType:file.type||'image/jpeg',
    upsert:false
  });
  if(error)throw error;
  const {data}=supabase.storage.from('blurb-media').getPublicUrl(path);
  return data?.publicUrl||null;
}

function profileCropState(modal,kind){
  const draft=modal?._draft;
  if(!draft)return null;
  return kind==='avatar'?draft.avatarTransform:draft.bannerTransform;
}

function profileCropUrl(modal,kind){
  const draft=modal?._draft;
  return kind==='avatar'?draft?.avatarUrl:draft?.bannerUrl;
}

function markProfileCropDirty(modal,kind){
  if(!modal?._draft)return;
  if(kind==='avatar')modal._draft.avatarDirty=true;
  else modal._draft.bannerDirty=true;
}

function profileCropElements(modal,kind){
  return {
    stage:modal.querySelector('[data-profile-crop="'+kind+'"]'),
    preview:modal.querySelector(kind==='avatar'?'#profileAvatarPreview':'#profileBannerPreview'),
    zoom:modal.querySelector(kind==='avatar'?'#profileAvatarZoom':'#profileBannerZoom')
  };
}

function clampProfileCrop(modal,kind){
  const state=profileCropState(modal,kind);
  const {stage,preview}=profileCropElements(modal,kind);
  const img=preview?.querySelector('img');
  if(!state||!stage||!img||!img.naturalWidth||!img.naturalHeight)return;
  const sw=stage.clientWidth, sh=stage.clientHeight;
  if(!sw||!sh)return;
  const base=Math.max(sw/img.naturalWidth,sh/img.naturalHeight);
  const renderedW=img.naturalWidth*base*state.scale;
  const renderedH=img.naturalHeight*base*state.scale;
  const maxX=Math.max(0,(renderedW-sw)/2);
  const maxY=Math.max(0,(renderedH-sh)/2);
  state.x=Math.max(-maxX,Math.min(maxX,state.x));
  state.y=Math.max(-maxY,Math.min(maxY,state.y));
}

function paintProfileCrop(modal,kind){
  const state=profileCropState(modal,kind);
  const url=profileCropUrl(modal,kind);
  const {preview,zoom}=profileCropElements(modal,kind);
  if(!preview||!state)return;
  if(!url){
    preview.innerHTML=kind==='avatar'
      ? '<span class="profile-crop-empty">Add photo</span>'
      : '<span class="profile-crop-empty">Add banner</span>';
    if(zoom)zoom.value='1';
    return;
  }
  preview.innerHTML='<img src="'+escapeHtml(url)+'" alt="" draggable="false" />';
  const img=preview.querySelector('img');
  const apply=()=>{
    clampProfileCrop(modal,kind);
    img.style.left='calc(50% + '+state.x+'px)';
    img.style.top='calc(50% + '+state.y+'px)';
    img.style.transform='translate(-50%,-50%) scale('+state.scale+')';
    if(zoom)zoom.value=String(state.scale);
  };
  if(img.complete)apply();
  else img.addEventListener('load',apply,{once:true});
}

function bindProfileCropStage(modal,kind){
  const {stage,zoom}=profileCropElements(modal,kind);
  if(!stage||stage.dataset.cropBound==='1')return;
  stage.dataset.cropBound='1';
  const pointers=new Map();
  let lastPoint=null, pinchStart=null;
  const point=e=>({x:e.clientX,y:e.clientY});
  const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const startPinch=()=>{
    if(pointers.size<2){pinchStart=null;return;}
    const pts=[...pointers.values()].slice(0,2);
    const state=profileCropState(modal,kind);
    if(!state)return;
    pinchStart={distance:Math.max(1,distance(pts[0],pts[1])),center:midpoint(pts[0],pts[1]),scale:state.scale,x:state.x,y:state.y};
  };
  stage.addEventListener('pointerdown',e=>{
    if(!profileCropUrl(modal,kind))return;
    e.preventDefault();
    stage.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId,point(e));
    if(pointers.size===1){lastPoint=point(e);pinchStart=null;} else startPinch();
  });
  stage.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;
    e.preventDefault();
    pointers.set(e.pointerId,point(e));
    const state=profileCropState(modal,kind);
    if(!state)return;
    if(pointers.size>=2){
      if(!pinchStart)startPinch();
      const pts=[...pointers.values()].slice(0,2);
      const center=midpoint(pts[0],pts[1]);
      state.scale=Math.max(1,Math.min(3.5,pinchStart.scale*(distance(pts[0],pts[1])/Math.max(1,pinchStart.distance))));
      state.x=pinchStart.x+(center.x-pinchStart.center.x);
      state.y=pinchStart.y+(center.y-pinchStart.center.y);
    }else if(lastPoint){
      const p=point(e);
      state.x+=p.x-lastPoint.x;
      state.y+=p.y-lastPoint.y;
      lastPoint=p;
    }
    markProfileCropDirty(modal,kind);
    paintProfileCrop(modal,kind);
  });
  const end=e=>{
    pointers.delete(e.pointerId);
    if(pointers.size===1){lastPoint=[...pointers.values()][0];pinchStart=null;}
    else if(!pointers.size){lastPoint=null;pinchStart=null;}
    else startPinch();
  };
  stage.addEventListener('pointerup',end);
  stage.addEventListener('pointercancel',end);
  zoom?.addEventListener('input',e=>{
    const state=profileCropState(modal,kind);
    if(!state||!profileCropUrl(modal,kind))return;
    state.scale=Math.max(1,Math.min(3.5,Number(e.target.value)||1));
    markProfileCropDirty(modal,kind);
    paintProfileCrop(modal,kind);
  });
  stage.addEventListener('wheel',e=>{
    if(!profileCropUrl(modal,kind))return;
    e.preventDefault();
    const state=profileCropState(modal,kind);
    if(!state)return;
    state.scale=Math.max(1,Math.min(3.5,state.scale+(e.deltaY<0?.08:-.08)));
    markProfileCropDirty(modal,kind);
    paintProfileCrop(modal,kind);
  },{passive:false});
}

async function profileCropSourceBlob(url){
  if(!url)throw new Error('No image selected');
  const response=await fetch(url,{mode:'cors'});
  if(!response.ok)throw new Error('Could not load image');
  return await response.blob();
}

async function makeProfileCropFile(modal,kind){
  const state=profileCropState(modal,kind);
  const url=profileCropUrl(modal,kind);
  const {stage}=profileCropElements(modal,kind);
  if(!state||!url||!stage)throw new Error('Crop is unavailable');
  const sourceBlob=await profileCropSourceBlob(url);
  const objectUrl=URL.createObjectURL(sourceBlob);
  try{
    const image=await new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>resolve(img);
      img.onerror=()=>reject(new Error('Could not read image'));
      img.src=objectUrl;
    });
    const outW=kind==='avatar'?1000:1600;
    const ratio=stage.clientWidth&&stage.clientHeight?stage.clientHeight/stage.clientWidth:(kind==='avatar'?1:(184/540));
    const outH=Math.max(1,Math.round(outW*ratio));
    const canvas=document.createElement('canvas');
    canvas.width=outW; canvas.height=outH;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('Canvas unavailable');
    const base=Math.max(outW/image.naturalWidth,outH/image.naturalHeight);
    const drawScale=base*state.scale;
    const drawW=image.naturalWidth*drawScale, drawH=image.naturalHeight*drawScale;
    const sx=stage.clientWidth?state.x/stage.clientWidth:0;
    const sy=stage.clientHeight?state.y/stage.clientHeight:0;
    const dx=(outW-drawW)/2+(sx*outW);
    const dy=(outH-drawH)/2+(sy*outH);
    ctx.fillStyle='#f4e8dc'; ctx.fillRect(0,0,outW,outH);
    ctx.drawImage(image,dx,dy,drawW,drawH);
    const blob=await new Promise((resolve,reject)=>{
      canvas.toBlob(value=>value?resolve(value):reject(new Error('Could not create crop')),'image/jpeg',.92);
    });
    return new File([blob],kind+'-'+Date.now()+'.jpg',{type:'image/jpeg'});
  }finally{ URL.revokeObjectURL(objectUrl); }
}

function ensureProfileDetailsModal(){
  let modal=document.querySelector('#profileDetailsModal');
  if(modal)return modal;

  modal=document.createElement('div');
  modal.id='profileDetailsModal';
  modal.className='profile-details-modal';
  modal.hidden=true;
  modal.innerHTML=`
    <div class="profile-details-backdrop" data-close-profile-details></div>
    <section class="profile-details-card" role="dialog" aria-modal="true" aria-labelledby="profileDetailsTitle">
      <button class="profile-details-close" type="button" data-close-profile-details aria-label="Close">×</button>
      <p class="profile-details-eyebrow">Your reading corner</p>
      <h2 id="profileDetailsTitle">Edit profile</h2>

      <div class="profile-asset-editor">
        <label class="profile-banner-editor">
          <span class="profile-asset-preview profile-banner-preview" id="profileBannerPreview"></span>
          <span class="profile-asset-action">Change banner</span>
          <input id="profileBannerFile" type="file" accept="image/jpeg,image/png,image/webp" />
        </label>
        <div class="profile-avatar-editor-wrap">
          <label class="profile-avatar-editor">
            <span class="profile-asset-preview profile-avatar-preview" id="profileAvatarPreview"></span>
            <span class="profile-asset-action">Change photo</span>
            <input id="profileAvatarFile" type="file" accept="image/jpeg,image/png,image/webp" />
          </label>
        </div>
      </div>

      <div class="profile-remove-assets">
        <button type="button" id="profileRemoveAvatar">Remove photo</button>
        <button type="button" id="profileRemoveBanner">Remove banner</button>
      </div>

      <label class="profile-details-label" for="profileDisplayName">Display name</label>
      <input class="text-input" id="profileDisplayName" maxlength="50" />

      <label class="profile-details-label" for="profileUsername">Username</label>
      <input class="text-input" id="profileUsername" maxlength="24" autocomplete="off" />

      <label class="profile-details-label" for="profileBio">Bio</label>
      <textarea class="text-input profile-bio-input" id="profileBio" maxlength="180"></textarea>

      <div class="profile-details-actions">
        <button class="secondary-button" type="button" data-close-profile-details>Cancel</button>
        <button class="primary-button" type="button" id="profileDetailsSave">Save profile</button>
      </div>
      <p class="form-status" id="profileDetailsStatus"></p>
    </section>
  `;

  document.body.appendChild(modal);

  modal.addEventListener('click',e=>{
    if(e.target.closest('[data-close-profile-details]'))modal.hidden=true;
  });

  modal.querySelector('#profileAvatarFile')?.addEventListener('change',e=>{
    const file=e.target.files?.[0];
    if(!file||!modal._draft)return;
    modal._draft.avatarFile=file;
    modal._draft.avatarUrl=URL.createObjectURL(file);
    modal._draft.removeAvatar=false;
    paintProfileDetailsPreview(modal);
  });

  modal.querySelector('#profileBannerFile')?.addEventListener('change',e=>{
    const file=e.target.files?.[0];
    if(!file||!modal._draft)return;
    modal._draft.bannerFile=file;
    modal._draft.bannerUrl=URL.createObjectURL(file);
    modal._draft.removeBanner=false;
    paintProfileDetailsPreview(modal);
  });

  modal.querySelector('#profileRemoveAvatar')?.addEventListener('click',()=>{
    if(!modal._draft)return;
    modal._draft.avatarFile=null;
    modal._draft.avatarUrl=null;
    modal._draft.removeAvatar=true;
    paintProfileDetailsPreview(modal);
  });

  modal.querySelector('#profileRemoveBanner')?.addEventListener('click',()=>{
    if(!modal._draft)return;
    modal._draft.bannerFile=null;
    modal._draft.bannerUrl=null;
    modal._draft.removeBanner=true;
    paintProfileDetailsPreview(modal);
  });

  modal.querySelector('#profileDetailsSave')?.addEventListener('click',async()=>{
    const draft=modal._draft;
    if(!draft||!state.user)return;

    const username=modal.querySelector('#profileUsername').value.trim().replace(/^@/,'');
    const displayName=modal.querySelector('#profileDisplayName').value.trim();
    const bio=modal.querySelector('#profileBio').value.trim();
    const status=modal.querySelector('#profileDetailsStatus');
    const save=modal.querySelector('#profileDetailsSave');

    if(username&&!/^[A-Za-z0-9_]{3,24}$/.test(username)){
      status.textContent='Username must be 3–24 letters, numbers or underscores.';
      status.className='form-status error';
      return;
    }

    save.disabled=true;
    status.textContent='Saving your profile…';
    status.className='form-status';

    try{
      let avatarUrl=draft.removeAvatar?null:(state.profile?.avatar_url||null);
      let bannerUrl=draft.removeBanner?null:(state.profile?.banner_url||null);

      if(draft.avatarFile)avatarUrl=await uploadProfileAsset(draft.avatarFile,'avatar');
      if(draft.bannerFile)bannerUrl=await uploadProfileAsset(draft.bannerFile,'banner');

      const {data,error}=await supabase.from('blurb_profiles')
        .update({
          username:username||null,
          display_name:displayName,
          bio,
          avatar_url:avatarUrl,
          banner_url:bannerUrl,
          updated_at:new Date().toISOString()
        })
        .eq('id',state.user.id)
        .select()
        .single();

      if(error)throw error;

      state.profile=data;
      modal.hidden=true;
      await renderProfile();
      toast('Profile updated');
    }catch(error){
      console.error('Could not update profile',error);
      status.textContent=String(error?.message||'Couldn’t update profile').includes('duplicate')
        ? 'That username is already taken.'
        : 'Couldn’t update profile.';
      status.className='form-status error';
    }finally{
      save.disabled=false;
    }
  });

  return modal;
}

function paintProfileDetailsPreview(modal){
  const draft=modal._draft||{};
  const name=modal.querySelector('#profileDisplayName')?.value||state.profile?.display_name||state.profile?.username||'Reader';
  const avatar=modal.querySelector('#profileAvatarPreview');
  const banner=modal.querySelector('#profileBannerPreview');

  if(avatar){
    avatar.innerHTML=draft.avatarUrl
      ? `<img src="${escapeHtml(draft.avatarUrl)}" alt="" />`
      : `<span>${escapeHtml(initials(name))}</span>`;
  }

  if(banner){
    banner.innerHTML=draft.bannerUrl
      ? `<img src="${escapeHtml(draft.bannerUrl)}" alt="" />`
      : '<span class="profile-banner-preview-fallback"></span>';
  }
}

async function editProfile(){
  const modal=ensureProfileDetailsModal();
  const p=state.profile||{};

  modal._draft={
    avatarFile:null,
    bannerFile:null,
    avatarUrl:p.avatar_url||null,
    bannerUrl:p.banner_url||null,
    removeAvatar:false,
    removeBanner:false
  };

  modal.querySelector('#profileDisplayName').value=p.display_name||'';
  modal.querySelector('#profileUsername').value=p.username||'';
  modal.querySelector('#profileBio').value=p.bio||'';
  modal.querySelector('#profileAvatarFile').value='';
  modal.querySelector('#profileBannerFile').value='';
  modal.querySelector('#profileDetailsStatus').textContent='';
  modal.querySelector('#profileDetailsStatus').className='form-status';

  paintProfileDetailsPreview(modal);
  modal.hidden=false;
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
  state.activePostForComments=postId;
  openSheet('commentsSheet');

  if(postId.startsWith('demo-')){
    $('#commentsList').innerHTML=`
      <div class="comment-row">
        <div class="avatar">R</div>
        <div class="comment-body"><strong>@readrepeat</strong><p>This is exactly the review I needed 😂</p><time>12m</time></div>
        <button type="button" class="comment-like" data-demo-comment-like aria-pressed="false" aria-label="Like comment"><span>♥</span><small>3</small></button>
      </div>
      <div class="comment-row">
        <div class="avatar">S</div>
        <div class="comment-body"><strong>@shelflife</strong><p>Adding it to my TBR immediately.</p><time>4m</time></div>
        <button type="button" class="comment-like" data-demo-comment-like aria-pressed="false" aria-label="Like comment"><span>♥</span><small>1</small></button>
      </div>`;
    return;
  }

  $('#commentsList').innerHTML='<div class="empty-state"><p>Loading comments…</p></div>';

  const {data:comments,error:commentsError}=await supabase
    .from('blurb_comments')
    .select('id,user_id,body,created_at')
    .eq('post_id',postId)
    .order('created_at');

  if(commentsError){
    console.error('Could not load comments',commentsError);
    $('#commentsList').innerHTML='<div class="empty-state"><h3>Couldn’t load comments</h3><p>Try again in a moment.</p></div>';
    return;
  }

  const rows=comments||[];
  const userIds=[...new Set(rows.map(x=>x.user_id))];
  const commentIds=rows.map(x=>x.id);

  const [profileResult,likeResult]=await Promise.all([
    userIds.length
      ? supabase.from('blurb_profiles').select('id,username,display_name,avatar_url').in('id',userIds)
      : Promise.resolve({data:[]}),
    commentIds.length
      ? supabase.from('blurb_comment_likes').select('comment_id,user_id').in('comment_id',commentIds)
      : Promise.resolve({data:[]})
  ]);

  const profiles=profileResult.data||[];
  const likes=likeResult.data||[];
  const profileMap=Object.fromEntries(profiles.map(p=>[p.id,p]));
  const likesBy={};
  likes.forEach(like=>(likesBy[like.comment_id]??=[]).push(like.user_id));

  $('#commentsList').innerHTML=rows.length
    ? rows.map(c=>{
        const p=profileMap[c.user_id]||{};
        const name=p.username||p.display_name||'reader';
        const commentLikes=likesBy[c.id]||[];
        const liked=!!state.user&&commentLikes.includes(state.user.id);
        return `<div class="comment-row">
          <div class="avatar">${p.avatar_url?`<img src="${escapeHtml(p.avatar_url)}" alt="" />`:initials(name)}</div>
          <div class="comment-body">
            <strong>@${escapeHtml(name)}</strong>
            <p>${escapeHtml(c.body)}</p>
            <time>${timeAgo(c.created_at)}</time>
          </div>
          <button type="button" class="comment-like ${liked?'active':''}" data-comment-like="${c.id}" aria-pressed="${liked?'true':'false'}" aria-label="${liked?'Unlike':'Like'} comment">
            <span>♥</span><small>${commentLikes.length||''}</small>
          </button>
        </div>`;
      }).join('')
    : '<div class="empty-state"><h3>No comments yet</h3><p>Be the first to start the conversation.</p></div>';
}

async function toggleCommentLike(commentId,button){
  if(!requireAuth())return;
  const liked=button.classList.contains('active');
  const countEl=button.querySelector('small');
  let count=Number(countEl?.textContent||0);

  if(liked){
    const {error}=await supabase.from('blurb_comment_likes')
      .delete()
      .eq('comment_id',commentId)
      .eq('user_id',state.user.id);
    if(error){toast('Couldn’t remove that like');return;}
    count=Math.max(0,count-1);
  }else{
    const {error}=await supabase.from('blurb_comment_likes')
      .insert({comment_id:commentId,user_id:state.user.id});
    if(error){toast('Couldn’t like that comment');return;}
    count+=1;
  }

  button.classList.toggle('active',!liked);
  button.setAttribute('aria-pressed',String(!liked));
  button.setAttribute('aria-label',!liked?'Unlike comment':'Like comment');
  if(countEl)countEl.textContent=count||'';
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
  $('#commentsList')?.addEventListener('click',e=>{
    const live=e.target.closest('[data-comment-like]');
    if(live){toggleCommentLike(live.dataset.commentLike,live);return;}
    const demo=e.target.closest('[data-demo-comment-like]');
    if(demo){
      const active=demo.classList.toggle('active');
      demo.setAttribute('aria-pressed',String(active));
      const count=demo.querySelector('small');
      const current=Number(count?.textContent||0);
      if(count)count.textContent=String(Math.max(0,current+(active?1:-1)))||'';
    }
  });
  $('#libraryTabs')?.addEventListener('click',e=>{
    const button=e.target.closest('button[data-library]');
    if(!button)return;
    state.libraryTab=button.dataset.library;
    renderLibrary();
  });
  $('#librarySearch')?.addEventListener('input',e=>{
    state.librarySearchByTab[state.libraryTab]=e.target.value||'';
    renderLibrary();
  });
  $('#librarySearch')?.addEventListener('search',e=>{
    state.librarySearchByTab[state.libraryTab]=e.target.value||'';
    renderLibrary();
  });
  window.addEventListener('blurb-library-changed',()=>{if(state.activeView==='library')loadLibrary();});
  window.addEventListener('blurb-cover-changed',e=>{
    const detail=e.detail||{};
    const sourceId=String(detail.sourceId||'');
    const title=String(detail.title||'').trim().toLowerCase();
    const author=String(detail.author||'').trim().toLowerCase();
    const coverUrl=String(detail.coverUrl||'');
    if(!coverUrl)return;

    const matches=book=>{
      if(sourceId&&String(book?.source_id||'')===sourceId)return true;
      return String(book?.title||'').trim().toLowerCase()===title
        && String(book?.author||'').trim().toLowerCase()===author;
    };

    state.books=(state.books||[]).map(book=>matches(book)?{...book,cover_url:coverUrl}:book);
    state.library=(state.library||[]).map(item=>({
      ...item,
      blurb_books:item.blurb_books&&matches(item.blurb_books)
        ? {...item.blurb_books,cover_url:coverUrl}
        : item.blurb_books
    }));

    if(state.activeView==='discover')renderDiscover();
    if(state.activeView==='library')renderLibrary();
    if(state.activeView==='feed')renderFeed();
    renderBookSheet();
  });
window.addEventListener('blurb-spoiler-preference-changed',()=>{if(state.activeView==='home'||state.activeView==='feed')renderFeed();});
  $('#libraryContent').addEventListener('click',e=>{if(e.target.closest('[data-go-discover]'))showView('discover');});
  installFeedReelPaging();
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
