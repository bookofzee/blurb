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
    if(tile!==except)tile.classList.remove('controls-open');
  });
}
function bindLongPress(tile){
  let didLongPress=false;
  let startX=0;
  let startY=0;

  const clearPress=()=>{clearTimeout(longPressTimer);longPressTimer=null;};

  const beginPress=(x,y)=>{
    clearPress();
    didLongPress=false;
    startX=x;
    startY=y;
    longPressTimer=setTimeout(()=>{
      didLongPress=true;
      closeTileControls(tile);
      tile.classList.add('controls-open');
      navigator.vibrate?.(18);
    },520);
  };

  const movePress=(x,y)=>{
    if(Math.hypot(x-startX,y-startY)>10)clearPress();
  };

  tile.querySelectorAll('img').forEach(img=>{
    img.draggable=false;
    img.setAttribute('draggable','false');
  });

  tile.addEventListener('dragstart',e=>e.preventDefault());
  tile.addEventListener('contextmenu',e=>e.preventDefault());

  tile.addEventListener('pointerdown',e=>{
    if(e.target.closest('.profile-tile-controls'))return;
    beginPress(e.clientX,e.clientY);
  });

  tile.addEventListener('pointermove',e=>{
    if(!longPressTimer)return;
    movePress(e.clientX,e.clientY);
  });

  tile.addEventListener('pointerup',clearPress);
  tile.addEventListener('pointercancel',clearPress);
  tile.addEventListener('pointerleave',clearPress);

  tile.addEventListener('click',async e=>{
    if(e.target.closest('.profile-tile-controls'))return;

    e.preventDefault();
    e.stopPropagation();

    if(didLongPress){
      didLongPress=false;
      return;
    }

    if(tile.classList.contains('controls-open')){
      tile.classList.remove('controls-open');
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
        <span>Edit Blurb</span>
        <h3 id="profilePostEditTitle">Caption & profile cover</h3>
        <p>Only these details can be changed after posting.</p>
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

    modal.addEventListener('click',e=>{
      if(e.target.closest('[data-close-profile-edit]')){closeProfileEditModal();return;}
      const state=modal._editState;
      if(!state)return;

      if(e.target.closest('#profileEditUseBookCover')){
        const url=state.post.blurb_books?.cover_url;
        if(!url)return;
        state.mode='book';
        state.coverUrl=url;
        state.coverFile=null;
        modal.querySelector('#profileEditCoverFile').value='';
        paintProfileEditCover(modal,url);
        modal.querySelector('#profileEditRemoveCover').disabled=false;
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
async function hydrateProfileGrid(){
  if(busy)return;
  const grid=document.querySelector('#profileContent .profile-grid');
  if(!grid||grid.dataset.enhanced==='1')return;
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.user)return;
  busy=true;
  try{
    const {data:posts,error}=await supabase.from('blurb_posts').select('id,media_url,thumbnail_url,post_type,caption,created_at,blurb_books(title,author,cover_url)').eq('user_id',session.user.id).order('created_at',{ascending:false}).limit(30);
    if(error)throw error;
    grid.dataset.enhanced='1';
    grid.innerHTML=(posts||[]).map(post=>{
      const title=post.blurb_books?.title||post.caption||'Blurb';
      const [a,b]=paletteFor(post.id);
      const cover=post.thumbnail_url||null;
      const media=cover||post.media_url;
      const visual=media?(cover?`<img src="${escapeHtml(cover)}" alt="${escapeHtml(title)}" loading="lazy" draggable="false" />`:(post.post_type==='video'?`<video src="${escapeHtml(media)}" muted playsinline preload="metadata"></video>`:`<img src="${escapeHtml(media)}" alt="${escapeHtml(title)}" loading="lazy" draggable="false" />`)):`<div class="profile-media-fallback" style="--card-a:${a};--card-b:${b}">${escapeHtml(title)}</div>`;
      return `<article class="profile-post profile-media-tile" data-profile-post="${post.id}" data-caption="${escapeHtml(post.caption||'')}">${visual}<div class="profile-tile-title">${escapeHtml(title)}</div><div class="profile-tile-controls" aria-hidden="true"><button class="profile-edit-post" type="button" data-edit-profile-post="${post.id}">Edit</button><button class="profile-delete-post" type="button" data-delete-profile-post="${post.id}">Delete</button></div></article>`;
    }).join('');
    grid.querySelectorAll('.profile-media-tile').forEach(bindLongPress);
    const postMap=new Map((posts||[]).map(post=>[post.id,post]));
    grid.querySelectorAll('[data-edit-profile-post]').forEach(btn=>btn.addEventListener('click',e=>{
      e.stopPropagation();
      const id=btn.dataset.editProfilePost;
      const tile=btn.closest('.profile-media-tile');
      const post=postMap.get(id);
      if(!post)return;
      tile?.classList.remove('controls-open');
      openProfileEditModal(post,session,grid);
    }));
    grid.querySelectorAll('[data-delete-profile-post]').forEach(btn=>btn.addEventListener('click',async e=>{
      e.stopPropagation();
      const id=btn.dataset.deleteProfilePost;
      const tile=btn.closest('.profile-media-tile');
      if(!confirm('Delete this Blurb?'))return;
      tile?.classList.add('deleting');
      const {error:deleteError}=await supabase.from('blurb_posts').delete().eq('id',id).eq('user_id',session.user.id);
      if(deleteError){tile?.classList.remove('deleting');toast('Couldn’t delete that Blurb');return;}
      tile?.remove();toast('Blurb deleted');
    }));
  }catch(err){console.error('Profile preview upgrade failed',err);}finally{busy=false;}
}
function watch(){
  hydrateProfileGrid();
  const root=document.querySelector('#profileContent');
  if(root)new MutationObserver(()=>{const grid=root.querySelector('.profile-grid');if(grid&&!grid.dataset.enhanced)hydrateProfileGrid();}).observe(root,{childList:true,subtree:true});
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.profile-media-tile'))closeTileControls();});
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',watch,{once:true}):watch();
