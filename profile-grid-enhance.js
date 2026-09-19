import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';
import('/share-menu.js?v=1').catch(console.error);
const supabase=createClient('https://ndinulaqwixbmgjhrhdo.supabase.co','sb_publishable__zMSwgf2znc_n8927aheRw_PiWY5BL1');
const escapeHtml=(value='')=>String(value).replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]||c));
const palettes=[['#6f324c','#15101b'],['#263d5b','#10131d'],['#69532c','#18140d'],['#24463e','#0d1715'],['#5b2a2a','#160d0d'],['#47345f','#120f1a'],['#273c53','#0c1118'],['#684639','#17100d']];
const paletteFor=key=>palettes[Math.abs([...String(key)].reduce((a,c)=>a+c.charCodeAt(0),0))%palettes.length];
let busy=false;
let longPressTimer=null;
function closeTileControls(except=null){
  document.querySelectorAll('.profile-media-tile.controls-open').forEach(tile=>{
    if(tile!==except){
      tile.classList.remove('controls-open');
      const menu=tile.querySelector('.profile-card-menu-toggle');
      if(menu){
        menu.textContent='•••';
        menu.setAttribute('aria-expanded','false');
        menu.setAttribute('aria-label','Blurb options');
      }
    }
  });
}
function bindProfileTile(tile){
  tile.querySelectorAll('img').forEach(img=>{
    img.draggable=false;
    img.setAttribute('draggable','false');
  });

  tile.addEventListener('dragstart',e=>e.preventDefault());
  tile.addEventListener('contextmenu',e=>e.preventDefault());

  tile.addEventListener('click',async e=>{
    if(e.target.closest('.profile-card-menu-toggle,.profile-tile-controls'))return;

    e.preventDefault();
    e.stopPropagation();

    if(tile.classList.contains('controls-open')){
      tile.classList.remove('controls-open');
      const menu=tile.querySelector('.profile-card-menu-toggle');
      if(menu){
        menu.textContent='•••';
        menu.setAttribute('aria-expanded','false');
        menu.setAttribute('aria-label','Blurb options');
      }
      return;
    }

    const postId=tile.dataset.profilePost;
    if(postId&&typeof window.openBlurbPost==='function'){
      const opened=await window.openBlurbPost(postId);
      if(opened)return;
    }

    toast('Couldn’t open that Blurb');
  });
}
function toast(message){const el=document.querySelector('#toast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),1800);}

async function uploadProfileCover(file,userId){
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
  const path=`${userId}/profile-cover-${crypto.randomUUID?.()||Date.now()}.${ext}`;
  const {error}=await supabase.storage.from('blurb-media').upload(path,file,{contentType:file.type||'image/jpeg',upsert:false});
  if(error)throw error;
  const {data}=supabase.storage.from('blurb-media').getPublicUrl(path);
  return data?.publicUrl||null;
}

async function makeSquareBookCoverFile(url,title='book-cover'){
  const response=await fetch(url,{mode:'cors'});
  if(!response.ok)throw new Error('Could not load book cover');
  const sourceBlob=await response.blob();
  const objectUrl=URL.createObjectURL(sourceBlob);
  try{
    const image=await new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>resolve(img);
      img.onerror=()=>reject(new Error('Could not read book cover'));
      img.src=objectUrl;
    });
    const size=1080;
    const canvas=document.createElement('canvas');
    canvas.width=size;
    canvas.height=size;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('Canvas unavailable');
    ctx.fillStyle='#f7eee3';
    ctx.fillRect(0,0,size,size);
    const maxW=size*.62;
    const maxH=size*.82;
    const scale=Math.min(maxW/image.naturalWidth,maxH/image.naturalHeight);
    const w=image.naturalWidth*scale;
    const h=image.naturalHeight*scale;
    const x=(size-w)/2;
    const y=(size-h)/2;
    ctx.save();
    ctx.shadowColor='rgba(72,45,31,.28)';
    ctx.shadowBlur=34;
    ctx.shadowOffsetY=18;
    ctx.fillStyle='#fffaf3';
    ctx.fillRect(x,y,w,h);
    ctx.drawImage(image,x,y,w,h);
    ctx.restore();
    const blob=await new Promise((resolve,reject)=>{
      canvas.toBlob(value=>value?resolve(value):reject(new Error('Could not make square cover')),'image/jpeg',.92);
    });
    const safeName=String(title||'book-cover').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'book-cover';
    return new File([blob],`${safeName}-square.jpg`,{type:'image/jpeg'});
  }finally{
    URL.revokeObjectURL(objectUrl);
  }
}

function ensureProfileEditModal(){
  let modal=document.querySelector('#profilePostEditModal');
  if(modal)return modal;
  modal=document.createElement('div');
  modal.id='profilePostEditModal';
  modal.className='profile-post-edit-modal';
  modal.hidden=true;
  modal.innerHTML=`
    <div class="profile-post-edit-backdrop" data-close-profile-edit></div>
    <section class="profile-post-edit-card" role="dialog" aria-modal="true" aria-labelledby="profilePostEditTitle">
      <button type="button" class="profile-post-edit-close" data-close-profile-edit aria-label="Close">×</button>
      <div class="profile-post-edit-heading">
        <h3 id="profilePostEditTitle">Edit blurb</h3>
      </div>

      <label class="profile-edit-caption-label" for="profileEditCaption">Caption</label>
      <textarea id="profileEditCaption" maxlength="180" placeholder="Add a caption…"></textarea>
      <div class="profile-edit-caption-count"><span id="profileEditCaptionCount">0</span>/180</div>

      <div class="profile-edit-cover-section">
        <span class="profile-edit-section-label">Profile cover</span>
        <div class="profile-edit-cover-preview" id="profileEditCoverPreview"><span>No cover</span></div>
        <div class="profile-edit-cover-actions">
          <label class="profile-edit-cover-upload">
            <input id="profileEditCoverFile" type="file" accept="image/jpeg,image/png,image/webp" />
            <span>Upload new</span>
          </label>
          <button type="button" id="profileEditUseBookCover">Use book cover</button>
          <button type="button" id="profileEditRemoveCover">Remove cover</button>
        </div>
      </div>

      <div class="profile-post-edit-actions">
        <button type="button" class="secondary-button" data-close-profile-edit>Cancel</button>
        <button type="button" class="primary-button" id="profileEditSave">Save changes</button>
      </div>
      <p class="form-status" id="profileEditStatus"></p>
    </section>`;
  document.body.appendChild(modal);
  return modal;
}

function closeProfileEditModal(){
  const modal=document.querySelector('#profilePostEditModal');
  if(!modal)return;
  modal.hidden=true;
  modal.dataset.postId='';
  modal._editState=null;
}

function paintProfileEditCover(modal,url){
  const preview=modal.querySelector('#profileEditCoverPreview');
  if(!preview)return;
  preview.innerHTML=url?`<img src="${escapeHtml(url)}" alt="Profile cover preview" />`:'<span>No cover</span>';
}

function openProfileEditModal(post,session,grid){
  const modal=ensureProfileEditModal();
  const caption=modal.querySelector('#profileEditCaption');
  const count=modal.querySelector('#profileEditCaptionCount');
  const file=modal.querySelector('#profileEditCoverFile');
  const useBook=modal.querySelector('#profileEditUseBookCover');
  const remove=modal.querySelector('#profileEditRemoveCover');
  const save=modal.querySelector('#profileEditSave');
  const status=modal.querySelector('#profileEditStatus');

  modal.dataset.postId=post.id;
  modal._editState={
    post,
    session,
    grid,
    mode:'existing',
    coverUrl:post.thumbnail_url||null,
    coverFile:null
  };
  caption.value=post.caption||'';
  count.textContent=String(caption.value.length);
  file.value='';
  status.textContent='';
  status.className='form-status';
  paintProfileEditCover(modal,post.thumbnail_url||null);

  useBook.disabled=!post.blurb_books?.cover_url;
  remove.disabled=!post.thumbnail_url;

  modal.hidden=false;
  caption.focus();

  if(!modal.dataset.bound){
    modal.dataset.bound='1';

    modal.addEventListener('click',async e=>{
      if(e.target.closest('[data-close-profile-edit]')){closeProfileEditModal();return;}
      const state=modal._editState;
      if(!state)return;

      if(e.target.closest('#profileEditUseBookCover')){
        const url=state.post.blurb_books?.cover_url;
        if(!url)return;

        const button=modal.querySelector('#profileEditUseBookCover');
        const status=modal.querySelector('#profileEditStatus');
        button.disabled=true;
        status.textContent='Making square cover…';
        status.className='form-status';

        try{
          const squareFile=await makeSquareBookCoverFile(url,state.post.blurb_books?.title||'book-cover');
          if(modal._editState!==state)return;
          if(state.coverUrl?.startsWith?.('blob:'))URL.revokeObjectURL(state.coverUrl);
          state.mode='upload';
          state.coverFile=squareFile;
          state.coverUrl=URL.createObjectURL(squareFile);
          modal.querySelector('#profileEditCoverFile').value='';
          paintProfileEditCover(modal,state.coverUrl);
          modal.querySelector('#profileEditRemoveCover').disabled=false;
          status.textContent='Square cover ready.';
        }catch(err){
          console.error('Could not make square book cover',err);
          status.textContent='Couldn’t make a square cover from that image.';
          status.className='form-status error';
        }finally{
          button.disabled=false;
        }
        return;
      }

      if(e.target.closest('#profileEditRemoveCover')){
        state.mode='remove';
        state.coverUrl=null;
        state.coverFile=null;
        modal.querySelector('#profileEditCoverFile').value='';
        paintProfileEditCover(modal,null);
        modal.querySelector('#profileEditRemoveCover').disabled=true;
        return;
      }
    });

    modal.querySelector('#profileEditCaption').addEventListener('input',e=>{
      modal.querySelector('#profileEditCaptionCount').textContent=String(e.target.value.length);
    });

    modal.querySelector('#profileEditCoverFile').addEventListener('change',e=>{
      const state=modal._editState;
      const selected=e.target.files?.[0];
      if(!state||!selected)return;
      if(selected.size>15*1024*1024){
        toast('Cover image must be under 15 MB');
        e.target.value='';
        return;
      }
      state.mode='upload';
      state.coverFile=selected;
      state.coverUrl=URL.createObjectURL(selected);
      paintProfileEditCover(modal,state.coverUrl);
      modal.querySelector('#profileEditRemoveCover').disabled=false;
    });

    modal.querySelector('#profileEditSave').addEventListener('click',async()=>{
      const state=modal._editState;
      if(!state)return;
      const saveButton=modal.querySelector('#profileEditSave');
      const status=modal.querySelector('#profileEditStatus');
      const caption=modal.querySelector('#profileEditCaption').value.trim();

      saveButton.disabled=true;
      status.textContent='Saving…';
      status.className='form-status';
      try{
        let thumbnailUrl=state.post.thumbnail_url||null;
        if(state.mode==='upload'&&state.coverFile){
          thumbnailUrl=await uploadProfileCover(state.coverFile,state.session.user.id);
        }else if(state.mode==='book'){
          thumbnailUrl=state.post.blurb_books?.cover_url||null;
        }else if(state.mode==='remove'){
          thumbnailUrl=null;
        }

        const {error}=await supabase.from('blurb_posts')
          .update({caption,thumbnail_url:thumbnailUrl})
          .eq('id',state.post.id)
          .eq('user_id',state.session.user.id);
        if(error)throw error;

        closeProfileEditModal();
        state.grid.dataset.enhanced='';
        state.grid.innerHTML='';
        await hydrateProfileGrid();
        toast('Blurb updated');
      }catch(err){
        console.error('Could not edit Blurb',err);
        status.textContent='Couldn’t save those changes.';
        status.className='form-status error';
      }finally{
        saveButton.disabled=false;
      }
    });
  }
}
let activeProfileTab='blurbs';

function profileCardDate(iso){
  if(!iso)return '';
  const d=new Date(iso);
  if(Number.isNaN(d.getTime()))return '';
  const diff=Math.max(0,Date.now()-d.getTime());
  const days=Math.floor(diff/86400000);
  if(days===0)return 'Today';
  if(days===1)return '1d ago';
  if(days<14)return `${days}d ago`;
  return d.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
}

function profileCardExcerpt(value=''){
  const text=String(value||'').trim().replace(/\s+/g,' ');
  return text.length>86?`${text.slice(0,83)}…`:text;
}

async function profilePostsForTab(session,tab){
  const select='id,user_id,media_url,thumbnail_url,post_type,caption,rating,created_at,status,blurb_books(title,author,cover_url)';

  if(tab==='blurbs'){
    const {data,error}=await supabase.from('blurb_posts')
      .select(select)
      .eq('user_id',session.user.id)
      .eq('status','published')
      .order('created_at',{ascending:false})
      .limit(40);
    if(error)throw error;
    return data||[];
  }

  const table=tab==='liked'?'blurb_likes':'blurb_saved_posts';
  const {data:links,error:linkError}=await supabase.from(table)
    .select('post_id,created_at')
    .eq('user_id',session.user.id)
    .order('created_at',{ascending:false})
    .limit(60);

  if(linkError)throw linkError;
  const ids=(links||[]).map(x=>x.post_id).filter(Boolean);
  if(!ids.length)return [];

  let query=supabase.from('blurb_posts')
    .select(select)
    .in('id',ids)
    .eq('status','published');

  if(tab==='liked'){
    query=query.neq('user_id',session.user.id);
  }

  const {data,error}=await query;

  if(error)throw error;
  const byId=new Map((data||[]).map(post=>[String(post.id),post]));
  return ids.map(id=>byId.get(String(id))).filter(Boolean);
}

function profileCardMarkup(post,session,tab){
  const book=post.blurb_books||{};
  const title=book.title||'Untitled Blurb';
  const author=book.author||'';
  const [a,b]=paletteFor(post.id);
  const cover=book.cover_url||post.thumbnail_url||null;
  const media=cover||post.media_url||null;
  const own=String(post.user_id||'')===String(session.user.id||'')&&tab==='blurbs';

  let visual='';
  if(media){
    const useVideo=!cover&&post.post_type==='video'&&post.media_url;
    visual=useVideo
      ?`<video src="${escapeHtml(post.media_url)}" muted playsinline preload="metadata"></video>`
      :`<img src="${escapeHtml(media)}" alt="${escapeHtml(title)}" loading="lazy" draggable="false" />`;
  }else{
    visual=`<div class="profile-media-fallback" style="--card-a:${a};--card-b:${b}"><span>${escapeHtml(title)}</span></div>`;
  }

  const controls=own?`
    <div class="profile-tile-controls" aria-hidden="true">
      <button class="profile-edit-post" type="button" data-edit-profile-post="${post.id}" aria-label="Edit Blurb">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4.2L19 9.2 14.8 5 4 15.8V20Z"/><path d="m13.7 6.1 4.2 4.2"/></svg>
      </button>
      <button class="profile-delete-post" type="button" data-delete-profile-post="${post.id}" aria-label="Delete Blurb">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14"/><path d="M9 7V4h6v3"/><path d="M7 7l1 13h8l1-13"/><path d="M10 11v5M14 11v5"/></svg>
      </button>
    </div>`: '';

  const menu=own?`<button class="profile-card-menu-toggle" type="button" data-profile-menu="${post.id}" aria-label="Blurb options" aria-expanded="false">•••</button>`:'';

  const rating=Number(post.rating||0);
  return `<article class="profile-post profile-post-card profile-media-tile" data-profile-post="${post.id}">
    <div class="profile-card-media">
      ${visual}
      <span class="profile-card-heart ${tab==='liked'?'active':''}" aria-hidden="true">${tab==='liked'?'♥':'♡'}</span>
    </div>
    <div class="profile-card-copy">
      <div class="profile-card-heading">
        <strong>${escapeHtml(title)}</strong>
        ${rating?`<span class="profile-card-rating">★ ${rating.toFixed(1)}</span>`:''}
      </div>
      ${author?`<small class="profile-card-author">${escapeHtml(author)}</small>`:''}
      <div class="profile-card-meta"><span>${profileCardDate(post.created_at)}</span>${menu}</div>
    </div>
    ${controls}
  </article>`;
}

function bindProfileCardControls(grid,posts,session,tab){
  const postMap=new Map((posts||[]).map(post=>[String(post.id),post]));

  grid.querySelectorAll('.profile-media-tile').forEach(bindProfileTile);

  grid.querySelectorAll('[data-profile-menu]').forEach(button=>button.addEventListener('click',e=>{
    e.preventDefault();
    e.stopPropagation();

    const tile=button.closest('.profile-media-tile');
    if(!tile)return;

    const opening=!tile.classList.contains('controls-open');
    closeTileControls(opening?tile:null);

    if(opening){
      tile.classList.remove('controls-open');
      void tile.offsetWidth;
      tile.classList.add('controls-open');
      button.textContent='×';
      button.setAttribute('aria-expanded','true');
      button.setAttribute('aria-label','Cancel');
      navigator.vibrate?.(12);
    }else{
      tile.classList.remove('controls-open');
      button.textContent='•••';
      button.setAttribute('aria-expanded','false');
      button.setAttribute('aria-label','Blurb options');
    }
  }));

  grid.querySelectorAll('[data-edit-profile-post]').forEach(btn=>btn.addEventListener('click',e=>{
    e.stopPropagation();
    const id=btn.dataset.editProfilePost;
    const tile=btn.closest('.profile-media-tile');
    const post=postMap.get(String(id));
    if(!post)return;
    tile?.classList.remove('controls-open');
    const menu=tile?.querySelector('.profile-card-menu-toggle');
    if(menu){
      menu.textContent='•••';
      menu.setAttribute('aria-expanded','false');
      menu.setAttribute('aria-label','Blurb options');
    }
    openProfileEditModal(post,session,grid);
  }));

  grid.querySelectorAll('[data-delete-profile-post]').forEach(btn=>btn.addEventListener('click',async e=>{
    e.stopPropagation();
    const id=btn.dataset.deleteProfilePost;
    const tile=btn.closest('.profile-media-tile');
    if(!confirm('Delete this Blurb?'))return;

    tile?.classList.add('deleting');
    const {error}=await supabase.from('blurb_posts')
      .delete()
      .eq('id',id)
      .eq('user_id',session.user.id);

    if(error){
      tile?.classList.remove('deleting');
      toast('Couldn’t delete that Blurb');
      return;
    }

    tile?.remove();
    const count=document.querySelector('[data-profile-stat="blurbs"] strong');
    if(count)count.textContent=String(Math.max(0,Number(count.textContent||0)-1));
    toast('Blurb deleted');
  }));
}

async function hydrateProfileGrid(tab=activeProfileTab,force=false){
  const grid=document.querySelector('#profileContent .profile-grid');
  if(!grid)return;
  if(grid.dataset.loading==='1')return;
  if(!force&&grid.dataset.enhanced===tab)return;

  grid.dataset.loading='1';

  try{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.user)return;

    activeProfileTab=tab;
    grid.dataset.enhanced='';
    grid.innerHTML='<div class="profile-grid-loading">Gathering your books…</div>';

    const posts=await profilePostsForTab(session,tab);

    if(!document.body.contains(grid))return;

    grid.dataset.enhanced=tab;

    if(!posts.length){
      const title=tab==='liked'?'Nothing liked yet':tab==='saved'?'Nothing saved yet':'No Blurbs yet';
      const copy=tab==='liked'
        ? 'Tap the heart on a Blurb and it’ll live here.'
        : tab==='saved'
          ? 'Saved Blurbs will be waiting for you here.'
          : 'Your published Blurbs will appear here.';
      grid.innerHTML=`<div class="profile-tab-empty"><span>${tab==='liked'?'♡':tab==='saved'?'▱':'✦'}</span><strong>${title}</strong><p>${copy}</p></div>`;
      return;
    }

    grid.innerHTML=posts.map(post=>profileCardMarkup(post,session,tab)).join('');
    bindProfileCardControls(grid,posts,session,tab);
  }catch(err){
    console.error('Profile content failed',err);
    if(document.body.contains(grid)){
      grid.innerHTML='<div class="profile-tab-empty"><strong>Couldn’t load this section</strong><p>Try again in a moment.</p></div>';
    }
  }finally{
    if(document.body.contains(grid))grid.dataset.loading='0';
  }
}

function watch(){
  hydrateProfileGrid();

  const root=document.querySelector('#profileContent');
  if(root){
    new MutationObserver(()=>{
      const grid=root.querySelector('.profile-grid');
      if(grid&&grid.dataset.loading!=='1'&&!grid.dataset.enhanced){
        hydrateProfileGrid(activeProfileTab);
      }
    }).observe(root,{childList:true,subtree:true});
  }

  document.addEventListener('click',e=>{
    const tab=e.target.closest('#profileContent [data-profile-tab]');
    if(tab){
      e.preventDefault();
      activeProfileTab=tab.dataset.profileTab||'blurbs';
      document.querySelectorAll('#profileContent [data-profile-tab]').forEach(button=>{
        const active=button===tab;
        button.classList.toggle('active',active);
        button.setAttribute('aria-selected',String(active));
      });
      hydrateProfileGrid(activeProfileTab,true);
      return;
    }

    if(!e.target.closest('.profile-media-tile'))closeTileControls();
  });

  window.addEventListener('blurb-profile-rendered',()=>{
    activeProfileTab='blurbs';
    hydrateProfileGrid('blurbs',true);
  });
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',watch,{once:true}):watch();
