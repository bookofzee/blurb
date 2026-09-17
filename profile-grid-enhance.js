import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';
import('/share-menu.js?v=1').catch(console.error);
const supabase=createClient('https://ndinulaqwixbmgjhrhdo.supabase.co','sb_publishable__zMSwgf2znc_n8927aheRw_PiWY5BL1');
const escapeHtml=(value='')=>String(value).replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]||c));
const palettes=[['#6f324c','#15101b'],['#263d5b','#10131d'],['#69532c','#18140d'],['#24463e','#0d1715'],['#5b2a2a','#160d0d'],['#47345f','#120f1a'],['#273c53','#0c1118'],['#684639','#17100d']];
const paletteFor=key=>palettes[Math.abs([...String(key)].reduce((a,c)=>a+c.charCodeAt(0),0))%palettes.length];
let busy=false;
function toast(message){const el=document.querySelector('#toast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),1800);}
async function hydrateProfileGrid(){
  if(busy)return;
  const grid=document.querySelector('#profileContent .profile-grid');
  if(!grid||grid.dataset.enhanced==='1')return;
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.user)return;
  busy=true;
  try{
    const {data:posts,error}=await supabase.from('blurb_posts').select('id,media_url,thumbnail_url,post_type,caption,created_at,blurb_books(title,author)').eq('user_id',session.user.id).order('created_at',{ascending:false}).limit(30);
    if(error)throw error;
    grid.dataset.enhanced='1';
    grid.innerHTML=(posts||[]).map(post=>{
      const title=post.blurb_books?.title||post.caption||'Blurb';
      const [a,b]=paletteFor(post.id);
      const media=post.media_url||post.thumbnail_url;
      const visual=media?(post.post_type==='video'?`<video src="${escapeHtml(media)}" muted playsinline preload="metadata"></video>`:`<img src="${escapeHtml(media)}" alt="${escapeHtml(title)}" loading="lazy" />`):`<div class="profile-media-fallback" style="--card-a:${a};--card-b:${b}">${escapeHtml(title)}</div>`;
      return `<article class="profile-post profile-media-tile" data-profile-post="${post.id}">${visual}<div class="profile-tile-title">${escapeHtml(title)}</div><button class="profile-delete-post" type="button" data-delete-profile-post="${post.id}" aria-label="Delete post">×</button></article>`;
    }).join('');
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
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',watch,{once:true}):watch();
