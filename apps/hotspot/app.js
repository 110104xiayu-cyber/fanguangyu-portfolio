const $ = (sel) => document.querySelector(sel);
const view = $('#view');

const state = {
  platform: 'douyin',
  categoryId: '',
  settings: {},
  analyses: [],
  topics: [],
  creatorWorks: [],
  creatorName: '',
  currentAnalysis: null,
};

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.status) throw new Error(data.error || `请求失败 ${res.status}`);
  return data;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2500);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function platformName(p) { return p === 'douyin' ? '抖音' : '小红书'; }

function fmtNum(n) {
  const v = Number(n);
  if (!v) return String(n ?? '');
  if (v >= 100000000) return (v / 100000000).toFixed(1) + '亿';
  if (v >= 10000) return (v / 10000).toFixed(1) + '万';
  return String(v);
}

function trackOf(t) {
  if (!t || !t.raw) return '';
  try {
    const r = typeof t.raw === 'string' ? JSON.parse(t.raw) : t.raw;
    return r && r.category ? String(r.category) : '';
  } catch {
    return '';
  }
}

function trackLabel(t) {
  const trk = trackOf(t);
  if (!trk) return '';
  return `红狐赛道：${esc(trk)} · 当天点赞第${esc(t.rank)}名 · 点赞 ${fmtNum(t.heat)}`;
}

async function confirmTikHub(feature, extra = {}) {
  let est;
  try {
    est = await api('/api/tikhub/estimate', { method: 'POST', body: JSON.stringify({ feature, ...extra }) });
  } catch (err) {
    toast(err.message);
    return false;
  }
  if (!est.enabled) {
    toast('TikHub 未开启：请先到「设置 → TikHub」填写 API Key 并开启');
    return false;
  }
  const { requests, costUsd, pricePerRequest } = est.estimate;
  return confirm(`本次操作将调用 ${requests} 次 TikHub 接口，约 $${costUsd.toFixed(4)}（单价 $${pricePerRequest}/次）。确认继续？`);
}

async function refreshTopics(showToast = true) {
  const btn = $('#btn-refresh');
  btn.disabled = true;
  btn.textContent = '刷新中…';
  try {
    const result = await api('/api/refresh', { method: 'POST', body: '{}' });
    const parts = Object.entries(result).map(([k, v]) => `${platformName(k)} ${typeof v === 'number' ? v : '失败'}`).join('，');
    if (showToast) toast(`刷新完成：${parts}`);
    await renderHome();
  } catch (err) {
    toast(`刷新失败：${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = '刷新';
  }
}

async function renderHome() {
  const s = await api('/api/settings');
  state.settings = s;
  const cats = await api('/api/categories');
  const catParam = state.categoryId ? `&category=${state.categoryId}` : '';
  const data = await api(`/api/topics?platform=${state.platform}${catParam}`);
  state.topics = data.topics;
  const catName = cats.find((c) => c.id === state.categoryId)?.name || '全部';
  view.innerHTML = `
    <div class="card source-card">
      <span class="source-title">数据源</span>
      <div class="source-opts">
        <button class="btn src ${s.douyinSource === 'redfox' ? 'active' : ''}" data-act="source" data-v="redfox">红狐·分领域视频</button>
        <button class="btn src ${s.douyinSource === 'redfox-hot' ? 'active' : ''}" data-act="source" data-v="redfox-hot">红狐·热点趋势</button>
        <button class="btn src ${s.douyinSource === 'douyin-cli' ? 'active' : ''}" data-act="source" data-v="douyin-cli">douyin-cli·免费</button>
        <button class="btn src ${s.douyinSource === '60s' ? 'active' : ''}" data-act="source" data-v="60s">60s·话题</button>
        ${s.tikhubEnabled === '1' ? `<button class="btn src ${s.douyinSource === 'tikhub' ? 'active' : ''}" data-act="source" data-v="tikhub">TikHub·按量付费</button>` : ''}
      </div>
      ${s.tikhubEnabled === '1' && s.douyinSource === 'tikhub' ? `
      <div class="source-opts" style="margin-top:8px">
        <span class="source-title">榜单</span>
        <button class="btn src ${s.tikhubDouyinBoard === 'video' ? 'active' : ''}" data-act="board" data-v="video">视频热榜</button>
        <button class="btn src ${s.tikhubDouyinBoard === 'lowfan' ? 'active' : ''}" data-act="board" data-v="lowfan">低粉爆款</button>
        <button class="btn src ${s.tikhubDouyinBoard === 'highlike' ? 'active' : ''}" data-act="board" data-v="highlike">高点赞率</button>
        <button class="btn src ${s.tikhubDouyinBoard === 'highplay' ? 'active' : ''}" data-act="board" data-v="highplay">高完播率</button>
      </div>` : ''}
    </div>
    <div class="tabs">
      <div class="tab ${state.platform === 'douyin' ? 'active' : ''}" data-act="platform" data-v="douyin">抖音</div>
      <div class="tab ${state.platform === 'xhs' ? 'active' : ''}" data-act="platform" data-v="xhs">小红书</div>
    </div>
    <div class="chips">
      <div class="chip ${state.categoryId === '' ? 'active' : ''}" data-act="category" data-v="">全部</div>
      ${cats.map((c) => `<div class="chip ${state.categoryId === c.id ? 'active' : ''}" data-act="category" data-v="${c.id}">${esc(c.name)}</div>`).join('')}
    </div>
    <div class="sec-title">${platformName(state.platform)} · ${esc(catName)} 最爆 TOP ${data.topics.length} <span class="badge">${esc(data.date || '暂无数据')}</span></div>
    ${data.topics.length === 0
      ? `<div class="empty">今天还没有数据，点右上角「刷新」抓取热榜</div>`
      : state.topics.map((t, i) => {
        const label = trackLabel(t) || `热度 ${esc(t.heat || '-')}${t.plays ? ` · 播放 ${fmtNum(t.plays)}` : ''}`;
        return `
        <div class="card topic" data-act="topic" data-i="${i}">
          <div class="rank">${t.rank}</div>
          <div class="body">
            <div class="title">${esc(t.title)}</div>
            <div class="meta">${label}</div>
          </div>
        </div>`;
      }).join('')}
  `;
}

function showTopic(t) {
  const name = platformName(state.platform);
  const label = trackLabel(t) || `热度 ${esc(t.heat || '-')}${t.plays ? ` · 播放 ${fmtNum(t.plays)}` : ''}`;
  view.innerHTML = `
    <button class="btn ghost" data-act="back">← 返回</button>
    <div class="sec-title">${esc(t.title)} <span class="badge">${name} · 第${t.rank}名</span></div>
    <div class="card">
      <p style="font-size:14px;color:var(--muted);margin-bottom:12px">${label}</p>
      ${t.link
        ? `<a class="btn big" href="${esc(t.link)}" target="_blank" rel="noopener">▶ 打开${name}看这个爆款视频</a>`
        : ''}
      <button class="btn big primary" data-act="dissect-topic" data-title="${esc(t.title)}">🤖 AI 拆解这个视频</button>
      ${t.link ? `<button class="btn big" data-act="tk-comments" data-link="${esc(t.link)}" data-title="${esc(t.title)}">💬 TikHub 评论挖掘</button>` : ''}
      ${t.link ? `<button class="btn big" data-act="tk-detail" data-link="${esc(t.link)}" data-title="${esc(t.title)}">📊 查看真实数据（点赞/播放/评论）</button>` : ''}
    </div>
  `;
}

function showStats(r, title) {
  const s = r.detail.stats || {};
  const rows = [
    ['播放', s.play_count ?? s.playCount ?? ''],
    ['点赞', s.digg_count ?? s.like_count ?? s.liked_count ?? ''],
    ['评论', s.comment_count ?? s.commented_count ?? ''],
    ['分享', s.share_count ?? s.shared_count ?? ''],
    ['收藏', s.collect_count ?? s.collected_count ?? ''],
  ].filter(([, v]) => v !== '' && v !== undefined && v !== null && v !== 0);
  view.innerHTML = `
    <button class="btn ghost" data-act="back">← 返回</button>
    <div class="sec-title">真实数据：${esc(title)} <span class="badge">${r.usage.requests} 次 · $${Number(r.usage.costUsd || 0).toFixed(4)}</span></div>
    <div class="card" style="display:flex;flex-wrap:wrap;gap:10px">
      ${rows.map(([k, v]) => `
        <div style="flex:1;min-width:90px;text-align:center;padding:10px;border:1px solid var(--line);border-radius:8px">
          <div style="font-size:16px;font-weight:600">${fmtNum(v)}</div>
          <div style="font-size:12px;color:var(--muted)">${k}</div>
        </div>`).join('')}
    </div>
    ${r.detail.author ? `<p style="font-size:13px;color:var(--muted);margin-top:10px">博主：${esc(r.detail.author)}</p>` : ''}
  `;
}

async function renderDetail(id) {
  const a = await api(`/api/analyses/${id}`);
  state.currentAnalysis = a;
  const videoUrl = a.url || (a.videoId
    ? (a.platform === 'xhs' ? `https://www.xiaohongshu.com/explore/${a.videoId}` : `https://www.douyin.com/video/${a.videoId}`)
    : '');
  view.innerHTML = `
    <button class="btn ghost" data-act="back">← 返回</button>
    <div class="sec-title">${esc(a.videoTitle || '未命名视频')} <span class="badge">${platformName(a.platform)}</span> ${a.favorite ? '⭐' : ''}</div>
    ${videoUrl ? `<a class="btn big" href="${esc(videoUrl)}" target="_blank" rel="noopener">▶ 打开爆款视频</a>` : ''}
    ${a.videoAuthor ? `<p style="font-size:13px;color:var(--muted)">博主：${esc(a.videoAuthor)}</p>` : ''}
    ${a.videoDescription ? `<p style="font-size:13px;color:var(--muted)">${esc(a.videoDescription)}</p>` : ''}
    ${a.status === 'failed' ? `<div class="error-box">拆解失败：${esc(a.error)} <button class="btn" data-act="retry" data-id="${a.id}">重试</button></div>` : ''}
    ${a.basic?.hookSummary ? `<div class="card hook-card">🪝 一句话钩子：${esc(a.basic.hookSummary)}</div>` : ''}
    <div class="sec-title">🎬 拍摄逻辑</div>
    <div class="card">${bullets(a.shooting)}</div>
    <div class="sec-title">💥 爆点逻辑</div>
    <div class="card">${bullets(a.viral)}</div>
    <div class="sec-title">✂️ 剪辑逻辑</div>
    <div class="card">${bullets(a.editing)}</div>
    <div class="sec-title">🪝 预埋钩子</div>
    <div class="card"><ul class="hooks">${(a.hooks || []).map((h) => `<li>${esc(h)}</li>`).join('') || '（暂无）'}</ul></div>
    <div class="sec-title">💡 爆点灵感（可直接开拍）</div>
    ${(a.inspirations || []).map((x, i) => `<div class="inspiration"><span class="n">${i + 1}</span>${esc(x)}</div>`).join('') || '<div class="card">（暂无）</div>'}
    <div style="margin-top:14px;display:flex;gap:8px">
      <button class="btn" data-act="redissect" data-id="${a.id}">重新拆解</button>
      <button class="btn" data-act="fav" data-id="${a.id}" data-fav="${a.favorite ? 0 : 1}">${a.favorite ? '取消收藏' : '收藏'}</button>
      ${videoUrl ? `<button class="btn" data-act="tk-comments-detail">💬 TikHub 评论挖掘</button>` : ''}
      <a class="btn" style="text-decoration:none" href="/api/report" download>下载今日日报</a>
    </div>
  `;
}

function bullets(text) {
  const lines = String(text || '').split(/\n+/).map((x) => x.trim()).filter(Boolean);
  if (lines.length <= 1) return esc(text) || '（暂无）';
  return `<ul class="bullets">${lines.map((x) => `<li>${esc(x.replace(/^[-•]\s*/, ''))}</li>`).join('')}</ul>`;
}

async function renderAnalyses() {
  const list = await api('/api/analyses');
  view.innerHTML = `
    <button class="btn ghost" data-act="back">← 返回</button>
    <div class="sec-title">我的拆解记录</div>
    ${list.length === 0
      ? `<div class="empty">还没有拆解记录。点「拆解视频」粘贴一条链接试试。</div>`
      : list.map((a) => `
        <div class="card topic" data-act="analysis" data-id="${a.id}">
          <div class="body">
            <div class="title">${esc(a.videoTitle || '未命名视频')} ${a.favorite ? '⭐' : ''}</div>
            <div class="meta">${platformName(a.platform)} · ${a.status === 'done' ? `已拆解 · ${a.confidence}` : a.status === 'failed' ? '拆解失败' : '处理中'} · ${esc((a.updatedAt || '').slice(0, 16).replace('T', ' '))}</div>
          </div>
        </div>`).join('')}
  `;
}

async function renderDissect(prefill = {}) {
  const s = await api('/api/settings');
  view.innerHTML = `
    <button class="btn ghost" data-act="back">← 返回</button>
    <div class="sec-title">粘贴视频链接，AI 四维拆解</div>
    <div class="card">
      <div class="field">
        <label>平台</label>
        <select id="f-platform">
          <option value="douyin" ${prefill.platform === 'xhs' ? '' : 'selected'}>抖音</option>
          <option value="xhs" ${prefill.platform === 'xhs' ? 'selected' : ''}>小红书</option>
        </select>
      </div>
      <div class="field">
        <label>分享链接（抖音/小红书 App 复制，可留空）</label>
        <input id="f-url" placeholder="https://v.douyin.com/… 或 https://www.xiaohongshu.com/…" value="${esc(prefill.url || '')}">
      </div>
      <div class="field">
        <label>标题</label>
        <input id="f-title" value="${esc(prefill.title || '')}" placeholder="视频标题或话题名">
      </div>
      <div class="field">
        <label>博主（选填）</label>
        <input id="f-author" value="${esc(prefill.author || '')}" placeholder="博主名字">
      </div>
      <div class="field">
        <label>描述/文案（选填，粘贴视频简介或你自己整理的要点）</label>
        <textarea id="f-desc">${esc(prefill.description || '')}</textarea>
      </div>
      <div class="field">
        <label>热评摘录（选填，粘贴几条高赞评论，逗号分隔）</label>
        <textarea id="f-comments">${esc(prefill.comments || '')}</textarea>
      </div>
      ${s.tikhubEnabled === '1' ? `
      <div class="settings-row">
        <label style="font-size:13px;color:var(--muted)">用 TikHub 自动拉取真实标题/作者/评论（约 2 次请求，按量付费）</label>
        <input type="checkbox" id="f-tk" checked>
      </div>` : ''}
      <button class="btn primary" id="f-submit" style="width:100%">开始拆解</button>
    </div>
  `;
  $('#f-submit').addEventListener('click', async () => {
    const btn = $('#f-submit');
    btn.disabled = true;
    btn.textContent = '拆解中（约 30 秒）…';
    try {
      let useTk = $('#f-tk') ? $('#f-tk').checked : false;
      if (useTk) {
        const ok = await confirmTikHub('dissect');
        if (!ok) useTk = false;
      }
      const a = await api('/api/analyze', {
        method: 'POST',
        body: JSON.stringify({
          platform: $('#f-platform').value,
          url: $('#f-url').value.trim(),
          title: $('#f-title').value.trim(),
          author: $('#f-author').value.trim(),
          description: $('#f-desc').value.trim(),
          comments: $('#f-comments').value.trim(),
          useTikHub: useTk,
        }),
      });
      renderDetail(a.id);
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
      btn.textContent = '开始拆解';
    }
  });
}

function renderCreator() {
  view.innerHTML = `
    <button class="btn ghost" data-act="back">← 返回</button>
    <div class="sec-title">博主拆解</div>
    <div class="card">
      <div class="field">
        <label>输入博主名字，或粘贴主页链接 / 抖音号</label>
        <input id="c-name" placeholder="例如：疯狂小杨哥，或 https://www.douyin.com/user/xxx">
      </div>
      <button class="btn primary" id="c-search" style="width:100%">查找博主作品</button>
      <button class="btn" id="c-similar" style="width:100%;margin-top:8px">对标账号分析（粉丝/互动/红狐指数）</button>
    </div>
    <div id="c-result"></div>
  `;
  $('#c-search').addEventListener('click', async () => {
    const name = $('#c-name').value.trim();
    if (!name) return toast('请输入博主名字或主页链接');
    const btn = $('#c-search');
    btn.disabled = true;
    btn.textContent = '查找中…';
    try {
      const isUrl = /douyin\.com|iesdouyin\.com/i.test(name) || (/^[A-Za-z0-9_\-]+$/.test(name) && name.length >= 6);
      const r = await api('/api/creator/search', {
        method: 'POST',
        body: JSON.stringify(isUrl ? { url: name } : { name }),
      });
      const fans = r.account.followerCount >= 10000
        ? (r.account.followerCount / 10000).toFixed(1) + '万'
        : String(r.account.followerCount || '0');
      state.creatorWorks = r.works;
      state.creatorName = r.account.nickname;
      $('#c-result').innerHTML = `
        <div class="card">
          <div class="sec-title">${esc(r.account.nickname)} <span class="badge">粉丝 ${fans}</span> <span class="badge">作品 ${r.account.awemeCount}</span>${r.searchFallback ? ' <span class="badge">已用作品搜索补全</span>' : ''}${r.cliFallback ? ' <span class="badge">已用 douyin-cli 补全</span>' : ''}</div>
          ${r.account.signature ? `<p style="font-size:13px;color:var(--muted)">${esc(r.account.signature)}</p>` : ''}
        </div>
        ${r.searchFallback && r.fallbackMixed ? `<div class="card" style="font-size:13px;color:var(--muted)">以下是按名字搜到的相关视频（可能包含其他博主），点开可拆解。</div>` : ''}
        <div class="sec-title">近期作品（点击拆解）</div>
        ${r.works.length === 0
          ? `<div class="error-box">暂时没找到这个博主的作品。试试：<br>1. 粘贴他的抖音主页链接再搜一次<br>2. 复制他任意一条视频链接，用「拆解视频」直接拆解</div>`
          : r.works.map((w, i) => `
            <div class="card topic" data-act="dissect-work" data-i="${i}">
              <div class="rank">${i + 1}</div>
              <div class="body">
                <div class="title">${esc(w.title)}</div>
                <div class="meta">点赞 ${esc(w.heat || '-')}${w.author && w.author !== r.account.nickname ? ` · 作者 ${esc(w.author)}` : ''}</div>
              </div>
            </div>`).join('')}
      `;
    } catch (err) {
      toast(err.message);
      $('#c-result').innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = '查找博主作品';
    }
  });
  $('#c-similar').addEventListener('click', async () => {
    const name = $('#c-name').value.trim();
    if (!name) return toast('请输入博主名字或主页链接');
    const btn = $('#c-similar');
    btn.disabled = true;
    btn.textContent = '分析中…';
    try {
      const isUrl = /douyin\.com|iesdouyin\.com/i.test(name) || (/^[A-Za-z0-9_\-]+$/.test(name) && name.length >= 6);
      const r = await api('/api/creator/similar', {
        method: 'POST',
        body: JSON.stringify(isUrl ? { url: name } : { name }),
      });
      renderSimilarResult(r);
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '对标账号分析（粉丝/互动/红狐指数）';
    }
  });
}

function renderSimilarResult(r) {
  const cur = r.current;
  const accountCard = (a, label) => {
    if (!a) return '';
    const works = a.works || [];
    return `
      <div class="card">
        <div class="sec-title">${esc(a.nickname || label)} <span class="badge">${esc(label)}</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:13px;color:var(--muted)">
          <span>粉丝 ${fmtNum(a.followerCount)}</span>
          <span>获赞 ${fmtNum(a.totalFavorited)}</span>
          <span>作品 ${fmtNum(a.awemeCount)}</span>
          ${a.redfoxIndex != null ? `<span>红狐指数 ${a.redfoxIndex}</span>` : ''}
          <span>近7天发布 ${fmtNum(a.awemeCountSeven)}</span>
          <span>近7天互动 ${fmtNum(a.interactiveCountSeven)}</span>
          ${a.interactiveCountThirty ? `<span>近30天互动 ${fmtNum(a.interactiveCountThirty)}</span>` : ''}
        </div>
        ${works.length === 0
          ? '<div style="font-size:12px;color:var(--muted);margin-top:6px">暂无作品数据</div>'
          : `<div style="margin-top:8px;border-top:1px solid var(--line);padding-top:8px">${works.slice(0, 5).map((w, i) => `
            <div class="card topic" data-act="sim-dissect" data-title="${esc(w.title)}" data-url="${esc(w.link)}" data-author="${esc(a.nickname || '')}">
              <div class="rank">${i + 1}</div>
              <div class="body">
                <div class="title">${esc(w.title)}</div>
                <div class="meta">播放 ${fmtNum(w.playCount)} · 点赞 ${fmtNum(w.diggCount)} · 评论 ${fmtNum(w.commentCount)}${w.link ? ` · <a href="${esc(w.link)}" target="_blank" rel="noopener">打开</a>` : ''}</div>
              </div>
            </div>`).join('')}</div>`}
      </div>`;
  };
  view.innerHTML = `
    <button class="btn ghost" data-act="back">← 返回</button>
    <div class="sec-title">对标账号分析</div>
    ${accountCard(cur, '查询账号')}
    <div class="sec-title">对标账号（${r.benchmark.length}）</div>
    ${r.benchmark.length === 0 ? '<div class="empty">暂无对标账号数据</div>' : r.benchmark.map((a, i) => accountCard(a, `对标 ${i + 1}`)).join('')}
    <div class="sec-title">头部账号（${r.top.length}）</div>
    ${r.top.length === 0 ? '<div class="empty">暂无头部账号数据</div>' : r.top.map((a, i) => accountCard(a, `头部 ${i + 1}`)).join('')}
  `;
}

async function renderTikHubSearch() {
  const s = await api('/api/settings');
  view.innerHTML = `
    <button class="btn ghost" data-act="back">← 返回</button>
    <div class="sec-title">TikHub 关键词搜索（按量付费）</div>
    <div class="card">
      ${s.tikhubEnabled !== '1' ? `<div class="error-box">TikHub 未开启：请先到「设置 → TikHub」填写 API Key 并开启。</div>` : ''}
      <div class="field">
        <label>平台</label>
        <select id="tk-platform">
          <option value="douyin">抖音</option>
          <option value="xhs">小红书</option>
        </select>
      </div>
      <div class="field">
        <label>关键词（例如：护肤、宠物、AI 工具）</label>
        <input id="tk-keyword" placeholder="输入想研究的选题关键词">
      </div>
      <div class="field">
        <label>页数（每页约 20 条，页数越多越贵）</label>
        <select id="tk-pages">
          <option value="1">1 页</option>
          <option value="2">2 页</option>
          <option value="3">3 页</option>
        </select>
      </div>
      <button class="btn primary" id="tk-submit" style="width:100%">预估费用并搜索</button>
    </div>
    <div id="tk-result"></div>
  `;
  $('#tk-submit').addEventListener('click', async () => {
    const keyword = $('#tk-keyword').value.trim();
    if (!keyword) return toast('请输入关键词');
    const pages = Number($('#tk-pages').value) || 1;
    const ok = await confirmTikHub('search', { pages });
    if (!ok) return;
    const btn = $('#tk-submit');
    btn.disabled = true;
    btn.textContent = '搜索中…';
    try {
      const r = await api('/api/tikhub/search', {
        method: 'POST',
        body: JSON.stringify({ platform: $('#tk-platform').value, keyword, pages }),
      });
      renderTikHubResults(r);
    } catch (err) {
      $('#tk-result').innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = '预估费用并搜索';
    }
  });
}

function renderTikHubResults(r) {
  const name = r.platform === 'xhs' ? '小红书' : '抖音';
  $('#tk-result').innerHTML = `
    <div class="sec-title">${name}「${esc(r.keyword)}」搜索结果 <span class="badge">${r.items.length} 条</span></div>
    <div style="font-size:13px;color:var(--muted);margin-bottom:8px">本次已调用 ${r.usage.requests} 次，约 $${Number(r.usage.costUsd || 0).toFixed(4)}</div>
    ${r.items.length === 0
      ? `<div class="empty">没有结果，换个关键词试试</div>`
      : r.items.map((w, i) => `
        <div class="card topic" data-act="tk-dissect" data-platform="${r.platform}" data-title="${esc(w.title)}" data-url="${esc(w.link)}" data-author="${esc(w.author || '')}">
          <div class="rank">${i + 1}</div>
          <div class="body">
            <div class="title">${esc(w.title)}</div>
            <div class="meta">热度 ${esc(w.heat || '-')}${w.author ? ` · ${esc(w.author)}` : ''}${w.link ? ` · <a href="${esc(w.link)}" target="_blank" rel="noopener">打开</a>` : ''}</div>
          </div>
        </div>`).join('')}
  `;
}

function showComments(r, title) {
  view.innerHTML = `
    <button class="btn ghost" data-act="back">← 返回</button>
    <div class="sec-title">评论挖掘：${esc(title)} <span class="badge">${r.comments.length} 条</span></div>
    <div style="font-size:13px;color:var(--muted);margin-bottom:8px">本次已调用 ${r.usage.requests} 次，约 $${Number(r.usage.costUsd || 0).toFixed(4)}</div>
    ${r.comments.length === 0
      ? `<div class="empty">暂无评论</div>`
      : r.comments.map((c, i) => `
        <div class="card topic">
          <div class="rank">${i + 1}</div>
          <div class="body"><div class="title" style="font-weight:400;font-size:14px">${esc(c)}</div></div>
        </div>`).join('')}
  `;
}

async function renderRedFoxSearch() {
  const s = await api('/api/settings');
  view.innerHTML = `
    <button class="btn ghost" data-act="back">← 返回</button>
    <div class="sec-title">红狐关键词搜索（免费）</div>
    <div class="card">
      ${!s.redfoxKey ? `<div class="error-box">未配置红狐 API Key：请到「设置 → 数据源设置」填写（redfox.hk 注册免费领取）。</div>` : ''}
      <div class="field">
        <label>关键词（例如：护肤、宠物、AI 工具）</label>
        <input id="rf-keyword" placeholder="输入想研究的选题关键词">
      </div>
      <div class="field">
        <label>页数（每页约 50 条）</label>
        <select id="rf-pages">
          <option value="1">1 页</option>
          <option value="2">2 页</option>
          <option value="3">3 页</option>
        </select>
      </div>
      <button class="btn primary" id="rf-submit" style="width:100%">免费搜索</button>
    </div>
    <div id="rf-result"></div>
  `;
  $('#rf-submit').addEventListener('click', async () => {
    const keyword = $('#rf-keyword').value.trim();
    if (!keyword) return toast('请输入关键词');
    const btn = $('#rf-submit');
    btn.disabled = true;
    btn.textContent = '搜索中…';
    try {
      const r = await api('/api/redfox/search', {
        method: 'POST',
        body: JSON.stringify({ keyword, pages: Number($('#rf-pages').value) || 1 }),
      });
      renderRedFoxResults(r);
    } catch (err) {
      $('#rf-result').innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = '免费搜索';
    }
  });
}

function renderRedFoxResults(r) {
  $('#rf-result').innerHTML = `
    <div class="sec-title">「${esc(r.keyword)}」搜索结果 <span class="badge">${r.items.length} 条</span></div>
    <div style="font-size:13px;color:var(--muted);margin-bottom:8px">免费数据源，不消耗 TikHub 额度</div>
    ${r.items.length === 0
      ? `<div class="empty">没有结果，换个关键词试试</div>`
      : r.items.map((w, i) => `
        <div class="card topic" data-act="rf-dissect" data-title="${esc(w.title)}" data-url="${esc(w.link)}" data-author="${esc(w.author || '')}">
          <div class="rank">${i + 1}</div>
          <div class="body">
            <div class="title">${esc(w.title)}</div>
            <div class="meta">点赞 ${esc(w.heat || '-')}${w.author ? ` · ${esc(w.author)}` : ''}${w.link ? ` · <a href="${esc(w.link)}" target="_blank" rel="noopener">打开</a>` : ''}</div>
          </div>
        </div>`).join('')}
  `;
}

async function renderPongfi() {
  const s = await api('/api/settings');
  const reports = await api('/api/pongfi/reports').catch(() => []);
  view.innerHTML = `
    <button class="btn ghost" data-act="back">← 返回</button>
    <div class="sec-title">Pongfi 赛道研究</div>
    <div class="card">
      ${s.tikhubEnabled !== '1' || !s.aiKey ? `<div class="error-box">需要先配置：TikHub（设置 → TikHub 数据源）和 AI Key（DeepSeek），才能生成研究报告。</div>` : ''}
      <div class="field"><label>研究赛道/主题（例如：护肤、宠物、AI 工具）</label><input id="pf-topic" placeholder="输入想研究的赛道"></div>
      <div class="field">
        <label>平台</label>
        <select id="pf-platform">
          <option value="both">抖音 + 小红书</option>
          <option value="douyin">仅抖音</option>
          <option value="xhs">仅小红书</option>
        </select>
      </div>
      <div class="field">
        <label>搜索页数（每页约 20 条，越多越贵）</label>
        <select id="pf-pages"><option value="1">1 页</option><option value="2">2 页</option></select>
      </div>
      <div class="field">
        <label>每条爆款采样评论数</label>
        <select id="pf-comments"><option value="3">3 条</option><option value="5">5 条</option><option value="10">10 条</option></select>
      </div>
      <button class="btn primary" id="pf-submit" style="width:100%">预估费用并开始研究</button>
      <div id="pf-status" style="font-size:13px;color:var(--muted);margin-top:8px"></div>
    </div>
    <div id="pf-result"></div>
    ${reports.length ? `
    <div class="sec-title">研究记录</div>
    ${reports.map((r) => `
      <div class="card topic" data-act="pongfi-report" data-id="${r.id}">
        <div class="body">
          <div class="title">${esc(r.topic)}</div>
          <div class="meta">${esc((r.platforms || []).map((p) => (p === 'xhs' ? '小红书' : '抖音')).join('+'))} · ${r.requests} 次 · $${Number(r.cost_usd || 0).toFixed(4)} · ${esc(String(r.created_at || '').slice(0, 16).replace('T', ' '))}</div>
        </div>
      </div>`).join('')}` : ''}
  `;
  $('#pf-submit').addEventListener('click', async () => {
    const topic = $('#pf-topic').value.trim();
    if (!topic) return toast('请输入研究赛道/主题');
    const sel = $('#pf-platform').value;
    const platforms = sel === 'both' ? ['douyin', 'xhs'] : [sel];
    const pages = Number($('#pf-pages').value) || 1;
    const commentsLimit = Number($('#pf-comments').value) || 5;
    const ok = await confirmTikHub('pongfi', { pages, platforms, commentsLimit });
    if (!ok) return;
    const btn = $('#pf-submit');
    btn.disabled = true;
    btn.textContent = '研究中（抓数据 + 生成报告，约 1-3 分钟）…';
    try {
      const r = await api('/api/pongfi/research', {
        method: 'POST',
        body: JSON.stringify({ topic, platforms, pages, commentsLimit }),
      });
      renderPongfiReport(r.report, r.usage);
    } catch (err) {
      $('#pf-status').innerHTML = `<span style="color:#d33">${esc(err.message)}</span>`;
    } finally {
      btn.disabled = false;
      btn.textContent = '预估费用并开始研究';
    }
  });
}

function renderPongfiReport(report, usage) {
  view.innerHTML = `
    <button class="btn ghost" data-act="back">← 返回</button>
    <div class="sec-title">${esc(report.topic)} 研究报告 <span class="badge">${esc((report.platforms || []).map((p) => (p === 'xhs' ? '小红书' : '抖音')).join('+'))}</span></div>
    <div style="font-size:13px;color:var(--muted);margin-bottom:10px">${usage ? `本次调用 ${usage.requests} 次 TikHub 请求，约 $${Number(usage.costUsd || 0).toFixed(4)} · ` : ''}${esc(String(report.created_at || '').slice(0, 16).replace('T', ' '))}</div>
    <div class="card">${mdHtml(report.content)}</div>
  `;
}

function mdHtml(md) {
  const lines = String(md || '').split(/\r?\n/);
  let html = '';
  let inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^### /.test(line)) { closeList(); html += `<h4>${esc(line.slice(4))}</h4>`; }
    else if (/^## /.test(line)) { closeList(); html += `<h3>${esc(line.slice(3))}</h3>`; }
    else if (/^# /.test(line)) { closeList(); html += `<h2>${esc(line.slice(2))}</h2>`; }
    else if (/^[-*] /.test(line)) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${esc(line.slice(2))}</li>`; }
    else if (/^\s*\d+[.、] /.test(line)) { closeList(); html += `<p>${esc(line.trim())}</p>`; }
    else if (line.trim() === '') { closeList(); }
    else { closeList(); html += `<p>${esc(line)}</p>`; }
  }
  closeList();
  return html;
}

async function renderSettings() {
  const cats = await api('/api/categories');
  const s = await api('/api/settings');
  view.innerHTML = `
    <button class="btn ghost" data-act="back">← 返回</button>
    <div class="sec-title">AI 设置</div>
    <div class="card">
      <div class="field"><label>API 地址</label><input id="s-base" value="${esc(s.aiBaseUrl)}"></div>
      <div class="field"><label>模型</label><input id="s-model" value="${esc(s.aiModel)}"></div>
      <div class="field"><label>API Key</label><input id="s-key" type="password" value="${esc(s.aiKey)}" placeholder="DeepSeek 等平台创建的 Key"></div>
      <div class="settings-row">
        <label style="font-size:13px;color:var(--muted)">每日自动拆解</label>
        <input type="checkbox" id="s-auto" ${s.autoDissect === '1' ? 'checked' : ''}>
      </div>
      <button class="btn primary" id="s-save" style="width:100%">保存设置</button>
    </div>
    <div class="sec-title">数据源设置</div>
    <div class="card">
      <div class="field">
        <label>抖音数据源</label>
        <select id="s-dy-source">
          <option value="redfox" ${s.douyinSource === 'redfox' ? 'selected' : ''}>红狐 · 分领域爆款视频榜（推荐）</option>
          <option value="redfox-hot" ${s.douyinSource === 'redfox-hot' ? 'selected' : ''}>红狐 · 近7天/近30天热点趋势</option>
          <option value="douyin-cli" ${s.douyinSource === 'douyin-cli' ? 'selected' : ''}>douyin-cli · 抖音视频榜（无需 Key）</option>
          <option value="60s" ${s.douyinSource === '60s' ? 'selected' : ''}>免费话题榜（60s API）</option>
          <option value="tikhub" ${s.douyinSource === 'tikhub' ? 'selected' : ''}>TikHub 热榜 · 按量付费（需开启）</option>
        </select>
      </div>
      <div class="field">
        <label>红狐 API Key（redfox.hk 注册免费领取）</label>
        <input id="s-redfox" type="password" value="${esc(s.redfoxKey)}" placeholder="ak_xxx">
      </div>
      <div class="field">
        <label>红狐热点趋势天数（用「红狐 · 热点趋势」源时生效）</label>
        <select id="s-rf-days">
          <option value="7" ${s.redfoxHotDays === '7' ? 'selected' : ''}>近 7 天</option>
          <option value="30" ${s.redfoxHotDays === '30' ? 'selected' : ''}>近 30 天</option>
        </select>
      </div>
      <div class="field">
        <label>douyin-cli 路径</label>
        <input id="s-cli" value="${esc(s.douyinCliPath)}">
      </div>
      <div class="field">
        <label>小红书数据源</label>
        <select id="s-xhs-source">
          <option value="60s" ${s.xhsSource === '60s' ? 'selected' : ''}>免费话题榜（60s API）</option>
        </select>
      </div>
      <div class="field"><label>免费话题榜地址（60s）</label><input id="s-hot" value="${esc(s.hotlistBaseUrl)}"></div>
    </div>
    <div class="sec-title">TikHub 数据源（可选 · 按量付费）</div>
    <div class="card">
      <div class="settings-row">
        <label style="font-size:13px;color:var(--muted)">开启 TikHub（关闭时不调用、不扣费）</label>
        <input type="checkbox" id="s-tk-enabled" ${s.tikhubEnabled === '1' ? 'checked' : ''}>
      </div>
      <div class="field"><label>API Key（user.tikhub.io 注册获取，勿泄露）</label><input id="s-tk-key" type="password" value="${esc(s.tikhubKey)}" placeholder="TIKHUB_API_KEY"></div>
      <div class="field"><label>接口地址（官方默认，自建镜像才改）</label><input id="s-tk-base" value="${esc(s.tikhubBaseUrl)}"></div>
      <div class="field"><label>单价 USD/次（默认 0.001，按实际账单为准）</label><input id="s-tk-price" value="${esc(s.tikhubPricePerRequest)}"></div>
      <div class="field">
        <label>抖音 TikHub 榜单类型</label>
        <select id="s-tk-board">
          <option value="video" ${s.tikhubDouyinBoard === 'video' ? 'selected' : ''}>视频热榜</option>
          <option value="lowfan" ${s.tikhubDouyinBoard === 'lowfan' ? 'selected' : ''}>低粉爆款榜（找潜力选题）</option>
          <option value="highlike" ${s.tikhubDouyinBoard === 'highlike' ? 'selected' : ''}>高点赞率榜（点赞超多）</option>
          <option value="highplay" ${s.tikhubDouyinBoard === 'highplay' ? 'selected' : ''}>高完播率榜（看完率超高）</option>
        </select>
      </div>
      <div class="settings-row">
        <label style="font-size:13px;color:var(--muted)">拆解时自动拉取真实数据 + 评论（约 2 次请求/条）</label>
        <input type="checkbox" id="s-tk-enhance" ${s.tikhubEnhanceDissect === '1' ? 'checked' : ''}>
      </div>
      <div class="field"><label>拆解时拉取评论条数</label><input id="s-tk-comments" value="${esc(s.tikhubMaxComments)}"></div>
      <button class="btn primary" id="s-tk-save" style="width:100%">保存 TikHub 设置</button>
      <div class="sec-title" style="margin-top:14px">今日 TikHub 用量</div>
      <div id="tk-usage" style="font-size:13px;color:var(--muted)">加载中…</div>
    </div>
    <div class="sec-title">领域管理</div>
    <div class="card">
      ${cats.map((c) => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <input data-cat-name="${c.id}" value="${esc(c.name)}" style="flex:1;padding:8px;border:1px solid var(--line);border-radius:8px">
          <button class="btn" data-act="cat-del" data-id="${c.id}">删</button>
        </div>`).join('')}
      <div style="display:flex;gap:6px;margin-top:10px">
        <input id="new-cat" placeholder="新领域名" style="flex:1;padding:8px;border:1px solid var(--line);border-radius:8px">
        <button class="btn primary" id="cat-add">添加</button>
      </div>
    </div>
  `;
  $('#s-save').addEventListener('click', async () => {
    await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({
        aiBaseUrl: $('#s-base').value.trim(),
        aiModel: $('#s-model').value.trim(),
        aiKey: $('#s-key').value.trim(),
        hotlistBaseUrl: $('#s-hot').value.trim(),
        autoDissect: $('#s-auto').checked ? '1' : '0',
        douyinSource: $('#s-dy-source').value,
        xhsSource: $('#s-xhs-source').value,
        redfoxKey: $('#s-redfox').value.trim(),
        redfoxHotDays: $('#s-rf-days').value,
        douyinCliPath: $('#s-cli').value.trim(),
      }),
    });
    toast('设置已保存');
  });
  $('#cat-add').addEventListener('click', async () => {
    const name = $('#new-cat').value.trim();
    if (!name) return;
    await api('/api/categories', { method: 'POST', body: JSON.stringify({ name, keywords: [], sort: 99 }) });
    renderSettings();
  });
  document.querySelectorAll('[data-act="cat-del"]').forEach((el) => {
    el.addEventListener('click', async () => {
      await api(`/api/categories/${el.dataset.id}`, { method: 'DELETE' });
      renderSettings();
    });
  });
  document.querySelectorAll('[data-cat-name]').forEach((el) => {
    el.addEventListener('change', async () => {
      await api(`/api/categories/${el.dataset.catName}`, {
        method: 'PUT',
        body: JSON.stringify({ name: el.value.trim() }),
      });
    });
  });
  $('#s-tk-save').addEventListener('click', async () => {
    await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({
        tikhubKey: $('#s-tk-key').value.trim(),
        tikhubEnabled: $('#s-tk-enabled').checked ? '1' : '0',
        tikhubBaseUrl: $('#s-tk-base').value.trim(),
        tikhubPricePerRequest: $('#s-tk-price').value.trim(),
        tikhubDouyinBoard: $('#s-tk-board').value,
        tikhubEnhanceDissect: $('#s-tk-enhance').checked ? '1' : '0',
        tikhubMaxComments: $('#s-tk-comments').value.trim(),
      }),
    });
    toast('TikHub 设置已保存');
    renderSettings();
  });
  (async () => {
    try {
      const u = await api('/api/tikhub/usage');
      const rows = (u.rows || []).slice(0, 8).map((r) =>
        `<li>${esc(r.feature)} · ${r.requests} 次 · $${Number(r.cost_usd || 0).toFixed(4)} · ${esc(String(r.ts || '').slice(11, 19))}</li>`
      ).join('');
      $('#tk-usage').innerHTML = `今日共 ${u.requests} 次请求，约 $${Number(u.costUsd || 0).toFixed(4)}${rows ? `<ul style="margin-top:6px;padding-left:18px">${rows}</ul>` : ''}`;
    } catch (e) {
      $('#tk-usage').textContent = '用量加载失败';
    }
  })();
}

view.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'platform') { state.platform = el.dataset.v; renderHome(); }
  if (act === 'category') { state.categoryId = Number(el.dataset.v) || ''; renderHome(); }
  if (act === 'topic') {
    const t = state.topics[Number(el.dataset.i)];
    if (t) showTopic(t);
  }
  if (act === 'source') {
    if (el.dataset.v === 'tikhub') {
      const ok = await confirmTikHub('hotlist');
      if (!ok) return;
    }
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ douyinSource: el.dataset.v }) });
    toast('数据源已切换，正在刷新…');
    await refreshTopics(false);
    await renderHome();
  }
  if (act === 'board') {
    const ok = await confirmTikHub('hotlist');
    if (!ok) return;
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ tikhubDouyinBoard: el.dataset.v }) });
    toast('榜单类型已切换，正在刷新…');
    await refreshTopics(false);
    await renderHome();
  }
  if (act === 'dissect-topic') {
    renderDissect({ title: el.dataset.title, platform: state.platform });
  }
  if (act === 'dissect-work') {
    const w = state.creatorWorks[Number(el.dataset.i)];
    if (w) renderDissect({ title: w.title, url: w.link, author: state.creatorName, platform: 'douyin' });
  }
  if (act === 'back') { renderHome(); }
  if (act === 'analysis') { renderDetail(el.dataset.id); }
  if (act === 'fav') {
    await api(`/api/analyses/${el.dataset.id}/favorite`, {
      method: 'POST', body: JSON.stringify({ favorite: el.dataset.fav === '1' }),
    });
    renderDetail(el.dataset.id);
  }
  if (act === 'redissect') {
    const a = await api(`/api/analyses/${el.dataset.id}`);
    renderDissect({ title: a.videoTitle, url: a.url, platform: a.platform });
  }
  if (act === 'retry') {
    const a = await api(`/api/analyses/${el.dataset.id}`);
    renderDissect({ title: a.videoTitle, url: a.url, platform: a.platform });
  }
  if (act === 'tk-comments') {
    const url = el.dataset.link;
    if (!url) return toast('该话题没有可用链接');
    const ok = await confirmTikHub('comments');
    if (!ok) return;
    try {
      const r = await api('/api/tikhub/comments', {
        method: 'POST',
        body: JSON.stringify({ platform: state.platform, url, limit: Number(state.settings.tikhubMaxComments) || 10 }),
      });
      showComments(r, el.dataset.title || '评论挖掘');
    } catch (err) {
      toast(err.message);
    }
  }
  if (act === 'tk-detail') {
    const url = el.dataset.link;
    if (!url) return toast('该话题没有可用链接');
    const ok = await confirmTikHub('detail');
    if (!ok) return;
    try {
      const r = await api('/api/tikhub/detail', {
        method: 'POST',
        body: JSON.stringify({ platform: state.platform, url }),
      });
      showStats(r, el.dataset.title || '数据详情');
    } catch (err) {
      toast(err.message);
    }
  }
  if (act === 'tk-comments-detail') {
    const a = state.currentAnalysis;
    if (!a) return;
    const url = a.url || (a.videoId
      ? (a.platform === 'xhs' ? `https://www.xiaohongshu.com/explore/${a.videoId}` : `https://www.douyin.com/video/${a.videoId}`)
      : '');
    if (!url) return toast('没有可用链接');
    const ok = await confirmTikHub('comments');
    if (!ok) return;
    try {
      const r = await api('/api/tikhub/comments', {
        method: 'POST',
        body: JSON.stringify({ platform: a.platform, url, limit: Number(state.settings.tikhubMaxComments) || 10 }),
      });
      showComments(r, a.videoTitle || '评论挖掘');
    } catch (err) {
      toast(err.message);
    }
  }
  if (act === 'tk-dissect') {
    renderDissect({ platform: el.dataset.platform, title: el.dataset.title, url: el.dataset.url, author: el.dataset.author });
  }
  if (act === 'rf-dissect') {
    renderDissect({ platform: 'douyin', title: el.dataset.title, url: el.dataset.url, author: el.dataset.author });
  }
  if (act === 'sim-dissect') {
    renderDissect({ platform: 'douyin', title: el.dataset.title, url: el.dataset.url, author: el.dataset.author });
  }
  if (act === 'pongfi-report') {
    try {
      const r = await api(`/api/pongfi/reports/${el.dataset.id}`);
      renderPongfiReport(r);
    } catch (err) {
      toast(err.message);
    }
  }
});

$('#btn-refresh').addEventListener('click', () => refreshTopics());
$('#btn-dissect').addEventListener('click', () => renderDissect());
$('#btn-creator').addEventListener('click', () => renderCreator());
$('#btn-tk-search').addEventListener('click', () => renderTikHubSearch());
$('#btn-rf-search').addEventListener('click', () => renderRedFoxSearch());
$('#btn-pongfi').addEventListener('click', () => renderPongfi());
$('#btn-analyses').addEventListener('click', () => renderAnalyses());
$('#btn-settings').addEventListener('click', () => renderSettings());

renderHome().catch((err) => toast(err.message));
